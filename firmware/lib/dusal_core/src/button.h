#pragma once
#include <cstdint>

// Turns raw BOOT-button samples into gestures. A single press waits `gapMs` to make sure no
// second press follows, so the gestures never overlap: three quick presses are not also a single press.
namespace dusal {

enum class Gesture : uint8_t { None, Single, Triple, Long };

class ButtonGestures {
 public:
  explicit ButtonGestures(uint32_t longMs = 5000, uint32_t gapMs = 500) : longMs_(longMs), gapMs_(gapMs) {}

  // Call often with the current state (true = held down). Long fires once while still held.
  Gesture update(bool down, uint32_t nowMs);

 private:
  uint32_t longMs_, gapMs_;
  bool pressed_ = false;
  bool longFired_ = false;
  uint32_t pressedAt_ = 0;
  uint32_t lastRelease_ = 0;
  int count_ = 0;
};

}  // namespace dusal
