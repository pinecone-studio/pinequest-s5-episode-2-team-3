#include <cstdint>
#include "check.h"
#include "payload.h"
#include "queue.h"

using namespace dusal;

void queue_tests() {
  {  // oldest first; full queue drops (and counts) the oldest
    DrinkQueue q;
    for (uint32_t i = 0; i < DrinkQueue::kCapacity + 2; i++) q.push({1, i, 100, true, 1000 + i});
    CHECK_EQ(q.size(), DrinkQueue::kCapacity);
    CHECK_EQ(q.dropped(), 2u);
    CHECK_EQ(q.front()->n, 2u);
    q.pop();
    CHECK_EQ(q.front()->n, 3u);
  }
  {  // survives a restart byte-for-byte; any corruption is detected
    DrinkQueue q;
    q.push({7, 1, 250, true, 1760954400123});
    q.push({7, 2, 40, false, 5000});
    uint8_t blob[DrinkQueue::kMaxBytes];
    const size_t length = q.serialize(blob, sizeof blob);
    CHECK(length > 0);
    DrinkQueue back;
    CHECK(back.deserialize(blob, length));
    CHECK_EQ(back.size(), 2u);
    CHECK_EQ(back.at(0).atMs, 1760954400123);
    CHECK_EQ(back.at(1).amountMl, 40);
    CHECK(!back.at(1).timed);
    blob[10] ^= 1;
    CHECK(!back.deserialize(blob, length));
    CHECK(back.empty());
    CHECK(!back.deserialize(blob, 3));
  }
  {  // full queue fits the stored blob size
    DrinkQueue q;
    for (uint32_t i = 0; i < DrinkQueue::kCapacity; i++) q.push({1, i, 100, true, 0});
    uint8_t blob[DrinkQueue::kMaxBytes];
    CHECK_EQ(q.serialize(blob, sizeof blob), DrinkQueue::kMaxBytes);
    CHECK_EQ(q.serialize(blob, sizeof blob - 1), 0u);
  }
  {  // clock arrives: this boot's drinks get their real time, an earlier boot's get "now"
    DrinkQueue q;
    q.push({3, 1, 100, false, 60000});
    q.push({2, 9, 100, false, 1000});
    q.push({3, 2, 100, true, 1700000000000});
    q.stampTimes(3, 90000, 1760954400000);
    CHECK_EQ(q.at(0).atMs, 1760954400000 - 30000);
    CHECK_EQ(q.at(1).atMs, 1760954400000);
    CHECK_EQ(q.at(2).atMs, 1700000000000);
    CHECK(q.at(0).timed && q.at(1).timed);
  }
}

void payload_tests() {
  char out[256];
  CHECK(formatIso(0, out, sizeof out) > 0);
  CHECK_STR(out, "1970-01-01T00:00:00.000Z");
  formatIso(1760954400123, out, sizeof out);
  CHECK_STR(out, "2025-10-20T10:00:00.123Z");
  formatIso(1709168523004, out, sizeof out);
  CHECK_STR(out, "2024-02-29T01:02:03.004Z");
  CHECK_EQ(formatIso(-1, out, sizeof out), -1);
  CHECK_EQ(formatIso(0, out, 10), -1);

  CHECK(drinkId(out, sizeof out, "base-01", 4294967295u, 4294967295u) > 0);
  CHECK_STR(out, "base-01-e-4294967295-4294967295");
  CHECK_EQ(drinkId(out, sizeof out, "bad id", 1, 1), -1);
  CHECK_EQ(drinkId(out, sizeof out, "", 1, 1), -1);
  CHECK_EQ(drinkId(out, sizeof out, "a234567890123456789012345678901234567890x", 1, 1), -1);
  // Longest allowed device ID plus the largest counters still fits the API's 64 characters.
  CHECK(drinkId(out, sizeof out, "a234567890123456789012345678901234567890", 4294967295u, 4294967295u) > 0);
  CHECK(std::strlen(out) > 64 ? false : true);

  CHECK(drinkJson(out, sizeof out, "base-01", {5, 12, 250, true, 1760954400123}) > 0);
  CHECK_STR(out, "{\"version\":1,\"id\":\"base-01-e-5-12\",\"deviceId\":\"base-01\",\"at\":\"2025-10-20T10:00:00.123Z\",\"amount\":250}");
  CHECK_EQ(drinkJson(out, sizeof out, "base-01", {5, 12, 250, false, 1000}), -1);
  CHECK_EQ(drinkJson(out, sizeof out, "base-01", {5, 12, 0, true, 0}), -1);

  readingJson(out, sizeof out, "base-01", 5, 3, 1760954400123, 500, 750);
  CHECK_STR(out, "{\"version\":1,\"id\":\"base-01-r-5-3\",\"deviceId\":\"base-01\",\"at\":\"2025-10-20T10:00:00.123Z\",\"capacityMl\":750,\"stable\":true,\"remainingMl\":500}");
  readingJson(out, sizeof out, "base-01", 5, 4, 1760954400123, -1, 0);
  CHECK_STR(out, "{\"version\":1,\"id\":\"base-01-r-5-4\",\"deviceId\":\"base-01\",\"at\":\"2025-10-20T10:00:00.123Z\",\"capacityMl\":1,\"stable\":false,\"remainingMl\":null}");
  readingJson(out, sizeof out, "base-01", 5, 5, 1760954400123, 900, 600);
  CHECK(std::strstr(out, "\"capacityMl\":900,\"stable\":true,\"remainingMl\":900") != nullptr);
  CHECK_EQ(readingJson(out, 20, "base-01", 5, 5, 0, 1, 1), -1);
}

// `core_test --emit` prints sample bodies; tests/firmware-contract.test.ts checks them with the Worker.
void emit_samples() {
  char out[256];
  drinkJson(out, sizeof out, "base-01", {5, 12, 250, true, 1760954400123});
  std::printf("event %s\n", out);
  readingJson(out, sizeof out, "base-01", 5, 3, 1760954400123, 500, 750);
  std::printf("reading %s\n", out);
  readingJson(out, sizeof out, "base-01", 5, 4, 1760954400124, -1, 0);
  std::printf("reading %s\n", out);
}
