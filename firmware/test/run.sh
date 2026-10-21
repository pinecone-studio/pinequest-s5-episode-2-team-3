#!/bin/sh
# Compile and run the firmware core tests on this computer (no ESP32 needed).
set -e
cd "$(dirname "$0")"
mkdir -p build
c++ -std=c++17 -Wall -Wextra -Werror -I../lib/dusal_core/src ../lib/dusal_core/src/*.cpp *.cpp -o build/core_test
./build/core_test
