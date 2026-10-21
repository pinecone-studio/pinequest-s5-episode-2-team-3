#include <cstring>
#include "check.h"

void intake_tests();
void queue_tests();
void payload_tests();
void screen_tests();
void emit_samples();

int main(int argc, char** argv) {
  if (argc > 1 && std::strcmp(argv[1], "--emit") == 0) { emit_samples(); return 0; }
  intake_tests();
  queue_tests();
  payload_tests();
  screen_tests();
  std::printf("%d checks, %d failed\n", g_checks, g_failures);
  return g_failures ? 1 : 0;
}
