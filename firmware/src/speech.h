#pragma once

// Speaker output over I2S and ElevenLabs text-to-speech, for boards with HAS_SPEAKER.
namespace speech {

struct Voice {
  const char* apiKey;
  const char* voiceId;
  const char* modelId;
};

// Sets up I2S once; false on boards without a speaker or when the driver fails.
bool begin();

// Short test tone: proves the speaker and wiring without Wi-Fi or an API key.
void beep();

// Asks ElevenLabs to read `text` and plays it while it downloads. Blocks until done (a few seconds).
// Needs Wi-Fi; false (with the reason on serial) when it cannot speak.
bool say(const char* text, const Voice& voice);

}  // namespace speech
