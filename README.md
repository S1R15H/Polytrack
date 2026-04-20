# PolyTrack

PolyTrack is a real-time microtransit telemetry system built for hardware-free simulation through React Router, powered by FastAPI, PostGIS, and WebSockets.

## Requirements

- Docker & Docker Compose
- Node.js (v18+) & npm

## Backend Setup (Docker)

The backend natively uses `docker-compose.yml` to orchestrate FastAPI, a PostGIS instance, and an MQTT broker.

1. Navigate to the project root.
2. Ensure you have copied `.env.example` to `.env` inside the `backend/` folder and root folder.
3. Boot the environment:
   ```bash
   docker compose up -d --build
   ```
4. Perform the initial database migration:
   ```bash
   docker compose exec api alembic upgrade head
   ```

The FastAPI backend will run on `http://localhost:8000`. WebSocket access is at `ws://localhost:8000/ws/telemetry`.

## Frontend Setup (React Router + Tailwind CSS)

1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Application Routes

- **Simulation Interface:** `http://localhost:5173/` - Tap "Start Broadcasting" to capture browser geolocation data and stream it to the backend. Features an offline store-and-forward caching system.
- **Dispatcher Dashboard:** `http://localhost:5173/dashboard` - The real-time mapping interface built on React-Leaflet, OpenStreetMap, Nominatim Geocoding, and OSRM Routing with smooth dead-reckoning marker interpolation.
