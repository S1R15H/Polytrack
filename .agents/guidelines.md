
# Developer Implementation Guidelines: PolyTrack Telemetry System

## 1. Project Overview

PolyTrack is a real-time microtransit telemetry system designed to solve the "black box" problem of on-demand transit by providing high-frequency, reliable visibility of transit assets. The core objective is to achieve sub-second latency for UI updates while ensuring zero data loss through robust network-failure handling.

## 2. Core Technology Stack

* 
**Backend API:** Python (FastAPI).


* 
**Database:** PostgreSQL with PostGIS extensions.


* 
**Frontend:** React.js or vanilla JavaScript.


* 
**Mapping UI:** Mapbox GL JS or Leaflet.


* 
**Infrastructure:** Docker for containerization.


* 
**Communication:** WebSockets (Frontend/Live), HTTP POST/MQTT (Ingestion).


* 
**Hardware (Future):** C++ (Arduino IDE).



---

## 3. Implementation Phases

### Phase 1: Software-Only Telemetry Simulation (Current Focus)

**Objective:** Bypass the physical hardware temporarily by simulating a transit vehicle using a laptop's internal GPS.

* **The Simulator:** Build a lightweight web client or Node.js/Python script that taps into the HTML5 Geolocation API to constantly pull the laptop's latitude and longitude.
* 
**Data Ingestion:** Configure the simulator to package these coordinates into JSON payloads and transmit them to the backend API via HTTP POST, mimicking the eventual cellular module.


* **Software "Store-and-Forward":** Implement the core resilience logic within this simulator. If the script detects a network drop, it must cache the coordinates locally and execute a batch-upload once the connection is restored to prevent data gaps.



### Phase 2: Backend Infrastructure & Data Pipeline

**Objective:** Build the cloud infrastructure to process high-frequency telemetry.

* 
**Containerization:** Spin up the FastAPI service and PostgreSQL/PostGIS database using Docker to ensure a reproducible environment.


* 
**Data Persistence:** Create endpoints to validate incoming JSON packets and write the telemetry data to PostgreSQL to maintain a historical route log.


* **Real-Time Broadcasting:** Establish a WebSocket gateway. As soon as the API validates an incoming location payload, it should immediately push that event to all connected frontend clients to achieve the sub-second latency requirement.



### Phase 3: Responsive Frontend Visualization

**Objective:** Render the live data stream into an actionable, user-centric dashboard.

* 
**Map Integration:** Initialize a Mapbox or Leaflet map within the React application.


* 
**Live Markers:** Connect the frontend to the backend WebSocket Gateway. Ensure the map marker updates instantly as new coordinates arrive.


* 
**Interpolation:** Implement "dead reckoning" logic on the frontend to calculate the heading and speed, ensuring the vehicle marker glides smoothly across the map even if the WebSocket updates experience slight network jitter.


* 
**Responsive Design:** Ensure the UI scales properly, offering a detailed dashboard view for dispatchers and a focused, mobile-friendly map view for riders.



### Phase 4: Advanced Feature Integration (Placeholders)

**Objective:** Elevate the user experience beyond a standard map interface.

* **AskAI Assistant:** * Integrate an LLM API (like OpenAI or Gemini) into the FastAPI backend.
* Create a natural language chat interface on the frontend where riders can ask questions.
* Feed the live PostGIS data and transit context as a hidden system prompt so the AI can answer queries like, "How far away is the next shuttle?"





### Phase 5: Hardware Edge Layer Integration (Placeholder)

**Objective:** Replace the software simulator with the physical Arduino setup.

* 
**Firmware:** Use C++ to program the Arduino core board to poll raw NMEA data from the GPS module via UART at 1Hz.


* 
**Parsing:** Implement efficient data parsing within the firmware to extract the relevant coordinates.


* 
**Porting Resilience:** Replicate the "Store-and-Forward" caching logic from Phase 1 into the C++ firmware, utilizing the Arduino's memory to cache data during cellular dropouts.


* 
**Transmission:** Configure the Cellular module to securely transmit the lightweight payloads to the FastAPI backend over the live network.
