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
#if CONFIG_IDF_TARGET_ESP32S3
#include <driver/i2s.h>
#include "voice.h"  // spoken phrases, tools/make_voice.py
#endif
#include "image.h"  // the Dusal bottle, tools/make_image.py
#include "text.h"   // Mongolian words (the OLED fonts here have no Ө/Ү), tools/make_text.py

// ---------- Settings ----------
// Wiring for an ESP32-WROOM-32 DevKit (first base) and the XH-S3E-AI ESP32-S3 board (second base).
// Change these if your board is wired differently.
#if CONFIG_IDF_TARGET_ESP32S3
// The second base has no screen (it has a speaker instead), so the OLED is never looked for.
const bool HAS_OLED = false;
const int PIN_HX711_DT = 41;
const int PIN_HX711_SCK = 42;
const int PIN_OLED_SDA = -1;
const int PIN_OLED_SCL = -1;
// Its speaker amplifier (I2S).
#define HAS_SPEAKER 1
const int PIN_SPEAKER_BCLK = 15;
const int PIN_SPEAKER_LRCK = 16;
const int PIN_SPEAKER_DOUT = 7;
#else
const bool HAS_OLED = true;
const int PIN_HX711_DT = 16;
const int PIN_HX711_SCK = 4;
const int PIN_OLED_SDA = 21;
const int PIN_OLED_SCL = 22;
#endif
// The BOOT button exists on every DevKit. Nothing on the scale: zero it. Empty bottle on it: remember the bottle.
const int PIN_BUTTON = 0;

// NFP1315 modules are 0.96" SSD1306 128x64. If the picture is shifted, has a noisy strip on one edge or
// stays dark while the address is found, the module is an SH1106: use the second line instead.
using OledDisplay = U8G2_SSD1306_128X64_NONAME_F_HW_I2C;
// using OledDisplay = U8G2_SH1106_128X64_NONAME_F_HW_I2C;
// Most modules answer at 0x3C, some at 0x3D (the serial log lists what it finds).
const uint8_t OLED_I2C_ADDRESS = 0x3C;

const float MAX_LOAD_G = 5000;         // load cell rating; above this the screen shows OVER
const int SMOOTHING_SAMPLES = 8;       // moving average; the HX711 gives 10 samples/s, so 0.8 s
const int TARE_SAMPLES = 20;           // tare and calibration average 2 s of readings
// A 5 kg cell on the HX711 gives a few hundred raw counts per gram. Far fewer means the weight is not
// reaching the cell (wiring, mounting), and such a factor would only turn noise into grams.
const float MIN_FACTOR = 20;           // raw counts per gram
const long HX711_LIMIT = 8388000;      // readings this close to ±2^23: the HX711 input is out of range
const float ZERO_BAND_G = 0.5;         // the screen shows 0.0 inside this, so the cell's drift does not flicker
const uint32_t SCREEN_INTERVAL_MS = 100;  // 10 frames a second, so the bottle on the screen moves smoothly
// The screen wakes when the weight changes by more than SCREEN_WAKE_G and goes dark after SCREEN_ON_MS
// without a change. Saves power and keeps the OLED from burning in.
const uint32_t SCREEN_ON_MS = 10000;
const float SCREEN_WAKE_G = 3;

// Drink detection, same thresholds as shared/device.ts. 1 g of water = 1 ml. The load cell drifts only
// ±0.3 g when still, so a single sip counts and the phone hears of it about 1.7 s after the bottle is put down.
const float PRESENT_MIN_G = 2;         // below this the base is empty (bottle lifted)
const float STABLE_BAND_G = 15;        // the last 0.8 s of samples must agree this closely
const uint32_t SETTLE_MS = 700;        // ...for this long before the weight counts as settled
const int MEASUREMENTS = 3;            // then this many 0.8 s averages, 100 ms apart, are averaged
const uint32_t MEASURE_GAP_MS = 100;
const int MIN_DRINK_ML = 5;            // smallest settled drop that is a drink; smaller changes add up
const int MIN_REFILL_ML = 5;           // smallest settled rise that is a refill
const int MAX_CHANGE_ML = 5000;        // a bigger jump is a different bottle, not a drink

const int QUEUE_CAPACITY = 64;         // unconfirmed drinks kept in flash; when full the oldest is dropped
const uint32_t STATUS_INTERVAL_MS = 1000;  // live weight to the app

// Speaker (second base): within VOICE_NEAR_ML of the day's goal or limit, each drink says how much is
// left; reaching the goal says so, and under a doctor's limit every drink past it warns.
const int VOICE_NEAR_ML = 200;
const int VOICE_VOLUME = 70;           // percent of the recorded loudness

// Battery: the base can run from a small LiPo, so it does not spin at full speed. 80 MHz is plenty for
// a 10 samples/s HX711 and BLE; the pause lets the CPU idle between passes of loop().
const uint32_t CPU_MHZ = 80;
const uint32_t LOOP_IDLE_MS = 10;
// Advertising every 0.5-1 s instead of every ~0.1 s: the phone still finds the base within a few seconds.
const uint16_t ADVERTISE_MIN = 800;    // units of 0.625 ms
const uint16_t ADVERTISE_MAX = 1600;
const uint32_t DRINK_RESEND_MS = 3000;     // the oldest drink is repeated until the app confirms it
// -------------------------------

// Bluetooth LE contract with the app; must match src/scale-protocol.ts.
#define SERVICE_UUID "d05a1000-6c2b-4b8e-9f3a-2f1e0c7a5b01"
#define STATUS_UUID  "d05a1001-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // read/notify, 9 bytes: see sendStatus()
#define DRINK_UUID   "d05a1002-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // read/notify, 14 bytes or empty: see putDrink()
#define ACK_UUID     "d05a1003-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // write, 8 bytes: boot + n of a saved drink
#define ID_UUID      "d05a1004-6c2b-4b8e-9f3a-2f1e0c7a5b01"  // read, ASCII device ID, e.g. "dusal-a1b2"
// write/notify, ASCII. What BOOT does, for a base whose button is sealed in its case, plus what the app knows:
//   "tare"          the empty bottle is on the scale: once it has settled, remember its weight -> "tare <g>" or "tare-failed"
//   "zero"          nothing is on the scale: zero it and forget the bottle -> "zero"
//   "bottle <g>"    a bottle saved in the app is used now: its empty weight, and a fresh anchor so the swap
//                   is never a drink or a refill -> "bottle <g>"
//   "today <ml>"    the app's total for today (also hand-logged drinks, deletions, the demo reset) for the screen
#define COMMAND_UUID "d05a1005-6c2b-4b8e-9f3a-2f1e0c7a5b01"

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
BLECharacteristic* commandChar = nullptr;
// Set from the Bluetooth task, handled in loop().
volatile bool bleConnected = false;
volatile bool advertiseAgain = false;
volatile bool ackPending = false;
volatile uint32_t ackBoot = 0, ackN = 0;
char command[24];
volatile bool commandPending = false;
uint32_t tareUntil = 0;  // an app tare is waiting for the bottle to settle, until this time
int todayMl = 0;         // drunk today, as the app counts it, plus drinks counted here since
int goalMl = 0;          // the day's goal or the doctor's limit, from the app; 0: not known yet
bool limitMode = false;  // goalMl is a doctor's limit, not a goal
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

// A reading pinned at the HX711's limit: a load cell wire is loose, broken or on the wrong pin.
bool warnLimit(long raw) {
  if (labs(raw) < HX711_LIMIT) return false;
  Serial.printf("HX711 reading %ld is at its limit: check the load cell wires (E+/E-/A+/A-)\n", raw);
  return true;
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
  warnLimit(raw);
  const long change = raw - offset;
  if (fabsf(change / knownGrams) < MIN_FACTOR) {
    Serial.printf("calibration NOT saved: only %ld raw counts for %.0f g (a working cell gives tens of thousands)\n", change, knownGrams);
    Serial.println("  the weight is not reaching the load cell. Check: E+/E-/A+/A- wires to the HX711, one end of the cell");
    Serial.println("  screwed to the base and the other to the plate, nothing touching the case. 'watch' shows the raw value live.");
    showMessage("Kalibrovk bolsongui", "Serial: watch");
    return;
  }
  factor = change / knownGrams;
  prefs.putFloat("factor", factor);
  fillWindow(raw);
  Serial.printf("factor set: %.4f raw/g\n", factor);
}

// Water left in the bottle; -1 when unknown (no bottle set, lifted or moving).
// ---------- Voice ----------

#ifdef HAS_SPEAKER
QueueHandle_t voiceQueue = nullptr;

// voice.h keeps each sample as a μ-law byte (tools/make_voice.py); back to 16-bit for the amplifier.
int16_t fromMulaw(uint8_t u) {
  u = ~u;
  int t = (((u & 0x0F) << 3) + 0x84) << ((u & 0x70) >> 4);
  return (u & 0x80) ? 0x84 - t : t - 0x84;
}

// Plays queued clips one after another, so the scale keeps weighing while the base speaks.
void voiceTask(void*) {
  const Clip* clip;
  static int16_t buffer[256];
  while (xQueueReceive(voiceQueue, &clip, portMAX_DELAY)) {
    size_t sent = 0;
    for (uint32_t i = 0; i < clip->count; i += 256) {
      const uint32_t n = min<uint32_t>(256, clip->count - i);
      for (uint32_t j = 0; j < n; j++) buffer[j] = fromMulaw(clip->samples[i + j]) * VOICE_VOLUME / 100;
      size_t written;
      i2s_write(I2S_NUM_0, buffer, n * sizeof(int16_t), &written, portMAX_DELAY);
      sent += written;
    }
    i2s_zero_dma_buffer(I2S_NUM_0);  // otherwise the last buffer repeats as a buzz
    Serial.printf("speaker: played %u of %u bytes\n", (unsigned)sent, (unsigned)(clip->count * sizeof(int16_t)));
  }
}

void startVoice() {
  i2s_config_t config = {};
  config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  config.sample_rate = 16000;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  config.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.dma_buf_count = 8;
  config.dma_buf_len = 256;
  config.tx_desc_auto_clear = true;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_SPEAKER_BCLK;
  pins.ws_io_num = PIN_SPEAKER_LRCK;
  pins.data_out_num = PIN_SPEAKER_DOUT;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  if (i2s_driver_install(I2S_NUM_0, &config, 0, nullptr) != ESP_OK || i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) {
    Serial.println("speaker: I2S did not start");
    return;
  }
  voiceQueue = xQueueCreate(4, sizeof(const Clip*));
  xTaskCreate(voiceTask, "voice", 4096, nullptr, 1, nullptr);
}

void say(const Clip& clip) {
  const Clip* p = &clip;
  if (voiceQueue) xQueueSend(voiceQueue, &p, 0);  // a full queue drops the phrase rather than wait
}

// "Анхаар! N миллилитр илүү уусан": N to the nearest 100 ml, at least 100, and "мянга гаруй" past 1,000.
const Clip& extraClip(int ml) { return kVoiceExtra[constrain((ml + 50) / 100, 1, 10) - 1]; }

// After a drink counted here: how the day now stands against the goal or limit. Every drink past it says
// by how much (under a doctor's limit after «Хязгаараас хэтэрлээ»).
void speakProgress(int before, int after) {
  if (goalMl <= 0) return;
  const int left = goalMl - after;
  if (left < 0) {
    if (limitMode) say(kVoiceOver);
    say(extraClip(-left));
  }
  else if (before < goalMl && after >= goalMl) say(kVoiceReached);
  else if (left > 0 && left < VOICE_NEAR_ML) say(kVoiceShort[constrain((left + 5) / 10, 1, 19) - 1]);
}

void sayLinked() { say(kVoiceLinked); }

// 'say ready|reached|over|extra <ml>|<ml>': plays a phrase; the app also asks for one after a drink typed in.
void sayCommand(const String& what) {
  if (what == "ready") say(kVoiceReady);
  else if (what == "reached") say(kVoiceReached);
  else if (what == "over") say(kVoiceOver);
  else if (what.startsWith("extra ")) say(extraClip(what.substring(6).toInt()));
  else say(kVoiceShort[constrain((what.toInt() + 5) / 10, 1, 19) - 1]);
}
#else
void startVoice() {}
void speakProgress(int, int) {}
void sayLinked() {}
void sayCommand(const String&) { Serial.println("this base has no speaker"); }
#endif

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
#ifdef HAS_SPEAKER
  if (g > 0) say(kVoiceReady);
#endif
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
  todayMl += amountMl;
  prefs.putInt("today", todayMl);
  speakProgress(todayMl - amountMl, todayMl);
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

class CommandEvents : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (commandPending) return;
    size_t length = min(c->getLength(), sizeof command - 1);
    memcpy(command, c->getData(), length);
    command[length] = 0;
    commandPending = true;
  }
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
  // The name people see when pairing. The app finds the base by its service, not by this name.
  const char* name = "Ухаалаг суурь";
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
  commandChar = service->createCharacteristic(COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY);
  commandChar->addDescriptor(new BLE2902());
  commandChar->setCallbacks(new CommandEvents());
  BLECharacteristic* id = service->createCharacteristic(ID_UUID, BLECharacteristic::PROPERTY_READ);
  id->setValue((uint8_t*)deviceId, strlen(deviceId));
  service->start();
  putDrink();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinInterval(ADVERTISE_MIN);
  advertising->setMaxInterval(ADVERTISE_MAX);
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

void answer(const char* text) {
  Serial.printf("app command: %s\n", text);
  if (!commandChar) return;
  commandChar->setValue((uint8_t*)text, strlen(text));
  commandChar->notify();
}

void runCommand() {
  if (commandPending) {
    String line(command);
    commandPending = false;
    if (line == "tare") tareUntil = millis() + 15000;
    else if (line == "zero") { tare(); setBottle(0); hasAnchor = false; answer("zero"); }
    else if (line.startsWith("bottle ")) {
      float g = line.substring(7).toFloat();
      if (g > 0 && g < MAX_CHANGE_ML) {
        setBottle(g);
        hasAnchor = settled && phase == PRESENT;
        anchorG = settledG;
        char text[24];
        snprintf(text, sizeof text, "bottle %.0f", g);
        answer(text);
      }
    } else if (line.startsWith("say ")) {
      sayCommand(line.substring(4));  // the app's voice demo
    } else if (line.startsWith("today ")) {
      // "today <ml>", or "today <ml> <goal ml> <goal|limit>" from apps that also share the plan.
      int ml = 0, goal = 0;
      char mode[8] = "";
      const int got = sscanf(line.c_str() + 6, "%d %d %7s", &ml, &goal, mode);
      todayMl = max(0, ml);
      prefs.putInt("today", todayMl);
      if (got == 3 && goal > 0) {
        goalMl = goal;
        limitMode = strcmp(mode, "limit") == 0;
        prefs.putInt("goal", goalMl);
        prefs.putBool("limit", limitMode);
      }
    }
  }
  // The app's tare: wait until the bottle has settled, then take that weight as the empty bottle.
  if (tareUntil) {
    if (settled && phase == PRESENT) {
      setBottle(settledG);
      hasAnchor = true;
      anchorG = settledG;
      char text[24];
      snprintf(text, sizeof text, "tare %d", settledG);
      answer(text);
      tareUntil = 0;
    } else if ((int32_t)(millis() - tareUntil) >= 0) {
      answer("tare-failed");
      tareUntil = 0;
    }
  }
}

void serviceBle() {
  runCommand();
  // «Сав холбогдлоо» once the phone has linked (said here, not in the Bluetooth callback).
  static bool wasConnected = false;
  if (bleConnected != wasConnected) {
    wasConnected = bleConnected;
    if (bleConnected) sayLinked();
  }
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

uint32_t screenOnUntil = SCREEN_ON_MS;
bool screenOn = true;
float wakeG = 0;  // the weight when the screen last woke

// Touching or changing what is on the scale keeps the screen on; it sleeps once the weight stays put.
void watchScreen() {
  if (!calibrated() || fabsf(grams() - wakeG) <= SCREEN_WAKE_G) return;
  wakeG = grams();
  screenOnUntil = millis() + SCREEN_ON_MS;
  if (!screenOn && hasDisplay) { display.setPowerSave(0); screenOn = true; }
}

void drawText(const Text& t, int x, int y) { display.drawXBMP(x, y, t.width, t.height, t.bits); }

bool imagePixel(int x, int y) {
  if (x < 0 || y < 0 || x >= kImageWidth || y >= kImageHeight) return false;
  return kImage[y * ((kImageWidth + 7) / 8) + x / 8] >> (x % 8) & 1;
}

// The Dusal bottle on the left is alive: it bobs a pixel or two, waves its hand and blinks every few seconds.
void drawMascot() {
  static const uint8_t bob[] = {0, 1, 2, 1};
  const int dy = bob[millis() / 400 % 4];
  display.drawXBMP(0, dy, kImageWidth, kImageHeight, kImage);
  // The hand (x 41-50, y 23-40 in image.h) swings ±14° about the wrist. Each screen pixel near it looks up
  // where it came from in the still drawing, so the turned hand has no holes.
  const int handX = 41, handTop = 23, handBottom = 40, pivotX = 42, pivotY = 39;
  const float angle = 0.25f * sinf(millis() * 2 * PI / 900);
  const float c = cosf(angle), s = sinf(angle);
  display.setDrawColor(0);
  display.drawBox(handX, handTop + dy, kImageWidth - handX, handBottom - handTop + 1);
  display.setDrawColor(1);
  for (int y = handTop - 6; y <= handBottom + 2; y++) {
    for (int x = handX - 3; x < kImageWidth + 4; x++) {
      const float rx = x - pivotX, ry = y - pivotY;
      const int sx = lroundf(pivotX + rx * c + ry * s), sy = lroundf(pivotY - rx * s + ry * c);
      if (sx >= handX && sy >= handTop && sy <= handBottom && imagePixel(sx, sy)) display.drawPixel(x, y + dy);
    }
  }
  if (millis() % 4000 < 180) {  // eyes shut: wipe them and draw a lid line (eye boxes from image.h)
    for (int eyeX : {15, 27}) {
      display.setDrawColor(0);
      display.drawBox(eyeX, 28 + dy, 7, 6);
      display.setDrawColor(1);
      display.drawHLine(eyeX, 31 + dy, 7);
    }
  }
}

// A number with its unit ("мл", "г") after it, on the same baseline.
void drawValue(const char* number, const Text& unit, int x, int baseline) {
  display.setFont(u8g2_font_helvB12_tn);
  display.drawStr(x, baseline, number);
  drawText(unit, x + display.getStrWidth(number) + 3, baseline - unit.height);
}

// The bottle on the left; on the right what was drunk today, the water in the bottle (once its empty weight is
// set) or the weight, and the Bluetooth state at the bottom.
void drawScreen() {
  static uint32_t lastDraw = 0;
  if (!hasDisplay || millis() - lastDraw < SCREEN_INTERVAL_MS) return;
  lastDraw = millis();
  if (!hx711Alive()) { showMessage("HX711 alga", "DT/SCK, 3.3V shalga"); return; }
  if (!calibrated()) { showMessage("Kalibrovk hii", "Serial: tare, cal 500"); return; }
  if ((int32_t)(millis() - screenOnUntil) >= 0) {
    if (screenOn) { display.setPowerSave(1); screenOn = false; }
    return;
  }

  const float g = grams();
  const bool water = bottleG > 0;
  char number[12];
  if (g > MAX_LOAD_G) snprintf(number, sizeof number, "OVER");
  else if (water && g < PRESENT_MIN_G) snprintf(number, sizeof number, "--");
  else if (water) snprintf(number, sizeof number, "%ld", lroundf(g - bottleG));
  else if (fabsf(g) < ZERO_BAND_G) snprintf(number, sizeof number, "0.0");  // no "-0.0" / "0.1" flicker when empty
  else snprintf(number, sizeof number, fabsf(g) < 99.95f ? "%.1f" : "%.0f", g);  // ~0.1 g resolution
  char link[12] = "";
  if (queued) snprintf(link, sizeof link, bleConnected ? "BT %d" : "%d hulee", queued);
  else if (bleConnected) strcpy(link, "BT");

  char today[12];
  if (todayMl < 1000) snprintf(today, sizeof today, "%d", todayMl);
  else snprintf(today, sizeof today, "%.1f", todayMl / 1000.0f);  // "1.3 л"

  const int x = kImageWidth + 6;
  display.clearBuffer();
  drawMascot();
  drawText(kTextToday, x, 0);
  drawValue(today, todayMl < 1000 ? kTextMl : kTextL, x, 24);
  drawText(water ? kTextWater : kTextWeight, x, 28);
  drawValue(number, water ? kTextMl : kTextG, x, 52);
  if (!water && phase == PRESENT) drawText(kTextTare, x, 55);  // a bottle is on: its empty weight is not set yet
  else {
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(x, 64, link);
  }
  display.sendBuffer();
}

void printStatus() {
  if (!hx711Alive()) { Serial.println("HX711 not responding"); return; }
  warnLimit(smoothedRaw());
  Serial.printf("raw %ld | offset %ld | factor %.4f | ", smoothedRaw(), offset, factor);
  if (calibrated()) Serial.printf("%.1f g\n", grams());
  else Serial.println("not calibrated");
  Serial.printf("today %d / %s %d ml\n", todayMl, limitMode ? "limit" : "goal", goalMl);
  Serial.printf("%s | boot %lu | settled %d g | phase %d (0 moving, 1 empty, 2 present) | bottle %.0f g | left %d ml | waiting %d | app %s\n",
                deviceId, (unsigned long)bootId, settledG, (int)phase, bottleG, remainingMl(), queued, bleConnected ? "connected" : "not connected");
}

// 'watch': the raw reading four times a second for 10 s. Pressing the plate must move it by thousands;
// if it hardly moves, the weight is not reaching the load cell.
void watchRaw() {
  Serial.println("watch: press on the plate for 10 s; raw should change by thousands");
  const uint32_t end = millis() + 10000;
  uint32_t next = 0;
  while ((int32_t)(millis() - end) < 0) {
    readScale();
    if ((int32_t)(millis() - next) >= 0) {
      next = millis() + 250;
      const long raw = smoothedRaw();
      Serial.printf("raw %ld (%+ld from zero)", raw, raw - offset);
      if (calibrated()) Serial.printf(" | %.1f g", grams());
      Serial.println(labs(raw) >= HX711_LIMIT ? " | at the HX711 limit: check wires" : "");
    }
    delay(5);
  }
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "tare") tare();
  else if (line.startsWith("cal ")) calibrate(line.substring(4).toFloat());
  else if (line == "raw" || line == "status") printStatus();
  else if (line == "watch") watchRaw();
  else if (line.startsWith("say ")) sayCommand(line.substring(4));
  else Serial.println("commands: tare | cal <grams> | status | watch | say ready|reached|over|extra <ml>|<ml>");
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
  setCpuFrequencyMhz(CPU_MHZ);
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  prefs.begin("scale");
  factor = prefs.getFloat("factor", 0);
  // An earlier calibration made without the weight reaching the cell: start over instead of showing noise.
  if (factor != 0 && fabsf(factor) < MIN_FACTOR) {
    Serial.printf("stored factor %.4f raw/g is too small (bad calibration): calibrate again\n", factor);
    factor = 0;
    prefs.remove("factor");
  }
  bottleG = prefs.getFloat("bottle", 0);
  todayMl = prefs.getInt("today", 0);
  goalMl = prefs.getInt("goal", 0);
  limitMode = prefs.getBool("limit", false);
  bootId = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootId);
  loadQueue();

  if (HAS_OLED) {
    Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
    Wire.beginTransmission(OLED_I2C_ADDRESS);
    hasDisplay = Wire.endTransmission() == 0;
  }
  if (hasDisplay) {
    display.setI2CAddress(OLED_I2C_ADDRESS * 2);  // U8g2 takes the 8-bit address
    display.begin();
  } else if (HAS_OLED) {
    Serial.printf("OLED not found at 0x%02X; continuing without it\n", OLED_I2C_ADDRESS);
    scanI2c();
  }

  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  delay(500);  // let the load cell settle after power-up
  tare();
  Serial.println(calibrated() ? "calibrated" : "not calibrated: empty scale -> 'tare', then a known weight -> 'cal <grams>'");
  startVoice();
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
  if (readScale()) { track(); watchScreen(); }
  serviceBle();
  drawScreen();
  delay(LOOP_IDLE_MS);
}
