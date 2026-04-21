#include <SoftwareSerial.h>
#include <ArduinoJson.h>
#include "config.h"

// Define SoftwareSerial for communicating with the SIM7000 shield
SoftwareSerial simSerial(SIM_TX_PIN, SIM_RX_PIN);

// Buffer for serial reading
char responseBuffer[128];
char jsonBuffer[192];

// Circular cache designed to fit cleanly in Uno's SRAM constraints
#define CACHE_SIZE 2
char offlineCache[CACHE_SIZE][192];
int cacheCount = 0;

// Buffer intentionally removed to preserve battery limit (No store-and-forward)

void setup() {
  Serial.begin(115200);
  simSerial.begin(9600);
  
  Serial.println(F("Starting PolyTrack Node initialization..."));

  powerOnShield();

  // The SIM7000 uses auto-bauding and might be asleep or just booting. 
  // It is severely prone to ignoring the first few AT pings.
  // We must spam 'AT' until it synchronizes and responds with 'OK'.
  Serial.println(F("Synchronizing UART autobaud block..."));
  bool initialized = false;
  for (int i = 0; i < 15; i++) {
    if (sendATCommand(F("AT"), "OK", 1000)) {
       initialized = true;
       break;
    }
    delay(500);
  }

  if (!initialized) {
    Serial.println(F("SIM7000 module did not respond after 15 attempts. Halting."));
    while(1); // Infinite spin loop on failure
  }

  Serial.println(F("Connecting to cellular network..."));
  while (!setupNetwork()) {
    Serial.println(F("Network initialization failed. Retrying in 10 seconds..."));
    // Ensure the node doesn't hammer the network if signal is poor
    delay(10000);
  }

  Serial.println(F("Enabling GNSS..."));
  if (!setupGNSS()) {
    Serial.println(F("ERROR: Failed to enable GPS engine."));
  }

  Serial.println(F("Node is ready."));
}

void loop() {
  Serial.println(F("\n--- New Cycle ---"));


  static int httpFailures = 0;
  Serial.println(F("Requesting GNSS info..."));
  
  if (sendATCommand(F("AT+CGNSINF"), "OK", 2000)) {
    // DEBUG: Print exactly what the GNSS chip is saying so we can count satellites!
    Serial.println(F("RAW GNSS DATA: "));
    Serial.println(responseBuffer);

    char* gnssPrefix = strstr(responseBuffer, "+CGNSINF: ");
    if (gnssPrefix != NULL) {
      gnssPrefix += 10; 
      
      char* params[20];
      int paramCount = 0;
      char* token = strtok(gnssPrefix, ",\r\n");
      while (token != NULL && paramCount < 20) {
        params[paramCount++] = token;
        token = strtok(NULL, ",\r\n");
      }

      if (paramCount >= 5 && strcmp(params[0], "1") == 0 && strcmp(params[1], "1") == 0) {
        char* datetime = params[2];
        char* latStr = params[3];
        char* lngStr = params[4];
        char* altStr = (paramCount > 5) ? params[5] : "0.0";
        char* speedStr = (paramCount > 6) ? params[6] : "0.0";
        char* headingStr = (paramCount > 7) ? params[7] : "0.0";

        char isoTime[30];
        if (strlen(datetime) >= 14) {
          snprintf(isoTime, sizeof(isoTime), "%.4s-%.2s-%.2sT%.2s:%.2s:%.2s.000Z",
                   datetime, datetime+4, datetime+6, datetime+8, datetime+10, datetime+12);
        } else {
          strcpy(isoTime, "1970-01-01T00:00:00.000Z");
        }

        Serial.print(F("Fix acquired! Lat: ")); Serial.print(latStr);
        Serial.print(F(" Lng: ")); Serial.println(lngStr);

        StaticJsonDocument<192> doc;
        doc["device_id"] = DEVICE_ID;
        doc["latitude"] = atof(latStr);
        doc["longitude"] = atof(lngStr);
        doc["altitude"] = atof(altStr);
        doc["speed"] = atof(speedStr);
        doc["heading"] = atof(headingStr);
        doc["recorded_at"] = isoTime;

        serializeJson(doc, jsonBuffer);
        Serial.println(F("Payload: "));
        Serial.println(jsonBuffer);

        if (!sendTelemetryHTTP(jsonBuffer, false)) {
          Serial.println(F("HTTP POST failed. Caching payload..."));
          
          if (cacheCount < CACHE_SIZE) {
            strcpy(offlineCache[cacheCount], jsonBuffer);
            cacheCount++;
          } else {
            Serial.println(F("Cache full. Dropping older payload..."));
            strcpy(offlineCache[0], offlineCache[1]);
            strcpy(offlineCache[1], jsonBuffer);
          }

          httpFailures++;
          
          if (httpFailures >= 3) {
            Serial.println(F("!!! 3 Consecutive Failures Detected. Connection lost !!!"));
            Serial.println(F("Initializing Auto-Recovery..."));
            while (!setupNetwork()) {
              Serial.println(F("Auto-Recovery failed. Retrying in 10s..."));
              delay(10000);
            }
            Serial.println(F("Auto-Recovery SUCCESS! Connection restored."));
            httpFailures = 0; // Reset counter
          }
        } else {
          httpFailures = 0; // Reset counter on success
          
          // If connection is healthy, flush local memory array to batch API
          if (cacheCount > 0) {
            Serial.println(F("Connection stable. Flushing offline cache..."));
            
            // We pass NULL for payload because sendTelemetryHTTP will stream it directly
            if (sendTelemetryHTTP(NULL, true)) {
              Serial.println(F("Cache securely flushed!"));
              cacheCount = 0;
            } else {
              Serial.println(F("Failed to flush cache. Will try later."));
            }
          }
        }
      } else {
        Serial.println(F("No GPS fix yet..."));
      }
    }
  }

  delay(TELEMETRY_INTERVAL_MS);
}

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------


void powerOnShield() {
  pinMode(PWRKEY_PIN, OUTPUT);

  // Check if the module is already awake by pinging it.
  // We send a few rapid AT commands to trigger auto-bauding just in case.
  Serial.println(F("Checking if SIM7000 is already awake..."));
  bool alreadyAwake = false;
  for (int i = 0; i < 3; i++) {
    if (sendATCommand(F("AT"), "OK", 500)) {
      alreadyAwake = true;
      break;
    }
  }

  if (alreadyAwake) {
    Serial.println(F("SIM7000 responded. Already powered ON."));
    return;
  }

  Serial.println(F("No response. Powering up SIM7000 via PWRKEY pin..."));
  
  // Pulse the power key low for ~1.2 seconds to toggle the AT commands engine
  digitalWrite(PWRKEY_PIN, LOW);
  delay(1200);
  digitalWrite(PWRKEY_PIN, HIGH);
  
  Serial.println(F("Waiting 3s for SIM7000 to stabilize..."));
  delay(3000); 
}

bool expectResponse(const char* expectedResponse, unsigned long timeout) {
  unsigned long start = millis();
  int index = 0;
  memset(responseBuffer, 0, sizeof(responseBuffer));

  while (millis() - start < timeout) {
    while (simSerial.available() > 0) {
      char c = simSerial.read();
      if (index < sizeof(responseBuffer) - 1) {
        responseBuffer[index++] = c;
      }
    }
    if (strstr(responseBuffer, expectedResponse) != NULL) {
      return true;
    }
  }
  return false;
}

bool sendATCommand(const __FlashStringHelper* command, const char* expectedResponse, unsigned long timeout) {
  simSerial.println(command);
  return expectResponse(expectedResponse, timeout);
}

bool sendATCommand(const char* command, const char* expectedResponse, unsigned long timeout) {
  simSerial.println(command);
  return expectResponse(expectedResponse, timeout);
}

bool setupNetwork() {
  if (!sendATCommand(F("AT+CPIN?"), "READY", 5000)) {
     Serial.println(F("Network Error: SIM card not inserted or not READY."));
     return false;
  }
  
  // It takes time for the modem to find a cell tower and register the SIM card.
  // We must explicitly wait until it reports that it is attached to the LTE/GPRS network.
  Serial.println(F("Wait for network attachment (+CGATT=1)..."));
  bool attached = false;
  for (int i = 0; i < 35; i++) {
     if (sendATCommand(F("AT+CGATT?"), "+CGATT: 1", 5000)) {
         attached = true;
         break;
     }
     delay(5000); // Wait 5s between checks (total 30s timeout)
  }
  
  if (!attached) {
      Serial.println(F("Network Error: Failed to attach to cell tower."));
      return false;
  }

  // Shut down any stale packet-data protocols (PDP) from previous aborted boots
  sendATCommand(F("AT+CIPSHUT"), "SHUT OK", 3000);

  // Deactivate any dangling App Networks
  sendATCommand(F("AT+CNACT=0"), "OK", 2000);

  // --- ACTIVATE NB-IOT / CAT-M1 APP NETWORK (SIM7000 NATIVE) ---
  Serial.println(F("Defining Cellular PDP Context Tunnel..."));
  simSerial.print(F("AT+CGDCONT=1,\"IP\",\""));
  simSerial.print(F(NETWORK_APN));
  simSerial.println(F("\""));
  expectResponse("OK", 5000);
  Serial.println(F("Activating NB-IoT / Cat-M1 Bearer..."));
  simSerial.print(F("AT+CNACT=1,\""));
  simSerial.print(F(NETWORK_APN));
  simSerial.println(F("\""));
  
  if (!expectResponse("OK", 20000)) {
      Serial.println(F("Error: AT+CNACT=1 failed. LTE Bearer could not be built."));
      return false;
  }
  
  // Wait explicitly a few seconds for the IP to finalize DHCP allocation natively via cell tower
  delay(3000);
  
  // Verify the App Network received a valid IP address and bound the LTE radio
  if (!sendATCommand(F("AT+CNACT?"), "+CNACT: 1", 5000)) {
      Serial.println(F("Error: App Network down, no IP assigned."));
      return false;
  }

  return true;
}

bool setupGNSS() {

  // Turn on Multi-GNSS Mode.
  sendATCommand(F("AT+CGNSMOD=1,1,0,0,0"), "OK", 1000);

  // Power on the GNSS engine
  return sendATCommand(F("AT+CGNSPWR=1"), "OK", 3000);
}

bool sendTelemetryHTTP(const char* payload, bool isBatch) {
  Serial.println(F("Pushing data via Supported LTE-M HTTPINIT Engine..."));
  
  // Step 1: Initialize the HTTP sequence
  sendATCommand(F("AT+HTTPTERM"), "OK", 1000); // Purge stale session
  if (!sendATCommand(F("AT+HTTPINIT"), "OK", 5000)) {
     Serial.println(F("HTTPINIT Failed."));
     return false;
  }
  
  // Step 2: Map HTTP engine to the active CNACT Context ID (1)
  simSerial.println(F("AT+HTTPPARA=\"CID\",1"));
  expectResponse("OK", 2000);
  
  // Step 3: Define target URL explicitly via Port 80 mapping to bypass Carrier Blocks!
  String reqUrl = isBatch ? F("AT+HTTPPARA=\"URL\",\"http://54.167.106.4:80/api/v1/telemetry/batch\"") : F("AT+HTTPPARA=\"URL\",\"http://54.167.106.4:80/api/v1/telemetry\"");
  simSerial.println(reqUrl);
  expectResponse("OK", 5000);
  
  // Step 4: Define JSON Content-Type
  simSerial.println(F("AT+HTTPPARA=\"CONTENT\",\"application/json\""));
  expectResponse("OK", 2000);
  
  // Step 5: Calculate payload length
  int bodyLen = 0;
  if (!isBatch) {
    bodyLen = strlen(payload);
  } else {
    bodyLen = 2; // For '[' and ']'
    for (int i = 0; i < cacheCount; i++) {
      bodyLen += strlen(offlineCache[i]);
      if (i < cacheCount - 1) bodyLen++;
    }
  }

  // Step 6: Input payload
  simSerial.print(F("AT+HTTPDATA="));
  simSerial.print(bodyLen);
  simSerial.println(F(",10000"));
  
  if (expectResponse("DOWNLOAD", 5000)) {
    // Send Body
    if (!isBatch) {
      simSerial.print(payload);
    } else {
      simSerial.print("[");
      for (int i = 0; i < cacheCount; i++) {
        simSerial.print(offlineCache[i]);
        if (i < cacheCount - 1) simSerial.print(",");
      }
      simSerial.print("]");
    }
    
    // Wait for the buffer execution confirmation
    if (expectResponse("OK", 10000)) {
       Serial.println(F("Payload buffered. Firing POST execution..."));
       
       // Step 7: Fire the POST action
       simSerial.println(F("AT+HTTPACTION=1"));
       
       // HTTP action takes time. Wait for network response URC: "+HTTPACTION: 1,<StatusCode>,<Length>"
       if (expectResponse("+HTTPACTION: 1,20", 30000)) {
           // We explicitly look for a 200 or 201 by matching "1,20".
           Serial.println(F(">>> TELEMETRY HTTP ACCEPTED BY FASTAPI! <<<"));
           sendATCommand(F("AT+HTTPTERM"), "OK", 2000);
           return true; 
       } else {
           Serial.println(F("HTTP POST Rejected by backend/tower. API Diagnosis Trace:"));
           Serial.println(responseBuffer);
       }
    } else {
       Serial.println(F("Modem timed out buffering payload."));
    }
  } else {
    Serial.println(F("Modem refused HTTPDATA payload stream."));
  }
  
  // Step 8: MANDATORY sequence termination
  sendATCommand(F("AT+HTTPTERM"), "OK", 2000);
  return false;
}
