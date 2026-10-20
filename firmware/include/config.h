#pragma once
#include <cstdint>

// Wiring. Change these to match your base; defaults suit an ESP32-S3 DevKitC.
constexpr int PIN_HX711_DT = 4;
constexpr int PIN_HX711_SCK = 5;
// The BOOT button exists on every ESP32-S3 board. Short press: "this empty bottle is the new bottle".
// Hold 5 s with nothing on the base: set the scale's zero.
constexpr int PIN_BUTTON = 0;

constexpr uint32_t SAMPLE_INTERVAL_MS = 100;   // HX711 runs at 10 samples/s by default.
constexpr uint32_t LONG_PRESS_MS = 5000;
constexpr uint32_t READING_INTERVAL_MS = 15000; // status heartbeat for the app ("online" lasts 60 s)
constexpr uint32_t MAX_BACKOFF_MS = 300000;     // longest wait between failed uploads
