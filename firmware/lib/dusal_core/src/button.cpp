#include "button.h"

namespace dusal {

namespace {
constexpr uint32_t kDebounceMs = 50;  // shorter contacts are switch bounce, not a press
}

Gesture ButtonGestures::update(bool down, uint32_t nowMs) {
  if (down) {
    if (!pressed_) {
      pressed_ = true;
      pressedAt_ = nowMs;
    } else if (!longFired_ && nowMs - pressedAt_ >= longMs_) {
      longFired_ = true;
      count_ = 0;
      return Gesture::Long;
    }
    return Gesture::None;
  }
  if (pressed_) {
    pressed_ = false;
    if (longFired_) {
      longFired_ = false;
      return Gesture::None;
    }
    if (nowMs - pressedAt_ >= kDebounceMs) {
      count_++;
      lastRelease_ = nowMs;
    }
  }
  if (count_ && nowMs - lastRelease_ >= gapMs_) {
    const int presses = count_;
    count_ = 0;
    if (presses == 1) return Gesture::Single;
    if (presses >= 3) return Gesture::Triple;
  }
  return Gesture::None;
}

}  // namespace dusal
