---
name: Arduino & SIM7000A LTE/GPS Shield
description: How to write firmware for Arduino Uno + SIM7000A to extract GPS and publish telemetry to PolyTrack.
---

# Arduino + SIM7000A Shield Integration

This skill outlines the process of integrating the **Arduino Uno R3** with the **SIM7000A LTE/GPS Shield** to act as a physical telemetry tracker for PolyTrack.

## Hardware Requirements
1. **Arduino Uno R3**
2. **SIM7000A Shield** (Botletics or similar)
3. **QGP GPS Antenna**
4. **Molex LTE Antenna**
5. **Power Supply** (Adequate power is critical. The SIM7000A can draw up to 2A bursts during LTE transmission; power the Arduino via a sufficient DC barrel jack or a dedicated LiPo/VIN source, not just USB).

## Physical Setup
1. Attach the SIM7000A shield over the Arduino Uno headers.
2. Connect the **QGP GPS Antenna** to the `GNSS` uFL port on the shield.
3. Connect the **Molex LTE Antenna** to the `LTE` uFL port on the shield.
4. Insert an active, IoT-capable Nano SIM card.
5. Provide adequate power (7-12V at 2A+).

## Software Libraries
Use the following libraries in the Arduino IDE or PlatformIO:
- `SoftwareSerial.h` (to communicate with the shield, typically RX=10, TX=11 or hardware UART depending on shield pinout).
- [Botletics SIM7000 Library](https://github.com/botletics/SIM7000-LTE-Shield) for AT command wrappers.
- `ArduinoJson` (to format JSON payloads identical to the software simulator).

## Firmware Flow
1. **Setup & Initialization**
   - Initialize `SoftwareSerial` at 9600 baud (or hardware serial).
   - Power on the SIM7000A via the `PWRKEY` pin pulse.
   - Wait for module readiness (`AT` response `OK`).

2. **Network Attach (LTE CAT-M / NB-IoT)**
   - Set APN according to your SIM provider (e.g., `hologram`, `iot.truphone.com`).
   - Enable cellular data connection (GPRS/LTE).

3. **GPS Enable & Polling**
   - Enable GNSS power (`AT+CGNSPWR=1`).
   - Wait for GPS fix. This requires a clear view of the sky (`AT+CGNSINF`).
   - Parse latitude, longitude, and timestamp from the NMEA/GNSS response.

4. **Payload Construction**
   - Use `ArduinoJson` to encode: `{ "device_id": "YOUR_UUID", "latitude": lat, "longitude": lng, "recorded_at": "ISO8601" }`.

5. **Transmission (HTTP or MQTT)**
   - **HTTP Approach:** Use AT commands to establish a TCP/HTTP session and POST the JSON to `http://YOUR_POLYTRACK_IP/api/v1/telemetry`.
   - **MQTT Approach:** Use `Adafruit_MQTT` or AT commands to publish to the Mosquitto broker topics directly.

6. **Power Saving / Loop Delay**
   - Do not hammer the server. Read GPS and transmit every 5-10 seconds.
   - (Optional) Implement HTTP failure checks. If transmission fails, queue the reading to a local array/SD card (Store-and-forward pattern).
