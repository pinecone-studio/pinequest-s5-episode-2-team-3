#include "speech.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <driver/i2s.h>
#include <math.h>
#include "config.h"
#include "payload.h"

namespace speech {

namespace {
// ElevenLabs sends raw 16-bit little-endian mono PCM at this rate (output_format=pcm_16000).
constexpr int kSampleRate = 16000;
constexpr i2s_port_t kPort = I2S_NUM_0;
bool ready = false;

int16_t scaled(int16_t sample) { return static_cast<int16_t>(sample * SPEAKER_VOLUME); }

// Writes mono samples as left+right frames, so the amplifier plays them whichever slot it listens to.
void playFrames(const int16_t* mono, size_t count) {
  int16_t frames[256 * 2];
  while (count) {
    const size_t n = count < 256 ? count : 256;
    for (size_t i = 0; i < n; i++) frames[2 * i] = frames[2 * i + 1] = scaled(mono[i]);
    size_t written;
    i2s_write(kPort, frames, n * 2 * sizeof(int16_t), &written, portMAX_DELAY);
    mono += n;
    count -= n;
  }
}

// HTTPClient::writeToStream decodes chunked responses and pushes the body here; bytes can split a sample.
class SpeakerStream : public Stream {
 public:
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
  size_t write(uint8_t b) override { return write(&b, 1); }
  size_t write(const uint8_t* data, size_t size) override {
    int16_t mono[256];
    size_t n = 0;
    for (size_t i = 0; i < size; i++) {
      if (!hasLow_) { low_ = data[i]; hasLow_ = true; continue; }
      mono[n++] = static_cast<int16_t>(low_ | (data[i] << 8));
      hasLow_ = false;
      if (n == 256) { playFrames(mono, n); n = 0; }
    }
    if (n) playFrames(mono, n);
    return size;
  }

 private:
  uint8_t low_ = 0;
  bool hasLow_ = false;
};
}  // namespace

bool begin() {
  if (ready) return true;
  if (!HAS_SPEAKER) return false;
  i2s_config_t config = {};
  config.mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX);
  config.sample_rate = kSampleRate;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.dma_buf_count = 8;
  config.dma_buf_len = 256;
  config.tx_desc_auto_clear = true;  // silence instead of a repeating buffer when playback stops
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_SPK_BCLK;
  pins.ws_io_num = PIN_SPK_LRCK;
  pins.data_out_num = PIN_SPK_DOUT;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  if (i2s_driver_install(kPort, &config, 0, nullptr) != ESP_OK || i2s_set_pin(kPort, &pins) != ESP_OK) {
    Serial.println("speaker: I2S setup failed");
    return false;
  }
  i2s_zero_dma_buffer(kPort);
  ready = true;
  return true;
}

void beep() {
  if (!begin()) { Serial.println("speaker: this board has none (HAS_SPEAKER in config.h)"); return; }
  static int16_t tone[kSampleRate / 4];  // 250 ms at 880 Hz; static: 8 KB would overflow the loop task's stack
  for (size_t i = 0; i < sizeof tone / sizeof tone[0]; i++) {
    tone[i] = static_cast<int16_t>(12000 * sinf(2 * PI * 880 * i / kSampleRate));
  }
  playFrames(tone, sizeof tone / sizeof tone[0]);
  i2s_zero_dma_buffer(kPort);
}

bool say(const char* text, const Voice& voice) {
  if (!begin()) { Serial.println("speaker: this board has none (HAS_SPEAKER in config.h)"); return false; }
  if (!voice.apiKey[0]) { Serial.println("speech: set ELEVENLABS_API_KEY in include/secrets.h"); return false; }
  if (WiFi.status() != WL_CONNECTED) { Serial.println("speech: needs Wi-Fi (WIFI_SSID in include/secrets.h)"); return false; }
  static char body[1200];
  const int length = dusal::speechJson(body, sizeof body, text, voice.modelId);
  if (length < 0) { Serial.println("speech: text is empty or longer than about 1000 bytes"); return false; }

  WiFiClientSecure client;
  client.setInsecure();  // Prototype only, like the API upload; the key goes to api.elevenlabs.io over TLS.
  HTTPClient http;
  http.setTimeout(15000);
  const String url = String("https://api.elevenlabs.io/v1/text-to-speech/") + voice.voiceId + "/stream?output_format=pcm_16000";
  if (!http.begin(client, url)) { Serial.println("speech: could not reach ElevenLabs"); return false; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("xi-api-key", voice.apiKey);
  Serial.println("speech: asking ElevenLabs...");
  const int status = http.POST(reinterpret_cast<uint8_t*>(body), length);
  if (status != 200) {
    // 401: wrong key, 402/429: out of credits or rate limited, 422: bad voice/model or text.
    Serial.printf("speech: ElevenLabs answered %d: %s\n", status, status > 0 ? http.getString().substring(0, 200).c_str() : "no connection");
    http.end();
    return false;
  }
  SpeakerStream speaker;
  const int played = http.writeToStream(&speaker);
  http.end();
  i2s_zero_dma_buffer(kPort);
  if (played < 0) { Serial.printf("speech: playback stopped (%d)\n", played); return false; }
  Serial.printf("speech: played %.1f s\n", played / 2.0f / kSampleRate);
  return true;
}

}  // namespace speech
