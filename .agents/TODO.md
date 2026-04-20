# PolyTrack — Project TODO / Backlog

> Organized by implementation phases from `guidelines.md`.

---

## Phase 1: Software-Only Telemetry Simulation _(Current Focus)_

- [ ] Build GPS simulator using HTML5 Geolocation API
- [ ] Package coordinates as JSON payloads (lat, lng, timestamp, device_id)
- [ ] Transmit payloads to backend via HTTP POST
- [ ] Implement store-and-forward: detect network drops, cache locally
- [ ] Implement batch-upload on network reconnection
- [ ] Add configurable polling interval (default 1 s)

## Phase 2: Backend Infrastructure & Data Pipeline

- [ ] Create `docker-compose.yml` (FastAPI + PostGIS + optional MQTT)
- [ ] Write `Dockerfile` for FastAPI service
- [ ] Set up PostgreSQL + PostGIS with initial schema (devices, telemetry_points)
- [ ] Create `POST /api/v1/telemetry` endpoint with Pydantic validation
- [ ] Create `POST /api/v1/telemetry/batch` endpoint for store-and-forward uploads
- [ ] Create `GET /api/v1/devices` and `GET /api/v1/devices/{id}` endpoints
- [ ] Create `GET /api/v1/telemetry/history/{device_id}` endpoint
- [ ] Set up WebSocket gateway at `/ws/telemetry`
- [ ] Broadcast validated telemetry to all connected WebSocket clients
- [ ] Add CORS middleware
- [ ] Add database migrations (Alembic)
- [ ] Add MQTT subscriber as alternative ingestion path (optional)

## Phase 3: Responsive Frontend Visualization

- [ ] Initialize frontend project (React or vanilla JS)
- [ ] Integrate Leaflet map component
- [ ] Connect to WebSocket gateway
- [ ] Render live vehicle markers from WebSocket updates
- [ ] Implement dead reckoning (interpolation using heading + speed)
- [ ] Draw historical route polylines from API data
- [ ] Build dispatcher dashboard view (multi-vehicle, data table)
- [ ] Build rider mobile view (focused, single-vehicle)
- [ ] Ensure responsive design across desktop and mobile

## Phase 4: Advanced Feature Integration _(Placeholder)_

- [ ] **AskAI:** Integrate LLM API (OpenAI / Gemini) into FastAPI
- [ ] **AskAI:** Build chat UI on frontend
- [ ] **AskAI:** Feed live PostGIS data as LLM context


## Phase 5: Hardware Edge Layer _(Placeholder)_

- [ ] Write C++ firmware for Arduino to read GPS via UART (1 Hz)
- [ ] Parse NMEA sentences to extract lat/lng
- [ ] Port store-and-forward caching to Arduino memory
- [ ] Configure cellular module for HTTPS transmission to FastAPI

---

## Cross-Cutting / DevOps

- [ ] Write `README.md` with setup instructions
- [ ] Add health-check endpoints (`GET /health`)
- [ ] Add request logging middleware
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Write unit tests for telemetry validation
- [ ] Write integration tests for ingestion → broadcast flow
