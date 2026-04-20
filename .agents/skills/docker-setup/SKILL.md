---
name: docker-setup
description: How to set up and manage the Docker Compose environment for PolyTrack (FastAPI + PostGIS + MQTT).
---

# Docker Setup Skill

## Overview

PolyTrack runs as a multi-container application via Docker Compose. This skill covers the setup, configuration, and common operations for the development environment.

---

## Services

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `api` | Built from `./backend/Dockerfile` | `8000` | FastAPI application |
| `db` | `postgis/postgis:16-3.4` | `5432` | PostgreSQL 16 + PostGIS 3.4 |
| `mqtt` | `eclipse-mosquitto:2` | `1883` | MQTT broker (optional) |
| `ollama` | `ollama/ollama:latest` | `11434` | Local LLM for Ask AI assistant |

---

## docker-compose.yml Structure

```yaml
version: "3.9"

services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      retries: 5

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "${API_PORT:-8000}:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend/app:/app/app  # Hot-reload in dev

  mqtt:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  pgdata:
```

---

## Backend Dockerfile Pattern

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

> Use `--reload` only in development. Remove for production builds.

---

## Common Operations

### Start all services
```bash
docker compose up -d
```

### Rebuild after dependency changes
```bash
docker compose up -d --build api
```

### View logs
```bash
docker compose logs -f api
```

### Access PostGIS shell
```bash
docker compose exec db psql -U polytrack -d polytrack
```

### Stop and clean up
```bash
docker compose down         # Stop containers
docker compose down -v      # Stop + remove volumes (⚠ deletes data)
```

---

## Health Checks

- The `db` service has a built-in `pg_isready` health check.
- The `api` service should expose `GET /health` returning `{"status": "ok"}`.
- Use `depends_on: condition: service_healthy` to ensure startup order.

---

## Networking

- All services share the default Docker Compose network.
- The `api` service connects to the database using hostname `db` (the service name).
- The frontend (running on the host) connects to the API at `http://localhost:8000`.

---

## Volume Mounts

| Mount | Purpose |
|-------|---------|
| `pgdata` (named volume) | Persist PostgreSQL data across restarts |
| `./backend/app:/app/app` (bind mount) | Hot-reload Python code in development |
| `./mosquitto.conf` (bind mount) | Custom Mosquitto configuration |