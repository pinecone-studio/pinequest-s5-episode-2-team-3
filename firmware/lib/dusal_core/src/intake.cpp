#include "intake.h"

#include <cmath>
#include <cstdlib>

namespace dusal {

IntakeTracker::IntakeTracker(IntakeConfig config) : config_(config) {
  if (config_.window < 2) config_.window = 2;
  if (config_.window > kMaxWindow) config_.window = kMaxWindow;
}

Update IntakeTracker::feed(float grams, uint32_t nowMs) {
  samples_[next_] = grams;
  next_ = (next_ + 1) % config_.window;
  if (count_ < config_.window) count_++;

  float low = samples_[0], high = samples_[0], sum = 0;
  for (uint8_t i = 0; i < count_; i++) {
    low = std::fmin(low, samples_[i]);
    high = std::fmax(high, samples_[i]);
    sum += samples_[i];
  }
  if (count_ < config_.window || high - low > config_.stableBandG) {
    inBand_ = settled_ = false;
    phase_ = Phase::Moving;
    return {};
  }
  if (!inBand_) { inBand_ = true; bandSince_ = nowMs; }
  if (settled_ || nowMs - bandSince_ < config_.settleMs) {
    if (!settled_) phase_ = Phase::Moving;
    return {};
  }
  settled_ = true;
  settledG_ = static_cast<int>(std::lround(sum / count_));
  phase_ = settledG_ < config_.presentMinG ? Phase::Empty : Phase::Present;
  return evaluate(settledG_);
}

Update IntakeTracker::evaluate(int grams) {
  // Lifted: keep the anchor so the drink is counted when the bottle comes back.
  if (phase_ == Phase::Empty) return {};
  Update update;
  if (!hasAnchor_) {
    hasAnchor_ = true;
    anchorG_ = grams;
    update.change = Change::Placed;
  } else {
    const int delta = anchorG_ - grams;
    if (delta < config_.minDrinkMl && -delta < config_.minChangeMl) {
      update.change = Change::Noise;
    } else if (std::abs(delta) > config_.maxChangeMl) {
      anchorG_ = grams;
      hasTare_ = false;
      capacityMl_ = 0;
      update.change = Change::Swapped;
    } else {
      anchorG_ = grams;
      update.change = delta > 0 ? Change::Drink : Change::Refill;
      update.amountMl = std::abs(delta);
    }
  }
  const int left = remainingMl();
  if (left > capacityMl_) capacityMl_ = left > config_.maxChangeMl ? config_.maxChangeMl : left;
  return update;
}

bool IntakeTracker::tareBottle() {
  if (phase_ != Phase::Present) return false;
  tareG_ = static_cast<float>(settledG_);
  hasTare_ = true;
  hasAnchor_ = true;
  anchorG_ = settledG_;
  capacityMl_ = 0;
  return true;
}

int IntakeTracker::remainingMl() const {
  if (!hasTare_ || phase_ != Phase::Present) return -1;
  const int left = static_cast<int>(std::lround(settledG_ - tareG_));
  if (left < 0) return 0;
  return left > config_.maxChangeMl ? config_.maxChangeMl : left;
}

int IntakeTracker::capacityMl() const {
  const int left = remainingMl();
  return left > capacityMl_ ? left : capacityMl_;
}

}  // namespace dusal
