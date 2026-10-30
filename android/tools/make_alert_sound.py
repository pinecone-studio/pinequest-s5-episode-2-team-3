#!/usr/bin/env python3
"""Makes the amount alert's sound (app/src/main/res/raw/sos_alert.wav): a harsh "ДРРР ДРРРР" buzzer.

Played by Buzz.java with the strong buzz, in the same rhythm (Buzz.PATTERN): each pulse is a square
wave whose pitch rattles 40 times a second between two notes, like an emergency buzzer. Made here,
not recorded, so the app ships no third-party sound.
  python3 android/tools/make_alert_sound.py
"""
import os
import struct
import wave

OUT = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'res', 'raw', 'sos_alert.wav')
RATE = 22050
PATTERN = [0, 1000, 300, 1000, 300, 1000, 300, 1500]  # ms off, on, off, on...; Buzz.PATTERN
LOW, HIGH, RATTLE = 620, 880, 40  # Hz: the two notes, and how often the pitch flips between them
VOLUME = 0.9
EDGE_MS = 8  # fade in and out of each pulse, so it starts and stops without a click


def pulse(ms):
    n = RATE * ms // 1000
    edge = RATE * EDGE_MS // 1000
    phase, out = 0.0, []
    for i in range(n):
        note = HIGH if int(i * RATTLE * 2 / RATE) % 2 else LOW
        phase += note / RATE
        square = 1.0 if phase % 1 < 0.5 else -1.0
        fade = min(1.0, i / edge, (n - i) / edge)
        out.append(square * VOLUME * fade)
    return out


def main():
    samples = []
    for i, ms in enumerate(PATTERN):
        samples += pulse(ms) if i % 2 else [0.0] * (RATE * ms // 1000)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with wave.open(OUT, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b''.join(struct.pack('<h', int(s * 32767)) for s in samples))
    print(f'{len(samples) / RATE:.1f} s -> {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
