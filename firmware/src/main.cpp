#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>
#include "config.h"

// Calibration persists across restarts: raw = offset + grams * factor.
struct Calibration { long offset = 0; float factor = 0; bool valid() const { return factor != 0; } };

HX711 scale;
Preferences prefs;
Calibration calibration;
long lastRaw = 0;

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

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "zero") zeroScale();
  else if (line.startsWith("cal ")) calibrate(line.substring(4).toFloat());
  else if (line == "raw") Serial.printf("raw=%ld\n", lastRaw);
  else Serial.println("commands: zero | cal <grams> | raw");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  prefs.begin("dusal");
  calibration.offset = prefs.getLong("offset", 0);
  calibration.factor = prefs.getFloat("factor", 0);
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  Serial.println(calibration.valid() ? "calibrated" : "not calibrated: empty base -> 'zero', then known weight -> 'cal <grams>'");
}

void loop() {
  handleSerial();
  static uint32_t pressedAt = 0;
  if (digitalRead(PIN_BUTTON) == LOW) { if (!pressedAt) pressedAt = millis(); }
  else pressedAt = 0;
  if (pressedAt && millis() - pressedAt >= LONG_PRESS_MS) { zeroScale(); pressedAt = 0; while (digitalRead(PIN_BUTTON) == LOW) delay(10); }

  static uint32_t lastSample = 0;
  if (millis() - lastSample < SAMPLE_INTERVAL_MS || !scale.is_ready()) return;
  lastSample = millis();
  lastRaw = scale.read();
  static uint32_t lastPrint = 0;
  if (calibration.valid() && millis() - lastPrint >= 1000) { lastPrint = millis(); Serial.printf("%.1f g\n", grams(lastRaw)); }
}
