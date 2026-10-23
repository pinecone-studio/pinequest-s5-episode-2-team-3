#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <HTTPClient.h>
#include <HX711.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <esp_timer.h>
#include <sys/time.h>
#include "config.h"
#include "intake.h"
#include "payload.h"
#include "queue.h"
#include "screen.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill in Wi-Fi and the device token."
#endif

// Calibration persists across restarts: raw = offset + grams * factor.
struct Calibration { long offset = 0; float factor = 0; bool valid() const { return factor != 0; } };

HX711 scale;
Preferences prefs;
Calibration calibration;
long lastRaw = 0;
dusal::IntakeTracker tracker;
dusal::DrinkQueue queue;
uint32_t bootId = 0;
uint32_t drinkCount = 0;
uint32_t readingCount = 0;
uint32_t rejected = 0;
bool clockValid = false;
bool networkEnabled = false;
uint32_t nextUploadMs = 0;
uint32_t backoffMs = 0;
uint32_t lastReadingMs = 0;
int lastSentRemaining = -2;
int lastDrinkMl = 0;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool hasDisplay = false;

uint64_t uptimeMs() { return static_cast<uint64_t>(esp_timer_get_time() / 1000); }

// UTC from NTP; anything before 2023-11 means the clock was never set.
bool epochMs(int64_t& out) {
  timeval now;
  gettimeofday(&now, nullptr);
  if (now.tv_sec < 1700000000) return false;
  out = static_cast<int64_t>(now.tv_sec) * 1000 + now.tv_usec / 1000;
  return true;
}

void saveCalibration() {
  prefs.putLong("offset", calibration.offset);
  prefs.putFloat("factor", calibration.factor);
}

// Averages a few readings so calibration does not depend on one noisy sample. False if the HX711 is silent.
bool averageRaw(int samples, long& out) {
  long long sum = 0;
  for (int i = 0; i < samples; i++) {
    const uint32_t start = millis();
    while (!scale.is_ready()) {
      if (millis() - start > 1000) { Serial.println("HX711 not responding: check DT/SCK wiring and power"); return false; }
      delay(5);
    }
    sum += scale.read();
  }
  out = static_cast<long>(sum / samples);
  return true;
}

void zeroScale() {
  if (!averageRaw(20, calibration.offset)) return;
  saveCalibration();
  Serial.printf("zero set: offset=%ld\n", calibration.offset);
}

void calibrate(float knownGrams) {
  long raw;
  if (knownGrams <= 0) { Serial.println("usage: cal <grams of the known weight on the base>"); return; }
  if (!averageRaw(20, raw)) return;
  calibration.factor = (raw - calibration.offset) / knownGrams;
  saveCalibration();
  Serial.printf("factor set: %.4f raw/g\n", calibration.factor);
}

float grams(long raw) { return (raw - calibration.offset) / calibration.factor; }

// Keep the empty-bottle weight across restarts; a swapped bottle clears it.
void persistTare() {
  if (tracker.hasTare()) prefs.putFloat("tare", tracker.tareG());
  else prefs.remove("tare");
}

void tareBottle() {
  if (!tracker.tareBottle()) { Serial.println("tare: put the empty bottle on the base and wait until it is still"); return; }
  persistTare();
  Serial.printf("tare: empty bottle %.0f g\n", tracker.tareG());
}

// The queue is written to flash on every change, so a drink is never lost to a restart.
void saveQueue() {
  static uint8_t blob[dusal::DrinkQueue::kMaxBytes];
  const size_t length = queue.serialize(blob, sizeof blob);
  if (!length || prefs.putBytes("queue", blob, length) != length) Serial.println("could not save the drink queue");
}

void loadQueue() {
  static uint8_t blob[dusal::DrinkQueue::kMaxBytes];
  const size_t length = prefs.getBytesLength("queue");
  if (!length) return;
  if (length > sizeof blob || prefs.getBytes("queue", blob, length) != length || !queue.deserialize(blob, length)) {
    Serial.println("stored drink queue was unreadable; starting empty");
    return;
  }
  Serial.printf("%u unsent drinks restored\n", static_cast<unsigned>(queue.size()));
}

void recordDrink(int amountMl) {
  dusal::Drink drink;
  drink.boot = bootId;
  drink.n = ++drinkCount;
  drink.amountMl = static_cast<uint16_t>(amountMl);
  int64_t now;
  drink.timed = epochMs(now);
  drink.atMs = drink.timed ? now : static_cast<int64_t>(uptimeMs());
  queue.push(drink);
  saveQueue();
  lastDrinkMl = amountMl;
}

void onChange(const dusal::Update& update) {
  switch (update.change) {
    case dusal::Change::Placed: Serial.printf("placed %d g\n", tracker.settledG()); break;
    case dusal::Change::Drink: Serial.printf("drink %d ml\n", update.amountMl); recordDrink(update.amountMl); break;
    case dusal::Change::Refill: Serial.printf("refill %d ml\n", update.amountMl); break;
    case dusal::Change::Swapped: Serial.println("different bottle: tare cleared"); persistTare(); break;
    default: break;
  }
}

// Returns the HTTP status, or a negative HTTPClient error when the server could not be reached.
int post(const char* path, const char* body, int length) {
  WiFiClientSecure client;
  if (API_ROOT_CA[0]) client.setCACert(API_ROOT_CA);
  else client.setInsecure();  // Prototype only; see secrets.example.h.
  HTTPClient http;
  http.setTimeout(8000);
  const String url = String(API_BASE_URL) + "/api/devices/" + DEVICE_ID + "/" + path;
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  const int status = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body)), length);
  http.end();
  return status;
}

// Oldest drink first, one at a time; it leaves the queue only after the server answers.
void uploadDrinks() {
  if (queue.empty() || static_cast<int32_t>(millis() - nextUploadMs) < 0) return;
  char body[256];
  const int length = dusal::drinkJson(body, sizeof body, DEVICE_ID, *queue.front());
  const int status = length < 0 ? 400 : post("events", body, length);
  if (status >= 200 && status < 300) {
    queue.pop();
    saveQueue();
    backoffMs = 0;
    nextUploadMs = millis() + 200;
  } else if (status == 400 || status == 409 || status == 413) {
    // The server will never accept this body; keeping it would block every later drink.
    Serial.printf("drink rejected by server (%d), dropped: %s\n", status, length < 0 ? "(invalid)" : body);
    rejected++;
    queue.pop();
    saveQueue();
  } else {
    // 401 (wrong token), 5xx or no connection: keep the drink and retry later with the same ID.
    backoffMs = !backoffMs ? 5000 : backoffMs >= MAX_BACKOFF_MS / 2 ? MAX_BACKOFF_MS : backoffMs * 2;
    nextUploadMs = millis() + backoffMs;
    Serial.printf("upload failed (%d), retry in %lu s\n", status, static_cast<unsigned long>(backoffMs / 1000));
  }
}

// Status for the app: every 15 s, and soon after the remaining water changes. Not queued: only the latest matters.
void sendReading() {
  const int remaining = tracker.remainingMl();
  const bool due = millis() - lastReadingMs >= READING_INTERVAL_MS;
  const bool changed = remaining != lastSentRemaining && millis() - lastReadingMs >= 1000;
  if (!due && !changed) return;
  int64_t now;
  if (!epochMs(now)) return;
  char body[256];
  const int length = dusal::readingJson(body, sizeof body, DEVICE_ID, bootId, ++readingCount, now, remaining, tracker.capacityMl());
  lastReadingMs = millis();
  if (length < 0) return;
  const int status = post("readings", body, length);
  if (status >= 200 && status < 300) lastSentRemaining = remaining;
  else Serial.printf("status upload failed (%d)\n", status);
}

void updateNetwork() {
  if (!networkEnabled || WiFi.status() != WL_CONNECTED) return;
  int64_t now;
  if (!clockValid && epochMs(now)) {
    clockValid = true;
    queue.stampTimes(bootId, uptimeMs(), now);
    saveQueue();
    Serial.println("clock set from NTP");
  }
  if (!clockValid) return;
  uploadDrinks();
  sendReading();
}

void drawScreen() {
  static uint32_t lastDraw = 0;
  if (!hasDisplay || millis() - lastDraw < 500) return;
  lastDraw = millis();
  dusal::ScreenState state;
  state.calibrated = calibration.valid();
  state.phase = tracker.phase();
  state.remainingMl = tracker.remainingMl();
  state.hasTare = tracker.hasTare();
  state.lastDrinkMl = lastDrinkMl;
  state.wifi = WiFi.status() == WL_CONNECTED;
  state.clock = clockValid;
  state.unsent = queue.size();
  state.dropped = queue.dropped();
  const dusal::ScreenLines lines = dusal::renderScreen(state);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.print(lines.big);
  display.setTextSize(1);
  for (int i = 0; i < 3; i++) { display.setCursor(0, 32 + i * 11); display.print(lines.line[i]); }
  display.display();
}

void printStatus() {
  Serial.printf("boot %lu | wifi %s | clock %s | unsent %u | dropped %lu | rejected %lu | remaining %d ml\n",
                static_cast<unsigned long>(bootId), WiFi.status() == WL_CONNECTED ? "ok" : "off", clockValid ? "ok" : "not set",
                static_cast<unsigned>(queue.size()), static_cast<unsigned long>(queue.dropped()),
                static_cast<unsigned long>(rejected), tracker.remainingMl());
  Serial.printf("now %.1f g | settled %d g | phase %d (0 moving, 1 empty, 2 present) | tare %s %.1f g | offset %ld factor %.4f\n",
                grams(lastRaw), tracker.settledG(), static_cast<int>(tracker.phase()), tracker.hasTare() ? "yes" : "no",
                tracker.tareG(), calibration.offset, calibration.factor);
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "zero") zeroScale();
  else if (line.startsWith("cal ")) calibrate(line.substring(4).toFloat());
  else if (line == "raw") Serial.printf("raw=%ld\n", lastRaw);
  else if (line == "tare") tareBottle();
  else if (line == "status") printStatus();
  else Serial.println("commands: zero | cal <grams> | raw | tare | status");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  prefs.begin("dusal");
  bootId = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootId);
  calibration.offset = prefs.getLong("offset", 0);
  calibration.factor = prefs.getFloat("factor", 0);
  if (prefs.isKey("tare")) tracker.restoreTare(prefs.getFloat("tare", 0));
  loadQueue();
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  hasDisplay = display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS);
  if (!hasDisplay) Serial.println("OLED not found: check SDA/SCL and the I2C address; continuing without it");
  Serial.println(calibration.valid() ? "calibrated" : "not calibrated: empty base -> 'zero', then known weight -> 'cal <grams>'");

  networkEnabled = dusal::validDeviceId(DEVICE_ID);
  if (!networkEnabled) { Serial.println("DEVICE_ID must be 1-40 letters, digits or '-'; uploads disabled"); return; }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  handleSerial();
  // Short press: tare the empty bottle. Hold LONG_PRESS_MS on an empty base: zero the scale.
  static uint32_t pressedAt = 0;
  const bool down = digitalRead(PIN_BUTTON) == LOW;
  if (down && !pressedAt) pressedAt = millis();
  if (pressedAt && down && millis() - pressedAt >= LONG_PRESS_MS) {
    zeroScale();
    while (digitalRead(PIN_BUTTON) == LOW) delay(10);
    pressedAt = 0;
  } else if (pressedAt && !down) {
    if (millis() - pressedAt >= 50) tareBottle();
    pressedAt = 0;
  }

  updateNetwork();
  drawScreen();

  static uint32_t lastSample = 0;
  if (millis() - lastSample < SAMPLE_INTERVAL_MS || !scale.is_ready()) return;
  lastSample = millis();
  lastRaw = scale.read();
  if (!calibration.valid()) return;
  onChange(tracker.feed(grams(lastRaw), millis()));
}
