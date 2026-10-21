#pragma once
// Minimal test harness so the core can be tested with any C++17 compiler, no Arduino needed.
#include <cstdio>
#include <cstring>

inline int g_failures = 0;
inline int g_checks = 0;
#define CHECK(cond) do { g_checks++; if (!(cond)) { g_failures++; std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { g_checks++; auto _a = (a); auto _b = (b); if (!(_a == _b)) { g_failures++; std::printf("FAIL %s:%d: %s == %s\n", __FILE__, __LINE__, #a, #b); } } while (0)
#define CHECK_STR(a, b) do { g_checks++; if (std::strcmp((a), (b)) != 0) { g_failures++; std::printf("FAIL %s:%d:\n  got  %s\n  want %s\n", __FILE__, __LINE__, (a), (b)); } } while (0)
