#include "payload.h"

#include <cstdio>
#include <cstring>

namespace dusal {

namespace {
// Days since 1970-01-01 → civil date (Howard Hinnant's algorithm); no gmtime/timezone involved.
void civil(int64_t days, int& year, unsigned& month, unsigned& day) {
  days += 719468;
  const int64_t era = (days >= 0 ? days : days - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(days - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  day = doy - (153 * mp + 2) / 5 + 1;
  month = mp < 10 ? mp + 3 : mp - 9;
  year = static_cast<int>(yoe + era * 400 + (month <= 2));
}

int fit(int written, size_t capacity) {
  return written < 0 || static_cast<size_t>(written) >= capacity ? -1 : written;
}

int makeId(char* out, size_t capacity, const char* deviceId, char kind, uint32_t boot, uint32_t n) {
  if (!validDeviceId(deviceId)) return -1;
  const int written = fit(std::snprintf(out, capacity, "%s-%c-%lu-%lu", deviceId, kind,
                                        static_cast<unsigned long>(boot), static_cast<unsigned long>(n)), capacity);
  return written > kMaxIdLength ? -1 : written;
}
}  // namespace

bool validDeviceId(const char* deviceId) {
  const size_t length = std::strlen(deviceId);
  if (length == 0 || length > 40) return false;
  for (size_t i = 0; i < length; i++) {
    const char c = deviceId[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-')) return false;
  }
  return true;
}

int formatIso(int64_t epochMs, char* out, size_t capacity) {
  if (epochMs < 0) return -1;
  const int64_t days = epochMs / 86400000;
  const int64_t ms = epochMs % 86400000;
  int year; unsigned month, day;
  civil(days, year, month, day);
  return fit(std::snprintf(out, capacity, "%04d-%02u-%02uT%02d:%02d:%02d.%03dZ", year, month, day,
                           static_cast<int>(ms / 3600000), static_cast<int>(ms / 60000 % 60),
                           static_cast<int>(ms / 1000 % 60), static_cast<int>(ms % 1000)), capacity);
}

int drinkId(char* out, size_t capacity, const char* deviceId, uint32_t boot, uint32_t n) {
  return makeId(out, capacity, deviceId, 'e', boot, n);
}

int readingId(char* out, size_t capacity, const char* deviceId, uint32_t boot, uint32_t n) {
  return makeId(out, capacity, deviceId, 'r', boot, n);
}

int drinkJson(char* out, size_t capacity, const char* deviceId, const Drink& drink) {
  char id[kMaxIdLength + 1], at[32];
  if (!drink.timed || drink.amountMl < 1 || drink.amountMl > 5000) return -1;
  if (drinkId(id, sizeof id, deviceId, drink.boot, drink.n) < 0 || formatIso(drink.atMs, at, sizeof at) < 0) return -1;
  return fit(std::snprintf(out, capacity, "{\"version\":1,\"id\":\"%s\",\"deviceId\":\"%s\",\"at\":\"%s\",\"amount\":%u}",
                           id, deviceId, at, static_cast<unsigned>(drink.amountMl)), capacity);
}

int readingJson(char* out, size_t capacity, const char* deviceId, uint32_t boot, uint32_t n,
                int64_t epochMs, int remainingMl, int capacityMl) {
  char id[kMaxIdLength + 1], at[32];
  if (readingId(id, sizeof id, deviceId, boot, n) < 0 || formatIso(epochMs, at, sizeof at) < 0) return -1;
  // The API needs 1–5000 ml capacity with remaining ≤ capacity; capacity is only an estimate for any bottle.
  if (capacityMl < remainingMl) capacityMl = remainingMl;
  if (capacityMl < 1) capacityMl = 1;
  if (capacityMl > 5000) capacityMl = 5000;
  if (remainingMl > capacityMl) remainingMl = capacityMl;
  if (remainingMl < 0) {
    return fit(std::snprintf(out, capacity, "{\"version\":1,\"id\":\"%s\",\"deviceId\":\"%s\",\"at\":\"%s\",\"capacityMl\":%d,\"stable\":false,\"remainingMl\":null}",
                             id, deviceId, at, capacityMl), capacity);
  }
  return fit(std::snprintf(out, capacity, "{\"version\":1,\"id\":\"%s\",\"deviceId\":\"%s\",\"at\":\"%s\",\"capacityMl\":%d,\"stable\":true,\"remainingMl\":%d}",
                           id, deviceId, at, capacityMl, remainingMl), capacity);
}

int speechJson(char* out, size_t capacity, const char* text, const char* modelId) {
  if (!text[0]) return -1;
  int length = std::snprintf(out, capacity, "{\"text\":\"");
  if (fit(length, capacity) < 0) return -1;
  for (const char* c = text; *c; c++) {
    const unsigned char u = static_cast<unsigned char>(*c);
    char escaped[8];
    if (u == '"' || u == '\\') std::snprintf(escaped, sizeof escaped, "\\%c", u);
    else if (u == '\n') std::snprintf(escaped, sizeof escaped, "\\n");
    else if (u < 0x20) std::snprintf(escaped, sizeof escaped, "\\u%04x", u);
    else { escaped[0] = static_cast<char>(u); escaped[1] = 0; }
    const size_t add = std::strlen(escaped);
    if (static_cast<size_t>(length) + add >= capacity) return -1;
    std::memcpy(out + length, escaped, add + 1);
    length += static_cast<int>(add);
  }
  const int tail = std::snprintf(out + length, capacity - length, "\",\"model_id\":\"%s\"}", modelId);
  return fit(tail, capacity - length) < 0 ? -1 : length + tail;
}

}  // namespace dusal
