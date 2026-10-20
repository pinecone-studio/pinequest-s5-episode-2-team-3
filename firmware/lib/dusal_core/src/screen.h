#pragma once
#include <cstddef>
#include <cstdint>
#include "intake.h"

namespace dusal {

// What the 128x64 OLED shows. ASCII only: the stock display font has no Cyrillic.
struct ScreenState {
  bool calibrated = false;
  Phase phase = Phase::Moving;
  int remainingMl = -1;
  bool hasTare = false;
  int lastDrinkMl = 0;
  bool wifi = false;
  bool clock = false;
  size_t unsent = 0;
  uint32_t dropped = 0;
};

constexpr size_t kScreenColumns = 21;  // 6x8 font on 128 px
struct ScreenLines {
  char big[kScreenColumns + 1];        // drawn at double size: at most 10 characters
  char line[3][kScreenColumns + 1];
};

ScreenLines renderScreen(const ScreenState& state);

}  // namespace dusal
