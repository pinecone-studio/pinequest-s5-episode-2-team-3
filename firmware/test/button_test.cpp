#include "button.h"
#include "check.h"

using dusal::ButtonGestures;
using dusal::Gesture;

namespace {
// Holds the button for `holdMs` starting at `t`, then releases; returns the gestures seen, in order.
int press(ButtonGestures& b, uint32_t& t, uint32_t holdMs, Gesture* seen, int max, int count = 0) {
  for (uint32_t elapsed = 0; elapsed < holdMs; elapsed += 10, t += 10) {
    const Gesture g = b.update(true, t);
    if (g != Gesture::None && count < max) seen[count++] = g;
  }
  return count;
}

int idle(ButtonGestures& b, uint32_t& t, uint32_t ms, Gesture* seen, int max, int count = 0) {
  for (uint32_t elapsed = 0; elapsed < ms; elapsed += 10, t += 10) {
    const Gesture g = b.update(false, t);
    if (g != Gesture::None && count < max) seen[count++] = g;
  }
  return count;
}
}  // namespace

void button_tests() {
  Gesture seen[8];

  {  // One short press: Single, but only after the gap shows no second press is coming.
    ButtonGestures b;
    uint32_t t = 1000;
    int n = press(b, t, 120, seen, 8);
    n = idle(b, t, 400, seen, 8, n);
    CHECK_EQ(n, 0);
    n = idle(b, t, 200, seen, 8, n);
    CHECK_EQ(n, 1);
    CHECK(seen[0] == Gesture::Single);
  }

  {  // Three quick presses: one Triple and no Single.
    ButtonGestures b;
    uint32_t t = 1000;
    int n = 0;
    for (int i = 0; i < 3; i++) {
      n = press(b, t, 100, seen, 8, n);
      n = idle(b, t, 200, seen, 8, n);
    }
    n = idle(b, t, 1000, seen, 8, n);
    CHECK_EQ(n, 1);
    CHECK(seen[0] == Gesture::Triple);
  }

  {  // Two presses do nothing (reserved), and nothing is left over for the next press.
    ButtonGestures b;
    uint32_t t = 1000;
    int n = press(b, t, 100, seen, 8);
    n = idle(b, t, 200, seen, 8, n);
    n = press(b, t, 100, seen, 8, n);
    n = idle(b, t, 1000, seen, 8, n);
    CHECK_EQ(n, 0);
    n = press(b, t, 100, seen, 8, n);
    n = idle(b, t, 1000, seen, 8, n);
    CHECK_EQ(n, 1);
    CHECK(seen[0] == Gesture::Single);
  }

  {  // Holding: Long fires once while still held; releasing adds no Single.
    ButtonGestures b;
    uint32_t t = 1000;
    int n = press(b, t, 6000, seen, 8);
    CHECK_EQ(n, 1);
    CHECK(seen[0] == Gesture::Long);
    n = idle(b, t, 1000, seen, 8, n);
    CHECK_EQ(n, 1);
  }

  {  // Contact bounce under 50 ms is not a press.
    ButtonGestures b;
    uint32_t t = 1000;
    int n = press(b, t, 30, seen, 8);
    n = idle(b, t, 1000, seen, 8, n);
    CHECK_EQ(n, 0);
  }

  {  // Presses spaced wider than the gap count separately.
    ButtonGestures b;
    uint32_t t = 1000;
    int n = 0;
    for (int i = 0; i < 3; i++) {
      n = press(b, t, 100, seen, 8, n);
      n = idle(b, t, 700, seen, 8, n);
    }
    CHECK_EQ(n, 3);
    CHECK(seen[0] == Gesture::Single && seen[1] == Gesture::Single && seen[2] == Gesture::Single);
  }

  {  // millis() wrapping past 2^32 does not break timing.
    ButtonGestures b;
    uint32_t t = 4294967000u;
    int n = press(b, t, 100, seen, 8);
    n = idle(b, t, 1000, seen, 8, n);
    CHECK_EQ(n, 1);
    CHECK(seen[0] == Gesture::Single);
  }
}
