#pragma once
#include <cstdint>

// Wiring. Change these to match your base; defaults suit an ESP32-S3 DevKitC.
#if defined(BOARD_XH_S3E_AI)
// XH-S3E-AI v1.0 (`pio run -e xh-s3e-ai`): HX711 sits on the header's IO41/SDA and IO42/SCL pins.
// Those are the header's only I2C pins, so this board runs without the OLED.
constexpr int PIN_HX711_DT = 41;
constexpr int PIN_HX711_SCK = 42;
constexpr bool HAS_OLED = false;
// Its speaker amplifier (the "+ −" connector) takes I2S on these pins.
constexpr bool HAS_SPEAKER = true;
constexpr int PIN_SPK_DOUT = 7;
constexpr int PIN_SPK_BCLK = 15;
constexpr int PIN_SPK_LRCK = 16;
#else
constexpr int PIN_HX711_DT = 4;
constexpr int PIN_HX711_SCK = 5;
constexpr bool HAS_OLED = true;
constexpr bool HAS_SPEAKER = false;
constexpr int PIN_SPK_DOUT = -1;
constexpr int PIN_SPK_BCLK = -1;
constexpr int PIN_SPK_LRCK = -1;
#endif
constexpr float SPEAKER_VOLUME = 0.6f;  // 0..1; full scale distorts on small speakers
// The BOOT button exists on every ESP32-S3 board. Short press: "this empty bottle is the new bottle".
// Three quick presses: speak the saved text (boards with a speaker). Hold 5 s with nothing on the base: set the scale's zero.
constexpr int PIN_BUTTON = 0;
// SSD1306 128x64 OLED on I2C. Most modules answer at 0x3C, some at 0x3D.
constexpr int PIN_OLED_SDA = 8;
constexpr int PIN_OLED_SCL = 9;
constexpr uint8_t OLED_I2C_ADDRESS = 0x3C;

constexpr uint32_t SAMPLE_INTERVAL_MS = 100;   // HX711 runs at 10 samples/s by default.
constexpr uint32_t LONG_PRESS_MS = 5000;
constexpr uint32_t READING_INTERVAL_MS = 15000; // status heartbeat for the app ("online" lasts 60 s)
constexpr uint32_t MAX_BACKOFF_MS = 300000;     // longest wait between failed uploads
