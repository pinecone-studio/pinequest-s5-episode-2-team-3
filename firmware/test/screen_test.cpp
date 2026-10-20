#include "check.h"
#include "screen.h"

using namespace dusal;

void screen_tests() {
  ScreenState s;
  ScreenLines out = renderScreen(s);
  CHECK_STR(out.big, "Setup");
  s.calibrated = true;
  s.phase = Phase::Present;
  out = renderScreen(s);
  CHECK_STR(out.big, "? ml");
  CHECK_STR(out.line[0], "Empty bottle? BOOT");
  s.hasTare = true; s.remainingMl = 480; s.lastDrinkMl = 250; s.wifi = true; s.unsent = 2;
  out = renderScreen(s);
  CHECK_STR(out.big, "480 ml");
  CHECK_STR(out.line[0], "Last drink 250 ml");
  CHECK_STR(out.line[1], "WiFi ok  Clock --");
  CHECK_STR(out.line[2], "Unsent 2");
  s.phase = Phase::Empty; s.unsent = 0;
  out = renderScreen(s);
  CHECK_STR(out.big, "No bottle");
  CHECK_STR(out.line[2], "All sent");
  // Long numbers are cut to the screen width instead of overflowing.
  s.unsent = 128; s.dropped = 4000000000u;
  out = renderScreen(s);
  CHECK(std::strlen(out.line[2]) <= kScreenColumns);
  s.phase = Phase::Present; s.remainingMl = 5000;
  CHECK(std::strlen(renderScreen(s).big) <= 10);
}
