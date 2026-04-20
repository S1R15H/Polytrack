# Scope Rules

> Guard rails to prevent scope creep and unintended side effects.

## Layer Isolation

- **Don't refactor code in a layer you weren't asked to touch.** If you're fixing a backend bug, don't also "clean up" frontend code — make a separate task.
- Changes should be scoped to the minimum number of files needed.

## Mapping Library

- **Don't swap the mapping library (Mapbox ↔ Leaflet) without explicit instruction.** The dead reckoning logic is tightly coupled to whichever library is in use. Swapping requires rewriting interpolation, marker creation, and layer management.

## Dependencies

- **Don't add new dependencies without adding them to the Docker container in the same task.** If you `pip install` a new package, it must also appear in `requirements.txt` and work inside the container.
- For frontend dependencies, ensure they're also listed in `package.json` (if using npm).

## Documentation Scope

- When modifying a skill file, only update the sections affected by your change — don't rewrite the entire skill.
- When updating `TODO.md`, only check off items you've actually completed — don't reorganize unrelated sections.

## Feature Placeholders

- Phase 4 (AskAI, AR) and Phase 5 (Hardware) are placeholder phases. Don't begin implementation on these unless explicitly asked.