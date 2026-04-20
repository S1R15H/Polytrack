---
description: How to safely add hardware integration code for Arduino Uno and SIM7000A
---

# Hardware Integration Flow
Follow this workflow when modifying or implementing the firmware for the Arduino Uno and SIM7000A.

## Step 1: Modifying Configuration
Always ensure the hardware credentials (APN, operator, MQTT broker IP or HTTP server IP) are defined in a separate `config.h` or securely manageable section of the `.ino` file.

## Step 2: AT Command Refactoring
If you must add or change AT commands interacting with the SIM7000A shield, follow the `sendCommand()` retry pattern observed in the `.agents/skills/arduino-sim7000a/SKILL.md`. Check for AT response timeouts carefully.

## Step 3: Buffer and Fallback (Store-and-forward)
Just like the software client, the hardware client can enter dead zones. Ensure you implement fallback logic: if `AT+SHREQ` (HTTP) or `AT+SMPUB` (MQTT) fails, push the coordinates to an internal software buffer or SD card, and pop them when the connection is restored.

## Step 4: Payload Validation
Ensure the Arduino sends a JSON payload identical to `TelemetryPayload`. It MUST contain real `latitude`, `longitude`, `device_id`, and `recorded_at` (ISO 8601 formatting). 

## Step 5: Power Assessment
When updating the flow, consider the delay timings. GPS and LTE modules consume significant power; make sure GPS isn't continuously queried if not necessary and LTE connection uses eDRX or closes sockets appropriately if battery powered.
