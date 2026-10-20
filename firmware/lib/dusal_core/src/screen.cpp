#include "screen.h"

#include <cstdio>

namespace dusal {

ScreenLines renderScreen(const ScreenState& s) {
  ScreenLines out{};
  if (!s.calibrated) {
    std::snprintf(out.big, sizeof out.big, "Setup");
    std::snprintf(out.line[0], sizeof out.line[0], "Scale not calibrated");
    std::snprintf(out.line[1], sizeof out.line[1], "See serial: zero/cal");
    return out;
  }
  if (s.phase == Phase::Empty) std::snprintf(out.big, sizeof out.big, "No bottle");
  else if (s.phase == Phase::Moving) std::snprintf(out.big, sizeof out.big, "...");
  else if (s.remainingMl >= 0) std::snprintf(out.big, sizeof out.big, "%d ml", s.remainingMl);
  else std::snprintf(out.big, sizeof out.big, "? ml");

  if (s.phase == Phase::Present && !s.hasTare) std::snprintf(out.line[0], sizeof out.line[0], "Empty bottle? BOOT");
  else if (s.lastDrinkMl > 0) std::snprintf(out.line[0], sizeof out.line[0], "Last drink %d ml", s.lastDrinkMl);

  std::snprintf(out.line[1], sizeof out.line[1], "WiFi %s  Clock %s", s.wifi ? "ok" : "--", s.clock ? "ok" : "--");
  if (s.dropped) std::snprintf(out.line[2], sizeof out.line[2], "Unsent %u lost %lu", static_cast<unsigned>(s.unsent), static_cast<unsigned long>(s.dropped));
  else std::snprintf(out.line[2], sizeof out.line[2], s.unsent ? "Unsent %u" : "All sent", static_cast<unsigned>(s.unsent));
  return out;
}

}  // namespace dusal
