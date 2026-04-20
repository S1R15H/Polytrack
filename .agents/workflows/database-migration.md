---
description: How to safely alter database tables using migration files, never modifying the schema directly.
---

# Database Migration Workflow

**Golden Rule:** Never modify the database schema directly. Always write a migration file.

## Steps

### 1. Plan the Change

Document what you're changing:
- Adding a column? Altering a type? Creating a new table?
- Does it affect a geospatial column (`GEOMETRY`, `GEOGRAPHY`)?

### 2. Generate the Migration File

Using Alembic:

```bash
# Auto-generate from model changes
docker compose exec api alembic revision --autogenerate -m "add_battery_level_to_telemetry"

# Or create an empty migration to write manually
docker compose exec api alembic revision -m "add_battery_level_to_telemetry"
```

### 3. Write / Review the Migration

Every migration must have both `upgrade()` and `downgrade()`:

```python
def upgrade():
    op.add_column('telemetry_points', sa.Column('battery_level', sa.Float(), nullable=True))

def downgrade():
    op.drop_column('telemetry_points', 'battery_level')
```

For geospatial columns, use raw SQL with PostGIS functions:

```python
def upgrade():
    op.execute("ALTER TABLE geofences ADD COLUMN center GEOMETRY(POINT, 4326)")
    op.execute("CREATE INDEX idx_geofences_center ON geofences USING GIST (center)")

def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_geofences_center")
    op.execute("ALTER TABLE geofences DROP COLUMN center")
```

### 4. Run the Migration

```bash
docker compose exec api alembic upgrade head
```

### 5. Update Documentation (Required)

- [ ] Update `ARCHITECTURE.md` — schema tables section
- [ ] If geospatial columns changed → update `postgis-queries/SKILL.md`
- [ ] If new fields affect the API → update Pydantic schemas in `fastapi-patterns.md/SKILL.md`
- [ ] Add `CHANGELOG.md` entry

### 6. Verify

```bash
# Check current migration state
docker compose exec api alembic current

# Connect to DB and verify
docker compose exec db psql -U polytrack -d polytrack -c "\d telemetry_points"
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Edit `CREATE TABLE` in the init SQL | Write an Alembic migration |
| Run `ALTER TABLE` manually in psql | Generate a migration file |
| Skip `downgrade()` | Always write a reversible migration |
| Forget to update `postgis-queries/SKILL.md` | Update docs when geospatial columns change |
