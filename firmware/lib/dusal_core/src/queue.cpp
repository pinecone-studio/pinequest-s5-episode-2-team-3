#include "queue.h"

namespace dusal {

namespace {
constexpr uint8_t kMagic[4] = {'D', 'Q', 'U', '1'};

void put(uint8_t*& p, uint64_t value, int bytes) {
  for (int i = 0; i < bytes; i++) *p++ = static_cast<uint8_t>(value >> (8 * i));
}
uint64_t get(const uint8_t*& p, int bytes) {
  uint64_t value = 0;
  for (int i = 0; i < bytes; i++) value |= static_cast<uint64_t>(*p++) << (8 * i);
  return value;
}
}  // namespace

uint32_t fnv1a(const uint8_t* data, size_t length) {
  uint32_t hash = 2166136261u;
  for (size_t i = 0; i < length; i++) { hash ^= data[i]; hash *= 16777619u; }
  return hash;
}

void DrinkQueue::push(const Drink& drink) {
  if (count_ == kCapacity) { pop(); dropped_++; }
  items_[count_++] = drink;
}

void DrinkQueue::pop() {
  if (!count_) return;
  for (size_t i = 1; i < count_; i++) items_[i - 1] = items_[i];
  count_--;
}

void DrinkQueue::stampTimes(uint32_t boot, uint64_t uptimeMs, int64_t epochMs) {
  for (size_t i = 0; i < count_; i++) {
    Drink& d = items_[i];
    if (d.timed) continue;
    const bool sameBoot = d.boot == boot && static_cast<uint64_t>(d.atMs) <= uptimeMs;
    d.atMs = sameBoot ? epochMs - static_cast<int64_t>(uptimeMs - static_cast<uint64_t>(d.atMs)) : epochMs;
    d.timed = true;
  }
}

size_t DrinkQueue::serialize(uint8_t* out, size_t capacity) const {
  const size_t length = 4 + 1 + 4 + count_ * kRecordBytes + 4;
  if (capacity < length) return 0;
  uint8_t* p = out;
  for (uint8_t b : kMagic) *p++ = b;
  put(p, count_, 1);
  put(p, dropped_, 4);
  for (size_t i = 0; i < count_; i++) {
    const Drink& d = items_[i];
    put(p, d.boot, 4);
    put(p, d.n, 4);
    put(p, d.amountMl, 2);
    put(p, d.timed ? 1 : 0, 1);
    put(p, static_cast<uint64_t>(d.atMs), 8);
  }
  put(p, fnv1a(out, static_cast<size_t>(p - out)), 4);
  return length;
}

bool DrinkQueue::deserialize(const uint8_t* data, size_t length) {
  count_ = 0;
  dropped_ = 0;
  if (length < 13) return false;
  for (int i = 0; i < 4; i++) if (data[i] != kMagic[i]) return false;
  const size_t count = data[4];
  if (count > kCapacity || length != 4 + 1 + 4 + count * kRecordBytes + 4) return false;
  const uint8_t* tail = data + length - 4;
  if (fnv1a(data, length - 4) != static_cast<uint32_t>(get(tail, 4))) return false;
  const uint8_t* p = data + 5;
  const uint32_t dropped = static_cast<uint32_t>(get(p, 4));
  for (size_t i = 0; i < count; i++) {
    Drink& d = items_[i];
    d.boot = static_cast<uint32_t>(get(p, 4));
    d.n = static_cast<uint32_t>(get(p, 4));
    d.amountMl = static_cast<uint16_t>(get(p, 2));
    d.timed = get(p, 1) != 0;
    d.atMs = static_cast<int64_t>(get(p, 8));
  }
  count_ = count;
  dropped_ = dropped;
  return true;
}

}  // namespace dusal
