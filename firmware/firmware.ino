// Smart base: 5 kg load cell + HX711 + ESP32-WROOM-32 + 128x64 I2C OLED (NFP1315) + Bluetooth LE.
// Shows the weight, counts drinks itself (a settled drop of 100 g or more) and hands them to the phone app
// over BLE. Drinks wait in flash until the app confirms them, so none are lost while the phone is away.
// Arduino IDE: board "ESP32 Dev Module", libraries "HX711 Arduino Library" (Bogdan Necula) and "U8g2" (oliver).
// Not "HX711" by Rob Tillaart: same class name, different API. BLE comes with the esp32 core.
#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <HX711.h>
#include <Preferences.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <esp_timer.h>

// ---------- Settings ----------
// Wiring for an ESP32-WROOM-32 DevKit. Change these if your board is wired differently.
const int PIN_HX711_DT = 16;
const int PIN_HX711_SCK = 4;
const int PIN_OLED_SDA = 21;
const int PIN_OLED_SCL = 22;
// The BOOT button exists on every DevKit. Nothing on the scale: zero it. Empty bottle on it: remember the bottle.
const int PIN_BUTTON = 0;

// NFP1315 modules are 0.96" SSD1306 128x64. If the picture is shifted, has a noisy strip on one edge or
// stays dark while the address is found, the module is an SH1106: use the second line instead.
using OledDisplay = U8G2_SSD1306_128X64_NONAME_F_HW_I2C;
// using OledDisplay = U8G2_SH1106_128X64_NONAME_F_HW_I2C;
// Most modules answer at 0x3C, some at 0x3D (the serial log lists what it finds).
const uint8_t OLED_I2C_ADDRESS = 0x3C;

const float MAX_LOAD_G = 5000;         // load cell rating; above this the screen shows OVER
const int SMOOTHING_SAMPLES = 10;      // moving average; the HX711 gives 10 samples/s, so about 1 s
const int TARE_SAMPLES = 20;           // tare and calibration average 2 s of readings
const uint32_t SCREEN_INTERVAL_MS = 200;

// Drink detection, same thresholds as shared/device.ts. 1 g of water = 1 ml.
const float PRESENT_MIN_G = 30;        // below this the base is empty (bottle lifted)
const float STABLE_BAND_G = 15;        // the last second of samples must agree this closely
const uint32_t SETTLE_MS = 1500;       // ...for this long before the weight counts as settled
const int MEASUREMENTS = 4;            // then this many 1 s averages, 200 ms apart, are averaged
const uint32_t MEASURE_GAP_MS = 200;
const int MIN_DRINK_ML = 100;          // smallest settled drop that is a drink; smaller sips add up
const int MIN_REFILL_ML = 20;          // smallest settled rise that is a refill
const int MAX_CHANGE_ML = 5000;        // a bigger jump is a different bottle, not a drink

const int QUEUE_CAPACITY = 64;         // unconfirmed drinks kept in flash; when full the oldest is dropped
const uint32_t STATUS_INTERVAL_MS = 1000;  // live weight to the app
const uint32_t DRINK_RESEND_MS = 3000;     // the oldest drink is repeated until the app confirms it
// -------------------------------

// Bluetooth LE contract with the app; must match src/scale-protocol.ts.
#define SERVICE_UUID "d05a1000-6c2b-4b8e-9f3a-2f1e0c7a5b01"
#define STATUS_UUID  "d05a1001-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // read/notify, 9 bytes: see sendStatus()
#define DRINK_UUID   "d05a1002-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // read/notify, 14 bytes or empty: see putDrink()
#define ACK_UUID     "d05a1003-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // write, 8 bytes: boot + n of a saved drink
#define ID_UUID      "d05a1004-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // read, ASCII device ID, e.g. "dusal-a1b2"

HX711 scale;
Preferences prefs;
OledDisplay display(U8G2_R0, U8X8_PIN_NONE);
bool hasDisplay = false;

// grams = (raw - offset) / factor. The offset (empty scale) is taken at every power-up; the factor is stored in flash.
long offset = 0;
float factor = 0;
// Weight of the empty bottle, set with BOOT; the screen and the app show what is inside it. 0 = none.
float bottleG = 0;

long window[SMOOTHING_SAMPLES];
int windowFill = 0;
int windowIndex = 0;
uint32_t lastSampleMs = 0;

// Settling: a drink is judged only on a still, averaged weight, never while the bottle is moving.
enum Phase : uint8_t { MOVING, EMPTY, PRESENT };
Phase phase = MOVING;
bool inBand = false;
bool settled = false;
uint32_t bandSince = 0;
float measured[MEASUREMENTS];
int taken = 0;
uint32_t measuredAt = 0;
int settledG = 0;
// The weight the next drink or refill is measured against. Kept while the bottle is lifted.
bool hasAnchor = false;
int anchorG = 0;
int capacityMl = 0;  // most water seen since the bottle was set; the app draws the bottle with it

// A drink waiting for the app. boot + n is its fixed ID, so a resend is recognised as the same drink.
struct Drink {
  uint32_t boot;
  uint32_t n;
  uint16_t amountMl;
  uint32_t atSec;  // seconds since that power-up
};
Drink queue[QUEUE_CAPACITY];
int queued = 0;
uint32_t bootId = 0;
uint32_t drinkCount = 0;

char deviceId[16];
BLECharacteristic* statusChar = nullptr;
BLECharacteristic* drinkChar = nullptr;
// Set from the Bluetooth task, handled in loop().
volatile bool bleConnected = false;
volatile bool advertiseAgain = false;
volatile bool ackPending = false;
volatile uint32_t ackBoot = 0, ackN = 0;
uint32_t statusSentAt = 0;
uint32_t drinkSentAt = 0;  // 0: send the oldest drink now

bool calibrated() { return factor != 0; }
bool hx711Alive() { return windowFill > 0 && millis() - lastSampleMs < 1000; }
uint32_t uptimeSec() { return (uint32_t)(esp_timer_get_time() / 1000000); }

long smoothedRaw() {
  long long sum = 0;
  for (int i = 0; i < windowFill; i++) sum += window[i];
  return windowFill ? (long)(sum / windowFill) : 0;
}

float grams() { return (smoothedRaw() - offset) / factor; }

// After a tare the moving average starts from the new zero instead of sliding down to it.
void fillWindow(long raw) {
  for (int i = 0; i < SMOOTHING_SAMPLES; i++) window[i] = raw;
  windowFill = SMOOTHING_SAMPLES;
  windowIndex = 0;
  lastSampleMs = millis();
  inBand = settled = false;
}

// Averages readings straight from the HX711. False if it stops answering (DT/SCK wiring or power).
bool averageRaw(int samples, long& out) {
  long long sum = 0;
  for (int i = 0; i < samples; i++) {
    uint32_t start = millis();
    while (!scale.is_ready()) {
      if (millis() - start > 1000) { Serial.println("HX711 not responding: check DT/SCK wiring and power"); return false; }
      delay(5);
    }
    sum += scale.read();
  }
  out = (long)(sum / samples);
  return true;
}

void showMessage(const char* top, const char* bottom) {
  if (!hasDisplay) return;
  display.clearBuffer();
  display.setFont(u8g2_font_helvB12_tr);
  display.drawStr((128 - display.getStrWidth(top)) / 2, 28, top);
  display.setFont(u8g2_font_6x10_tr);
  display.drawStr((128 - display.getStrWidth(bottom)) / 2, 48, bottom);
  display.sendBuffer();
}

void tare() {
  showMessage("Tare...", "hudluhgui baina uu");
  long raw;
  if (!averageRaw(TARE_SAMPLES, raw)) return;
  offset = raw;
  fillWindow(raw);
  Serial.printf("tare: offset=%ld\n", offset);
}

void calibrate(float knownGrams) {
  if (knownGrams <= 0) { Serial.println("usage: cal <grams of the known weight on the scale>"); return; }
  showMessage("Kalibrovk...", "hudluhgui baina uu");
  long raw;
  if (!averageRaw(TARE_SAMPLES, raw)) return;
  if (raw == offset) { Serial.println("no change from zero: put the weight on after 'tare'"); return; }
  factor = (raw - offset) / knownGrams;
  prefs.putFloat("factor", factor);
  fillWindow(raw);
  Serial.printf("factor set: %.4f raw/g\n", factor);
}

// Water left in the bottle; -1 when unknown (no bottle set, lifted or moving).
int remainingMl() {
  if (bottleG < PRESENT_MIN_G || phase != PRESENT) return -1;
  return constrain((int)lroundf(settledG - bottleG), 0, MAX_CHANGE_ML);
}

void setBottle(float g) {
  bottleG = g;
  capacityMl = 0;
  prefs.putFloat("bottle", g);
  if (g > 0) Serial.printf("bottle: empty bottle %.0f g\n", g);
  else Serial.println("bottle: cleared");
}

// Short press of BOOT. Nothing on the scale: zero it. The empty bottle on it: remember its weight, so the
// screen shows only what is inside and the app can show the water left.
void pressBoot() {
  if (!calibrated() || grams() < PRESENT_MIN_G) { tare(); setBottle(0); return; }
  float g = settled && phase == PRESENT ? settledG : grams();
  setBottle(g);
  hasAnchor = true;
  anchorG = lroundf(g);
}

// ---------- Drink queue (flash) ----------

void saveQueue() {
  if (!queued) prefs.remove("queue");
  else if (prefs.putBytes("queue", queue, queued * sizeof(Drink)) != queued * sizeof(Drink)) Serial.println("could not save the drink queue");
}

void loadQueue() {
  size_t length = prefs.getBytesLength("queue");
  if (!length) return;
  if (length % sizeof(Drink) || length > sizeof queue || prefs.getBytes("queue", queue, length) != length) {
    Serial.println("stored drink queue was unreadable; starting empty");
    prefs.remove("queue");
    return;
  }
  queued = length / sizeof(Drink);
  Serial.printf("%d unsent drinks restored\n", queued);
}

void put32(uint8_t* p, uint32_t v) { for (int i = 0; i < 4; i++) p[i] = v >> (8 * i); }
void put16(uint8_t* p, uint16_t v) { p[0] = v; p[1] = v >> 8; }
uint32_t get32(const uint8_t* p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }

// The oldest unconfirmed drink: boot u32, n u32, amountMl u16, secondsAgo u32 (little-endian).
// secondsAgo is 0xFFFFFFFF for a drink from an earlier power-up: the scale has no clock to tell when.
// Empty when nothing is waiting.
void putDrink() {
  if (!drinkChar) return;
  if (!queued) { drinkChar->setValue((uint8_t*)"", 0); return; }
  const Drink& d = queue[0];
  uint8_t data[14];
  put32(data, d.boot);
  put32(data + 4, d.n);
  put16(data + 8, d.amountMl);
  put32(data + 10, d.boot == bootId ? uptimeSec() - d.atSec : 0xFFFFFFFF);
  drinkChar->setValue(data, sizeof data);
}

void recordDrink(int amountMl) {
  if (queued == QUEUE_CAPACITY) {
    memmove(queue, queue + 1, (QUEUE_CAPACITY - 1) * sizeof(Drink));
    queued--;
    Serial.println("drink queue full: oldest unsent drink dropped");
  }
  queue[queued++] = { bootId, ++drinkCount, (uint16_t)amountMl, uptimeSec() };
  saveQueue();
  putDrink();
  drinkSentAt = 0;
}

// The app saved this drink: forget it and offer the next one.
void confirmDrink(uint32_t boot, uint32_t n) {
  if (!queued || queue[0].boot != boot || queue[0].n != n) return;
  memmove(queue, queue + 1, (queued - 1) * sizeof(Drink));
  queued--;
  saveQueue();
  putDrink();
  drinkSentAt = 0;
  Serial.printf("drink %lu-%lu saved by the app, %d waiting\n", (unsigned long)boot, (unsigned long)n, queued);
}

// ---------- Drink detection ----------

// A settled weight against the anchor. Lifting the bottle never counts as drunk: the anchor waits for it.
void evaluate() {
  if (phase == EMPTY) return;
  if (!hasAnchor) {
    hasAnchor = true;
    anchorG = settledG;
    Serial.printf("placed %d g\n", settledG);
  } else {
    int delta = anchorG - settledG;
    if (delta < MIN_DRINK_ML && -delta < MIN_REFILL_ML) {
      // Noise or a small sip: keep the anchor so sips add up until they reach MIN_DRINK_ML.
    } else if (abs(delta) > MAX_CHANGE_ML) {
      Serial.println("different bottle");
      anchorG = settledG;
      setBottle(0);
    } else if (delta > 0) {
      Serial.printf("drink %d ml (%d -> %d g)\n", delta, anchorG, settledG);
      anchorG = settledG;
      recordDrink(delta);
    } else {
      Serial.printf("refill %d ml (%d -> %d g)\n", -delta, anchorG, settledG);
      anchorG = settledG;
    }
  }
  int left = remainingMl();
  if (left > capacityMl) capacityMl = left;
}

// Runs after every sample. Once the last second has stayed in band for SETTLE_MS, takes MEASUREMENTS
// averages a moment apart and settles on their mean, once per placement.
void track() {
  if (!calibrated() || windowFill < SMOOTHING_SAMPLES) return;
  long low = window[0], high = window[0];
  for (int i = 1; i < SMOOTHING_SAMPLES; i++) { low = min(low, window[i]); high = max(high, window[i]); }
  if ((high - low) / fabsf(factor) > STABLE_BAND_G) { inBand = settled = false; phase = MOVING; return; }
  uint32_t now = millis();
  if (!inBand) { inBand = true; bandSince = now; taken = 0; }
  if (settled || now - bandSince < SETTLE_MS) { if (!settled) phase = MOVING; return; }
  if (taken > 0 && now - measuredAt < MEASURE_GAP_MS) return;
  measured[taken++] = grams();
  measuredAt = now;
  if (taken < MEASUREMENTS) return;
  float total = 0;
  Serial.print("measured");
  for (int i = 0; i < taken; i++) { total += measured[i]; Serial.printf(" %.0f", measured[i]); }
  settled = true;
  settledG = lroundf(total / taken);
  Serial.printf(" -> %d g\n", settledG);
  phase = settledG < PRESENT_MIN_G ? EMPTY : PRESENT;
  evaluate();
}

// ---------- Bluetooth ----------

class ServerEvents : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleConnected = true; }
  void onDisconnect(BLEServer*) override { bleConnected = false; advertiseAgain = true; }
};

class AckEvents : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (c->getLength() != 8) return;
    const uint8_t* data = c->getData();
    ackBoot = get32(data);
    ackN = get32(data + 4);
    ackPending = true;
  }
};

void startBle() {
  uint64_t mac = ESP.getEfuseMac();
  uint8_t a = mac >> 32, b = mac >> 40;
  char name[16];
  snprintf(name, sizeof name, "Dusal-%02X%02X", a, b);
  snprintf(deviceId, sizeof deviceId, "dusal-%02x%02x", a, b);

  BLEDevice::init(name);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerEvents());
  BLEService* service = server->createService(SERVICE_UUID);
  statusChar = service->createCharacteristic(STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());
  drinkChar = service->createCharacteristic(DRINK_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  drinkChar->addDescriptor(new BLE2902());
  BLECharacteristic* ack = service->createCharacteristic(ACK_UUID, BLECharacteristic::PROPERTY_WRITE);
  ack->setCallbacks(new AckEvents());
  BLECharacteristic* id = service->createCharacteristic(ID_UUID, BLECharacteristic::PROPERTY_READ);
  id->setValue((uint8_t*)deviceId, strlen(deviceId));
  service->start();
  putDrink();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("bluetooth: advertising as %s (device ID %s)\n", name, deviceId);
}

// Live state for the app: flags u8 (bit0 calibrated, bit1 bottle set), phase u8 (0 moving, 1 empty, 2 present),
// weightG i16 (all on the scale), remainingMl i16 (-1 unknown), capacityMl u16, queued u8. Little-endian.
void sendStatus() {
  uint8_t data[9];
  data[0] = (calibrated() ? 1 : 0) | (bottleG >= PRESENT_MIN_G ? 2 : 0);
  data[1] = phase;
  put16(data + 2, (uint16_t)(int16_t)constrain(calibrated() ? lroundf(grams()) : 0, -32768, 32767));
  put16(data + 4, (uint16_t)(int16_t)remainingMl());
  put16(data + 6, (uint16_t)capacityMl);
  data[8] = queued;
  statusChar->setValue(data, sizeof data);
  statusChar->notify();
}

void serviceBle() {
  if (advertiseAgain) {
    advertiseAgain = false;
    BLEDevice::startAdvertising();
    Serial.println("bluetooth: app disconnected");
  }
  if (ackPending) {
    uint32_t boot = ackBoot, n = ackN;
    ackPending = false;
    confirmDrink(boot, n);
  }
  if (!bleConnected) return;
  uint32_t now = millis();
  if (now - statusSentAt >= STATUS_INTERVAL_MS) { statusSentAt = now; sendStatus(); }
  if (queued && (!drinkSentAt || now - drinkSentAt >= DRINK_RESEND_MS)) {
    drinkSentAt = now ? now : 1;
    putDrink();
    drinkChar->notify();
  }
}

// ---------- Scale, screen, serial ----------

bool readScale() {
  if (!scale.is_ready()) return false;
  window[windowIndex] = scale.read();
  windowIndex = (windowIndex + 1) % SMOOTHING_SAMPLES;
  if (windowFill < SMOOTHING_SAMPLES) windowFill++;
  lastSampleMs = millis();
  return true;
}

// Big weight in the middle (water only once the bottle is set), a hint line on top with the Bluetooth state.
void drawScreen() {
  static uint32_t lastDraw = 0;
  if (!hasDisplay || millis() - lastDraw < SCREEN_INTERVAL_MS) return;
  lastDraw = millis();
  if (!hx711Alive()) { showMessage("HX711 alga", "DT/SCK, 3.3V shalga"); return; }
  if (!calibrated()) { showMessage("Kalibrovk hii", "Serial: tare, cal 500"); return; }

  float g = grams();
  char number[12];
  if (g > MAX_LOAD_G) snprintf(number, sizeof number, "OVER");
  else if (bottleG > 0 && g < PRESENT_MIN_G) snprintf(number, sizeof number, "--");
  else snprintf(number, sizeof number, "%ld", lroundf(g - bottleG));
  char link[12] = "";
  if (queued) snprintf(link, sizeof link, bleConnected ? "BT %d" : "%d hulee", queued);
  else if (bleConnected) strcpy(link, "BT");

  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tr);
  display.drawStr(0, 10, bottleG > 0 ? "US" : "JIN");
  display.drawStr((128 - display.getStrWidth(link)) / 2, 10, link);
  display.drawStr(128 - display.getStrWidth("BOOT=tare"), 10, "BOOT=tare");
  display.drawHLine(0, 14, 128);
  display.setFont(u8g2_font_logisoso28_tr);
  int right = 104;
  display.drawStr(right - display.getStrWidth(number), 54, number);
  display.setFont(u8g2_font_helvB14_tr);
  display.drawStr(right + 6, 54, "g");
  display.sendBuffer();
}

void printStatus() {
  if (!hx711Alive()) { Serial.println("HX711 not responding"); return; }
  Serial.printf("raw %ld | offset %ld | factor %.4f | ", smoothedRaw(), offset, factor);
  if (calibrated()) Serial.printf("%.1f g\n", grams());
  else Serial.println("not calibrated");
  Serial.printf("%s | boot %lu | settled %d g | phase %d (0 moving, 1 empty, 2 present) | bottle %.0f g | left %d ml | waiting %d | app %s\n",
                deviceId, (unsigned long)bootId, settledG, (int)phase, bottleG, remainingMl(), queued, bleConnected ? "connected" : "not connected");
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "tare") tare();
  else if (line.startsWith("cal ")) calibrate(line.substring(4).toFloat());
  else if (line == "raw" || line == "status") printStatus();
  else Serial.println("commands: tare | cal <grams> | status");
}

// Lists every I2C device so a wrong OLED address or swapped SDA/SCL is easy to spot.
void scanI2c() {
  Serial.print("I2C devices:");
  int found = 0;
  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) { Serial.printf(" 0x%02X", address); found++; }
  }
  Serial.println(found ? "" : " none (check SDA/SCL and power)");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  prefs.begin("scale");
  factor = prefs.getFloat("factor", 0);
  bottleG = prefs.getFloat("bottle", 0);
  bootId = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootId);
  loadQueue();

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  Wire.beginTransmission(OLED_I2C_ADDRESS);
  hasDisplay = Wire.endTransmission() == 0;
  if (hasDisplay) {
    display.setI2CAddress(OLED_I2C_ADDRESS * 2);  // U8g2 takes the 8-bit address
    display.begin();
  } else {
    Serial.printf("OLED not found at 0x%02X; continuing without it\n", OLED_I2C_ADDRESS);
    scanI2c();
  }

  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  delay(500);  // let the load cell settle after power-up
  tare();
  Serial.println(calibrated() ? "calibrated" : "not calibrated: empty scale -> 'tare', then a known weight -> 'cal <grams>'");
  startBle();
}

void loop() {
  handleSerial();
  // Short press of BOOT: see pressBoot(). Released before acting so the finger's weight on the table is gone.
  static uint32_t pressedAt = 0;
  bool down = digitalRead(PIN_BUTTON) == LOW;
  if (down && !pressedAt) pressedAt = millis();
  else if (!down && pressedAt) {
    if (millis() - pressedAt >= 50) pressBoot();
    pressedAt = 0;
  }
  if (readScale()) track();
  serviceBle();
  drawScreen();
}
