#pragma once
#include <cstddef>
#include <cstdint>
#include "queue.h"

// JSON bodies for the Worker (docs/device-ingestion.md). Each returns the length written,
// or -1 if it does not fit or the result would break the API's rules (IDs ≤ 64 characters).
namespace dusal {

constexpr int kMaxIdLength = 64;

// "2026-10-20T10:00:00.123Z" from UTC epoch milliseconds.
int formatIso(int64_t epochMs, char* out, size_t capacity);

int drinkId(char* out, size_t capacity, const char* deviceId, uint32_t boot, uint32_t n);
int readingId(char* out, size_t capacity, const char* deviceId, uint32_t boot, uint32_t n);

// POST /api/devices/:id/events. The drink must be timed.
int drinkJson(char* out, size_t capacity, const char* deviceId, const Drink& drink);

// POST /api/devices/:id/readings. remainingMl < 0 means unknown (lifted, moving or no tare):
// sent as stable:false, remainingMl:null so the app shows "?" instead of an empty bottle.
int readingJson(char* out, size_t capacity, const char* deviceId, uint32_t boot, uint32_t n,
                int64_t epochMs, int remainingMl, int capacityMl);

bool validDeviceId(const char* deviceId);

}  // namespace dusal
