// PolyTrack GPS Telemetry Node
// Hardware: Arduino Uno + SIM7000A Shield + QGP GPS Antenna
// Backend:  FastAPI on AWS EC2 via Caddy reverse proxy (port 80)
#include <SoftwareSerial.h>
#include "config.h"

SoftwareSerial simSerial(SIM_TX_PIN, SIM_RX_PIN);

char responseBuffer[160];
char jsonBuffer[192];

#define CACHE_SIZE 2
char offlineCache[CACHE_SIZE][192];
int cacheCount = 0;

int freeMemory() {
  extern int __heap_start, *__brkval;
  int v;
  return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
}

// ---------------------------------------------------------------------------
// SETUP
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  simSerial.begin(9600);
  Serial.println(F("PolyTrack Node booting..."));

  powerOnShield();

  // Autobaud sync — SIM7000 may ignore first few pings
  bool init = false;
  for (int i = 0; i < 15; i++) {
    if (sendATCommand(F("AT"), "OK", 1000)) { init = true; break; }
    delay(500);
  }
  if (!init) { Serial.println(F("HALT: No modem response.")); while(1); }

  sendATCommand(F("ATE0"), "OK", 1000); // Disable echo

  while (!setupNetwork()) {
    Serial.println(F("Network failed. Retry in 10s..."));
    delay(10000);
  }

  if (!setupGNSS()) Serial.println(F("WARN: GNSS init failed."));

  Serial.print(F("SRAM: ")); Serial.println(freeMemory());
  Serial.println(F("Ready.\n"));
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------
void loop() {
  static int httpFailures = 0;

  if (!sendATCommand(F("AT+CGNSINF"), "OK", 2000)) {
    delay(TELEMETRY_INTERVAL_MS);
    return;
  }

  char* gnss = strstr(responseBuffer, "+CGNSINF: ");
  if (!gnss) { delay(TELEMETRY_INTERVAL_MS); return; }
  gnss += 10;

  // Parse CSV fields in-place (strtok can't handle empty fields)
  char* params[21];
  int paramCount = 0;
  memset(params, 0, sizeof(params));
  char* fld = gnss;
  char* p = gnss;
  while (paramCount < 21) {
    if (*p == ',' || *p == '\r' || *p == '\n' || *p == '\0') {
      char sv = *p; *p = '\0';
      params[paramCount++] = fld;
      if (sv == '\0' || sv == '\r' || sv == '\n') break;
      fld = p + 1; p = fld;
    } else { p++; }
  }

  // Check for valid fix
  if (paramCount < 2 || strcmp(params[0], "1") != 0 || strcmp(params[1], "1") != 0) {
    char* gV = (paramCount > 14 && params[14][0]) ? params[14] : "0";
    char* nV = (paramCount > 15 && params[15][0]) ? params[15] : "0";
    Serial.print(F("No fix. GPS=")); Serial.print(gV);
    Serial.print(F(" GNSS=")); Serial.println(nV);
    delay(TELEMETRY_INTERVAL_MS);
    return;
  }

  // Extract fields
  char* dt  = (paramCount > 2)  ? params[2]  : "";
  char* lat = (paramCount > 3)  ? params[3]  : "0.0";
  char* lng = (paramCount > 4)  ? params[4]  : "0.0";
  char* alt = (paramCount > 5)  ? params[5]  : "0.0";
  char* spd = (paramCount > 6)  ? params[6]  : "0.0";
  char* hdg = (paramCount > 7)  ? params[7]  : "0.0";

  // Convert GNSS datetime to ISO 8601
  char iso[30];
  if (strlen(dt) >= 14) {
    snprintf(iso, sizeof(iso), "%.4s-%.2s-%.2sT%.2s:%.2s:%.2s.000Z",
             dt, dt+4, dt+6, dt+8, dt+10, dt+12);
  } else {
    strcpy(iso, "1970-01-01T00:00:00.000Z");
  }

  Serial.print(F("Fix: ")); Serial.print(lat);
  Serial.print(F(",")); Serial.println(lng);

  // Build JSON payload
  snprintf(jsonBuffer, sizeof(jsonBuffer),
    "{\"device_id\":\"%s\","
    "\"latitude\":%s,"
    "\"longitude\":%s,"
    "\"altitude\":%s,"
    "\"speed\":%s,"
    "\"heading\":%s,"
    "\"recorded_at\":\"%s\"}",
    DEVICE_ID, lat, lng, alt, spd, hdg, iso);

  if (sendTelemetryHTTP(jsonBuffer, false)) {
    httpFailures = 0;
    // Flush offline cache if any
    if (cacheCount > 0 && sendTelemetryHTTP(NULL, true)) {
      cacheCount = 0;
    }
  } else {
    // Cache failed payload
    if (cacheCount < CACHE_SIZE) {
      strcpy(offlineCache[cacheCount++], jsonBuffer);
    } else {
      strcpy(offlineCache[0], offlineCache[1]);
      strcpy(offlineCache[1], jsonBuffer);
    }
    if (++httpFailures >= 3) {
      Serial.println(F("Auto-recovering network..."));
      while (!setupNetwork()) delay(10000);
      httpFailures = 0;
    }
  }

  delay(TELEMETRY_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// HARDWARE
// ---------------------------------------------------------------------------
void powerOnShield() {
  pinMode(PWRKEY_PIN, OUTPUT);
  for (int i = 0; i < 3; i++) {
    if (sendATCommand(F("AT"), "OK", 500)) return;
  }
  digitalWrite(PWRKEY_PIN, LOW);
  delay(1200);
  digitalWrite(PWRKEY_PIN, HIGH);
  delay(3000);
}

// ---------------------------------------------------------------------------
// SERIAL / AT COMMANDS
// ---------------------------------------------------------------------------
bool expectResponse(const char* expected, unsigned long timeout) {
  unsigned long start = millis();
  int idx = 0;
  memset(responseBuffer, 0, sizeof(responseBuffer));

  while (millis() - start < timeout) {
    while (simSerial.available() > 0) {
      char c = simSerial.read();
      if (idx < sizeof(responseBuffer) - 1) responseBuffer[idx++] = c;
    }
    if (strstr(responseBuffer, expected) != NULL) {
      // Drain remaining bytes until 100ms of silence
      unsigned long quiet = millis();
      while (millis() - quiet < 100) {
        while (simSerial.available() > 0) {
          char c = simSerial.read();
          if (idx < sizeof(responseBuffer) - 1) responseBuffer[idx++] = c;
          quiet = millis();
        }
      }
      return true;
    }
  }
  return false;
}

bool sendATCommand(const __FlashStringHelper* cmd, const char* expected, unsigned long timeout) {
  simSerial.println(cmd);
  return expectResponse(expected, timeout);
}

bool sendATCommand(const char* cmd, const char* expected, unsigned long timeout) {
  simSerial.println(cmd);
  return expectResponse(expected, timeout);
}

// ---------------------------------------------------------------------------
// NETWORK
// ---------------------------------------------------------------------------
bool setupNetwork() {
  if (!sendATCommand(F("AT+CPIN?"), "READY", 5000)) return false;

  bool attached = false;
  for (int i = 0; i < 35; i++) {
    if (sendATCommand(F("AT+CGATT?"), "+CGATT: 1", 5000)) { attached = true; break; }
    delay(5000);
  }
  if (!attached) return false;

  sendATCommand(F("AT+CIPSHUT"), "SHUT OK", 5000);
  sendATCommand(F("AT+CIPMUX=0"), "OK", 2000);

  // Configure APN via CSTT/CIICR bearer (avoids broken CNACT/HTTP engine)
  simSerial.print(F("AT+CSTT=\""));
  simSerial.print(F(NETWORK_APN));
  simSerial.println(F("\",\"\",\"\""));
  if (!expectResponse("OK", 5000)) return false;

  if (!sendATCommand(F("AT+CIICR"), "OK", 20000)) return false;
  delay(2000);

  simSerial.println(F("AT+CIFSR"));
  if (!expectResponse(".", 5000)) return false;

  // Extract and display IP
  char* ip = responseBuffer;
  while (*ip && !isdigit((unsigned char)*ip)) ip++;
  char* end = ip;
  while (*end && *end != '\r' && *end != '\n') end++;
  *end = '\0';
  Serial.print(F("IP: ")); Serial.println(ip);
  return true;
}

// ---------------------------------------------------------------------------
// GNSS
// ---------------------------------------------------------------------------
bool setupGNSS() {
  sendATCommand(F("AT+CGNSPWR=0"), "OK", 2000);
  delay(500);
  sendATCommand(F("AT+CGNSMOD=1,1,0,0,0"), "OK", 1000);   // GPS + GLONASS
  sendATCommand(F("AT+CGNSXTRA=1"), "OK", 1000);            // A-GPS
  if (!sendATCommand(F("AT+CGNSPWR=1"), "OK", 3000)) return false;
  delay(2000);
  return true;
}

// ---------------------------------------------------------------------------
// TELEMETRY (raw TCP → HTTP/1.1 POST)
// ---------------------------------------------------------------------------
bool sendTelemetryHTTP(const char* payload, bool isBatch) {
  // 1. Bearer check
  simSerial.println(F("AT+CIFSR"));
  if (!expectResponse(".", 3000)) {
    sendATCommand(F("AT+CIPSHUT"), "SHUT OK", 5000);
    simSerial.print(F("AT+CSTT=\""));
    simSerial.print(F(NETWORK_APN));
    simSerial.println(F("\",\"\",\"\""));
    if (!expectResponse("OK", 5000)) return false;
    if (!sendATCommand(F("AT+CIICR"), "OK", 20000)) return false;
    delay(2000);
    simSerial.println(F("AT+CIFSR"));
    if (!expectResponse(".", 5000)) return false;
  }

  // 2. Body length
  int bodyLen = 0;
  if (!isBatch) {
    if (payload) bodyLen = strlen(payload);
  } else {
    bodyLen = 2;
    for (int i = 0; i < cacheCount; i++) {
      bodyLen += strlen(offlineCache[i]);
      if (i < cacheCount - 1) bodyLen++;
    }
  }

  // 3. Reuse existing socket or open new one
  simSerial.println(F("AT+CIPSTATUS"));
  if (expectResponse("CONNECT OK", 1000)) {
    // Socket is already open — skip CIPSTART (saves 2-5 seconds)
  } else {
    // No active socket — open a fresh one
    sendATCommand(F("AT+CIPCLOSE"), "OK", 500);
    simSerial.println(F("AT+CIPSTART=\"TCP\",\"54.167.106.4\",\"80\""));
    if (!expectResponse("CONNECT", 15000)) return false;
  }

  // 4. Build HTTP headers (keep-alive to reuse socket)
  const char* ep = isBatch ? "/api/v1/telemetry/batch" : "/api/v1/telemetry";
  char hdr[160];
  int hdrLen = snprintf(hdr, sizeof(hdr),
    "POST %s HTTP/1.1\r\n"
    "Host: 54.167.106.4\r\n"
    "Content-Type: application/json\r\n"
    "Content-Length: %d\r\n"
    "Connection: keep-alive\r\n\r\n",
    ep, bodyLen);

  // 5. CIPSEND
  simSerial.print(F("AT+CIPSEND="));
  simSerial.println(hdrLen + bodyLen);
  if (!expectResponse(">", 5000)) {
    sendATCommand(F("AT+CIPCLOSE"), "OK", 500);
    return false;
  }

  // 6. Pipe headers + body
  simSerial.print(hdr);
  if (!isBatch) {
    if (payload) simSerial.print(payload);
  } else {
    simSerial.print('[');
    for (int i = 0; i < cacheCount; i++) {
      simSerial.print(offlineCache[i]);
      if (i < cacheCount - 1) simSerial.print(',');
    }
    simSerial.print(']');
  }

  if (!expectResponse("SEND OK", 8000)) {
    sendATCommand(F("AT+CIPCLOSE"), "OK", 500);
    return false;
  }

  // 7. Check for HTTP 2xx (may already be in buffer from silence drain)
  if (strstr(responseBuffer, "HTTP/1.1 20") != NULL) {
    Serial.println(F(">> OK"));
    return true;  // Don't close — keep-alive
  }
  if (expectResponse("HTTP/1.1 20", 5000)) {
    Serial.println(F(">> OK"));
    return true;
  }
  if (strstr(responseBuffer, "CLOSED") != NULL) {
    Serial.println(F(">> OK (closed)"));
    return true;
  }

  sendATCommand(F("AT+CIPCLOSE"), "OK", 500);
  return false;
}
