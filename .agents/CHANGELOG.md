# Changelog

All notable changes to the PolyTrack project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Replaced the basic map circle pointers with a visually appealing, top-down SVG vehicle (car) marker that points in the direction of the `heading` telemetry field.
- Hosted Ollama local AI centrally via `docker-compose.yml` to remove the need for manual external installations.
- Initial `.agents/` documentation: guidelines, architecture, conventions, skills
- Project scaffolding and folder structure
- Real OSRM route calculation in DirectionsPanel for Drive, Walk, and Bike modes with Nominatim geocoding

### Changed
- Refactored `batch` telemetry ingestion to perform a single bulk SQL insert instead of looping iteratively.
- Replaced raw SQL execution inside `ingestion.py` with SQLAlchemy 2.0 ORM `insert()` builder.
- Enforced `AwareDatetime` from Pydantic on all timestamp models to guard against timezone mismatch bugs.
- Transitioned primary frontend map implementation and docs from Mapbox GL JS to Leaflet (`react-leaflet`).

### Fixed
- Handled silent failing background tasks in `mqtt_subscriber` by adding robust `try-except` wrapped with graceful `asyncio.CancelledError` shutdown logic.
- Prevented unbounded queries by adding default pagination `offset` and `limit` to the GET `/api/v1/devices` endpoint.
- Corrected React re-render bug where `LiveMap.tsx` destroyed and rebuilt the map instance on theme toggle.

### Removed
- Removed Mapbox configurations and specific implementations across the architecture and codebase.

---

<!--
## [0.1.0] - YYYY-MM-DD
### Added
- Phase 1: GPS telemetry simulator
- Phase 2: FastAPI backend with PostGIS
-->
