# PolyTrack — Coding Conventions

## Python / Backend

### Style
- Follow **PEP 8**. Line length limit: **88 characters** (Black formatter default).
- Use **type hints** on all function signatures and return types.
- Use `async def` for all I/O-bound handlers (database, network, WebSocket).

### Naming
| Element | Convention | Example |
|---------|-----------|---------|
| Files / modules | `snake_case` | `telemetry_router.py` |
| Classes | `PascalCase` | `TelemetryPoint` |
| Functions / methods | `snake_case` | `get_latest_position()` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_BATCH_SIZE` |
| Pydantic models | `PascalCase` + suffix | `TelemetryPayload`, `DeviceResponse` |
| API route prefixes | `/api/v1/{resource}` | `/api/v1/telemetry` |

### Imports
- Group imports: stdlib → third-party → local, separated by blank lines.
- Use absolute imports from the project root.

### Error Handling
- Raise `HTTPException` with appropriate status codes in route handlers.
- Use custom exception classes for domain errors (e.g., `DeviceNotFoundError`).
- Never swallow exceptions silently; always log at minimum.

### Logging
- Use Python's `logging` module — **no print statements** in production code.
- Log levels: `DEBUG` for internals, `INFO` for request flow, `WARNING` for recoverable issues, `ERROR` for failures.
- Include `device_id` and `timestamp` in telemetry-related log messages.

---

## Database / SQL

- Table names: **plural snake_case** (`telemetry_points`, `devices`).
- Column names: **snake_case** (`device_id`, `recorded_at`).
- Always specify `SRID 4326` for geometry columns.
- Use **parameterized queries** — never interpolate raw values into SQL strings.
- Add migrations via Alembic. Each migration has a descriptive name.

---

## Frontend / JavaScript

- Use **camelCase** for variables and functions, **PascalCase** for components.
- Prefer `const` over `let`; never use `var`.
- Use descriptive IDs on interactive elements for testability (e.g., `id="map-container"`, `id="vehicle-marker-{id}"`).

---

## API Design

- RESTful naming: plural nouns for resources (`/devices`, `/telemetry`).
- Use HTTP verbs correctly: `GET` (read), `POST` (create/ingest), `PUT` (full update), `PATCH` (partial update), `DELETE` (remove).
- Return consistent JSON envelope:
  ```json
  {
    "status": "success",
    "data": { ... },
    "message": null
  }
  ```
- Error responses:
  ```json
  {
    "status": "error",
    "data": null,
    "message": "Device not found"
  }
  ```

---

## Git Conventions

### Branch Naming
- `feature/{short-description}` — New features
- `fix/{short-description}` — Bug fixes
- `chore/{short-description}` — Tooling, config, docs

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(telemetry): add store-and-forward batch upload endpoint
fix(websocket): handle client disconnect gracefully
docs(architecture): add database schema section
chore(docker): update PostGIS image to 16-3.4
```

---

## Project Folder Structure

```
PolyTrack/
├── .agents/                # Agent guidelines, skills, conventions
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── config.py       # Settings from env vars
│   │   ├── models/         # SQLAlchemy / Pydantic models
│   │   ├── routers/        # API route handlers
│   │   ├── services/       # Business logic
│   │   ├── ws/             # WebSocket manager
│   │   └── db/             # Database connection + migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── services/       # WebSocket client, API client
│   │   └── utils/          # Dead reckoning, formatting
│   └── index.html
├── simulator/              # GPS telemetry simulator
│   └── simulator.py        # or web-based simulator
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Environment Variables

- All config via environment variables — **never hardcode** secrets or connection strings.
- Reference `.agents/.env.example` for the full template.
- Use `pydantic-settings` (`BaseSettings`) for typed config loading in FastAPI.
