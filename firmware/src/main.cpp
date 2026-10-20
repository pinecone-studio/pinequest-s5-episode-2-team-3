#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>
#include "config.h"
#include "intake.h"

// Calibration persists across restarts: raw = offset + grams * factor.
struct Calibration { long offset = 0; float factor = 0; bool valid() const { return factor != 0; } };

HX711 scale;
Preferences prefs;
Calibration calibration;
long lastRaw = 0;
dusal::IntakeTracker tracker;

void saveCalibration() {
  prefs.putLong("offset", calibration.offset);
  prefs.putFloat("factor", calibration.factor);
}

// Averages a few readings so calibration does not depend on one noisy sample.
long averageRaw(int samples) {
  long long sum = 0;
  for (int i = 0; i < samples; i++) {
    while (!scale.is_ready()) delay(5);
    sum += scale.read();
  }
  return static_cast<long>(sum / samples);
}

void zeroScale() {
  calibration.offset = averageRaw(20);
  saveCalibration();
  Serial.printf("zero set: offset=%ld\n", calibration.offset);
}

void calibrate(float knownGrams) {
  if (knownGrams <= 0) { Serial.println("usage: cal <grams of the known weight on the base>"); return; }
  calibration.factor = (averageRaw(20) - calibration.offset) / knownGrams;
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

void onChange(const dusal::Update& update) {
  switch (update.change) {
    case dusal::Change::Placed: Serial.printf("placed %d g\n", tracker.settledG()); break;
    case dusal::Change::Drink: Serial.printf("drink %d ml\n", update.amountMl); break;
    case dusal::Change::Refill: Serial.printf("refill %d ml\n", update.amountMl); break;
    case dusal::Change::Swapped: Serial.println("different bottle: tare cleared"); persistTare(); break;
    default: break;
  }
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "zero") zeroScale();
  else if (line.startsWith("cal ")) calibrate(line.substring(4).toFloat());
  else if (line == "raw") Serial.printf("raw=%ld\n", lastRaw);
  else if (line == "tare") tareBottle();
  else Serial.println("commands: zero | cal <grams> | raw | tare");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  prefs.begin("dusal");
  calibration.offset = prefs.getLong("offset", 0);
  calibration.factor = prefs.getFloat("factor", 0);
  if (prefs.isKey("tare")) tracker.restoreTare(prefs.getFloat("tare", 0));
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  Serial.println(calibration.valid() ? "calibrated" : "not calibrated: empty base -> 'zero', then known weight -> 'cal <grams>'");
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

  static uint32_t lastSample = 0;
  if (millis() - lastSample < SAMPLE_INTERVAL_MS || !scale.is_ready()) return;
  lastSample = millis();
  lastRaw = scale.read();
  if (!calibration.valid()) return;
  onChange(tracker.feed(grams(lastRaw), millis()));
}
