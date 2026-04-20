---
description: How to add a new Docker service or dependency, ensuring docker-compose.yml and .env.example stay in sync.
---

# Docker Change Workflow

**Golden Rule:** Never update `docker-compose.yml` without updating `.env.example` in the same task, and vice versa.

## Steps

### 1. Define the New Service or Dependency

Document:
- What service/image are you adding? (e.g., Redis, a new microservice)
- What ports does it need?
- What environment variables does it require?
- Does it need a volume or health check?

### 2. Update Both Files Together

#### `docker-compose.yml`
```yaml
  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5
```

#### `.agents/.env.example` (add in the same commit)
```bash
# ---- Redis ---------------------------------------------------
REDIS_HOST=redis
REDIS_PORT=6379
```

### 3. Update Dependent Services

If the new service is a dependency for `api`:
```yaml
  api:
    depends_on:
      db:
        condition: service_healthy
      redis:                          # ← Add this
        condition: service_healthy
```

### 4. Update Config Loading

If the backend needs the new env vars, update `config.py`:
```python
class Settings(BaseSettings):
    redis_host: str = "redis"
    redis_port: int = 6379
```

### 5. Update Documentation

- [ ] `docker-compose.yml` — new service added
- [ ] `.agents/.env.example` — new env vars with defaults
- [ ] `docker-setup/SKILL.md` — update services table and any relevant sections
- [ ] `ARCHITECTURE.md` — update service topology table if it's a core service
- [ ] `CHANGELOG.md` — add entry

### 6. Verify

```bash
# Rebuild and start all services
docker compose up -d --build

# Verify the new service is healthy
docker compose ps

# Check logs for errors
docker compose logs -f <new-service>
```

## Checklist

- [ ] `docker-compose.yml` updated
- [ ] `.env.example` updated with all new env vars
- [ ] `config.py` loads the new variables (if backend needs them)
- [ ] `docker-setup/SKILL.md` updated
- [ ] All services start cleanly with `docker compose up`
