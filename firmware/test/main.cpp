#include "check.h"

void intake_tests();

int main() {
  intake_tests();
  std::printf("%d checks, %d failed\n", g_checks, g_failures);
  return g_failures ? 1 : 0;
}
