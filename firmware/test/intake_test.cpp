#include "check.h"
#include "intake.h"

#include <cmath>

using namespace dusal;

namespace {
uint32_t now = 0;

// Jostle the base (out of band), then hold `grams` steady for 4 s; returns the change at settle.
Update settle(IntakeTracker& t, float grams) {
  t.feed(grams + 80, now += 100);
  t.feed(grams - 80, now += 100);
  Update result;
  for (int i = 0; i < 40; i++) {
    Update u = t.feed(grams + (i % 2 ? 1.0f : -1.0f), now += 100);
    if (u.change != Change::None) result = u;
  }
  return result;
}
}  // namespace

void intake_tests() {
  {  // place, lift, drink, refill
    IntakeTracker t;
    CHECK(settle(t, 820).change == Change::Placed);
    CHECK(settle(t, 0).change == Change::None);
    CHECK(t.phase() == Phase::Empty);
    CHECK(t.hasAnchor());
    Update drink = settle(t, 570);
    CHECK(drink.change == Change::Drink);
    CHECK_EQ(drink.amountMl, 250);
    Update refill = settle(t, 800);
    CHECK(refill.change == Change::Refill);
    CHECK_EQ(refill.amountMl, 230);
  }
  {  // settle needs the full window in band for settleMs; jitter inside the band is not a change
    IntakeTracker t;
    now = 0;
    Update u;
    for (int i = 0; i < 14; i++) u = t.feed(500, now += 100);
    CHECK(u.change == Change::None);
    CHECK(t.phase() == Phase::Moving);
    for (int i = 0; i < 20 && u.change == Change::None; i++) u = t.feed(500, now += 100);
    CHECK(u.change == Change::Placed);
    for (int i = 0; i < 50; i++) CHECK(t.feed(500 + (i % 3), now += 100).change == Change::None);
  }
  {  // drops under 100 ml keep the anchor, so small sips add up into one drink
    IntakeTracker t;
    settle(t, 750);
    CHECK(settle(t, 745).change == Change::Noise);
    CHECK(settle(t, 700).change == Change::Noise);
    CHECK(settle(t, 660).change == Change::Noise);
    Update sip = settle(t, 640);
    CHECK(sip.change == Change::Drink);
    CHECK_EQ(sip.amountMl, 110);
  }
  {  // a small rise is still a refill and moves the anchor
    IntakeTracker t;
    settle(t, 500);
    Update refill = settle(t, 540);
    CHECK(refill.change == Change::Refill);
    CHECK_EQ(refill.amountMl, 40);
    CHECK(settle(t, 460).change == Change::Noise);
  }
  {  // the settled weight is the mean of 4 window averages taken 200 ms apart
    IntakeTracker t;
    now = 0;
    Update u;
    int feeds = 0;
    // Drifts 1 g every sample inside the 15 g band, so each measurement sees a different average.
    while (u.change == Change::None && feeds < 100) u = t.feed(600 + (feeds++ % 10), now += 100);
    CHECK(u.change == Change::Placed);
    CHECK_EQ(feeds, 31);  // 1 s to fill the window, 1.5 s still, then measurements at +0, +200, +400, +600 ms
    CHECK_EQ(static_cast<int>(t.measurementCount()), 4);
    float sum = 0;
    for (uint8_t i = 0; i < t.measurementCount(); i++) sum += t.measurement(i);
    CHECK_EQ(t.settledG(), static_cast<int>(std::lround(sum / 4)));
  }
  {  // a drink reports the weight it was measured against
    IntakeTracker t;
    settle(t, 850);
    Update drink = settle(t, 741);
    CHECK(drink.change == Change::Drink);
    CHECK_EQ(drink.amountMl, 109);
    CHECK_EQ(drink.fromG, 850);
  }
  {  // drinking it all: a bottle back on the base at its empty weight counts the rest
    IntakeTracker t;
    settle(t, 600);
    settle(t, 0);
    Update all = settle(t, 200);
    CHECK(all.change == Change::Drink);
    CHECK_EQ(all.amountMl, 400);
  }
  {  // remaining water needs a tare; capacity is the most water seen since then
    IntakeTracker t;
    settle(t, 300);
    CHECK_EQ(t.remainingMl(), -1);
    CHECK(t.tareBottle());
    CHECK_EQ(t.remainingMl(), 0);
    CHECK(settle(t, 1050).change == Change::Refill);
    CHECK_EQ(t.remainingMl(), 750);
    CHECK_EQ(t.capacityMl(), 750);
    settle(t, 550);
    CHECK_EQ(t.remainingMl(), 250);
    CHECK_EQ(t.capacityMl(), 750);
    settle(t, 0);
    CHECK_EQ(t.remainingMl(), -1);
    CHECK_EQ(t.capacityMl(), 750);
  }
  {  // tare only works with a settled bottle on the base
    IntakeTracker t;
    CHECK(!t.tareBottle());
    settle(t, 0);
    CHECK(!t.tareBottle());
  }
  {  // a jump bigger than any drink is a different bottle: no event, tare cleared
    IntakeTracker t;
    settle(t, 6000);
    CHECK(t.tareBottle());
    Update swap = settle(t, 300);
    CHECK(swap.change == Change::Swapped);
    CHECK(!t.hasTare());
    CHECK(settle(t, 100).change == Change::Drink);
  }
  {  // a restored tare from flash gives remaining water right after a restart
    IntakeTracker t;
    t.restoreTare(300);
    settle(t, 800);
    CHECK_EQ(t.remainingMl(), 500);
  }
}
