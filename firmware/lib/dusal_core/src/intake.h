#pragma once
#include <cstdint>

// Turns raw weight samples from any bottle into drinks and refills. No Arduino code here,
// so it is unit-tested on a computer (firmware/test). Rules match shared/device.ts:
// changes under minChangeMl are noise but small sips accumulate against one anchor, and a
// lifted bottle (empty base) is never counted as drunk.
namespace dusal {

struct IntakeConfig {
  uint8_t window = 10;        // samples that must agree (10 = 1 s at 10 Hz)
  float stableBandG = 4;      // max spread inside the window
  uint32_t settleMs = 1500;   // how long the window must stay in band
  float presentMinG = 30;     // below this the base is empty (bottle lifted)
  int minChangeMl = 10;
  int maxChangeMl = 5000;     // a bigger jump is a different bottle, not a drink
};

enum class Phase : uint8_t { Moving, Empty, Present };
enum class Change : uint8_t { None, Placed, Noise, Drink, Refill, Swapped };

struct Update {
  Change change = Change::None;
  int amountMl = 0;
};

constexpr int kMaxWindow = 32;

class IntakeTracker {
 public:
  explicit IntakeTracker(IntakeConfig config = {});

  // Feed one sample (grams, 1 g of water = 1 ml). Returns a change once each time the weight settles.
  Update feed(float grams, uint32_t nowMs);

  Phase phase() const { return phase_; }
  int settledG() const { return settledG_; }
  bool hasAnchor() const { return hasAnchor_; }

  // The settled bottle on the base is empty: remember its weight so remaining water can be shown.
  bool tareBottle();
  void restoreTare(float bottleG) { tareG_ = bottleG; hasTare_ = true; }
  bool hasTare() const { return hasTare_; }
  float tareG() const { return tareG_; }

  int remainingMl() const;  // -1 when unknown (no tare, lifted or moving)
  int capacityMl() const;   // most water seen since the tare; 0 when unknown

 private:
  Update evaluate(int grams);

  IntakeConfig config_;
  float samples_[kMaxWindow] = {};
  uint8_t count_ = 0;
  uint8_t next_ = 0;
  bool inBand_ = false;
  bool settled_ = false;
  uint32_t bandSince_ = 0;
  Phase phase_ = Phase::Moving;
  int settledG_ = 0;
  bool hasAnchor_ = false;
  int anchorG_ = 0;
  bool hasTare_ = false;
  float tareG_ = 0;
  int capacityMl_ = 0;
};

}  // namespace dusal
