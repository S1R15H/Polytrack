#ifndef POLYTRACK_CONFIG_H
#define POLYTRACK_CONFIG_H

// -----------------------------------------------------------------------------
// HARDWARE / SHIELD CONFIGURATION
// -----------------------------------------------------------------------------
// The SIM7000 shield uses specific pins for software serial.
// For Botletics shield on Arduino Uno: TX = 10, RX = 11
#define SIM_TX_PIN 10
#define SIM_RX_PIN 11
#define PWRKEY_PIN 6
#define STATUS_PIN 5

// -----------------------------------------------------------------------------
// CELLULAR NETWORK CONFIGURATION
// -----------------------------------------------------------------------------
// Replace with your cellular provider's APN (e.g., "hologram", "iot.truphone.com", "super")
#define NETWORK_APN "wireless.dish.com"

// -----------------------------------------------------------------------------
// POLYTRACK SERVER CONFIGURATION
// -----------------------------------------------------------------------------
// Replace with the public IP or domain name of your PolyTrack backend server
// To bypass SSL, we use http:// and port 8000 directly
#define SERVER_URL "http://54.167.106.4:80"

// Device ID to identify this specific physical tracker
// Important: This UUID must match a registered device in the PolyTrack database.
#define DEVICE_ID "123e4567-e89b-12d3-a456-426614174000"

// Delay between telemetry transmissions in milliseconds (e.g., 10000 = 10 seconds)
#define TELEMETRY_INTERVAL_MS 3000

#endif // POLYTRACK_CONFIG_H
