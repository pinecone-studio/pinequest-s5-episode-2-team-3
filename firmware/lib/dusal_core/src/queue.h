#pragma once
#include <cstddef>
#include <cstdint>

namespace dusal {

// One detected drink waiting for the server's ACK. Its ID (boot + n) is fixed when it is
// recorded, so a retry after a lost response or a restart is recognised as the same drink.
struct Drink {
  uint32_t boot = 0;      // restart counter when the drink happened
  uint32_t n = 0;         // drink number within that boot
  uint16_t amountMl = 0;
  bool timed = false;     // true: atMs is UTC epoch ms; false: ms since that boot (clock not set yet)
  int64_t atMs = 0;
};

// Oldest-first queue that survives restarts as a checksummed byte blob (stored in flash).
class DrinkQueue {
 public:
  static constexpr size_t kCapacity = 128;
  static constexpr size_t kRecordBytes = 19;
  static constexpr size_t kMaxBytes = 4 + 1 + 4 + kCapacity * kRecordBytes + 4;

  size_t size() const { return count_; }
  bool empty() const { return count_ == 0; }
  const Drink* front() const { return count_ ? &items_[0] : nullptr; }
  const Drink& at(size_t i) const { return items_[i]; }
  uint32_t dropped() const { return dropped_; }

  // When full the oldest drink is dropped (and counted) so the newest are kept.
  void push(const Drink& drink);
  void pop();

  // The clock became valid: give this boot's drinks their real time. Drinks from an earlier boot
  // that never got a time are stamped with the current time (late, but still counted).
  void stampTimes(uint32_t boot, uint64_t uptimeMs, int64_t epochMs);

  size_t serialize(uint8_t* out, size_t capacity) const;
  bool deserialize(const uint8_t* data, size_t length);  // false (and empty) if corrupt

 private:
  Drink items_[kCapacity];
  size_t count_ = 0;
  uint32_t dropped_ = 0;
};

uint32_t fnv1a(const uint8_t* data, size_t length);

}  // namespace dusal
