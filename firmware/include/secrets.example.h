#pragma once
// Copy to include/secrets.h (git-ignored) and fill in. Never commit the real file.

constexpr const char* WIFI_SSID = "your-wifi";
constexpr const char* WIFI_PASSWORD = "your-wifi-password";

// Must match a key in the Worker's DEVICE_TOKENS secret. Letters, digits and '-' only, at most 40 characters.
constexpr const char* DEVICE_ID = "base-01";
// 64 random hex characters, e.g. `openssl rand -hex 32`. The same value goes into DEVICE_TOKENS.
constexpr const char* DEVICE_TOKEN = "replace-with-64-hex-characters";

// HTTPS address of the Worker, without a trailing slash.
constexpr const char* API_BASE_URL = "https://dusal-api.bbek3201.workers.dev";

// PEM root certificate of the API host. Empty skips certificate checks (prototype only:
// anyone on the network could then read the device token).
constexpr const char* API_ROOT_CA = "";
