---
description: How to safely modify the store-and-forward buffer logic without introducing silent data loss.
---

# Store-and-Forward Change Workflow

The store-and-forward mechanism is PolyTrack's core resilience feature. Bugs here cause **silent data loss** that is extremely hard to detect after the fact.

> ⚠️ **Any change to store-and-forward logic MUST be flagged for human review.**

## What Counts as Store-and-Forward Logic

- Client-side offline cache (localStorage, EEPROM)
- Network drop detection
- Batch upload endpoint (`POST /api/v1/telemetry/batch`)
- `batch_id` assignment and ordering
- Cache flush / clear-after-upload logic
- Arduino firmware EEPROM caching (Phase 5)

## Steps

### 1. Document the Current Behavior

Before changing anything, write down:
- How is the cache stored? (localStorage / memory / EEPROM)
- What triggers a cache flush?
- How does the server handle out-of-order or duplicate `batch_id`s?

### 2. Identify the Risk

| Change | Risk |
|--------|------|
| Changing flush trigger | Data stuck in cache forever |
| Modifying cache format | Old cached data becomes unreadable |
| Changing batch endpoint validation | Valid cached data rejected on upload |
| Altering EEPROM write logic | Buffer overflow → data overwrite |

### 3. Write the Change with Tests

- Write a unit test that simulates: send → network drop → cache → reconnect → flush → verify all points arrived
- Test edge cases: empty cache flush, very large batch, duplicate `batch_id`

### 4. Flag for Human Review

Before merging:
- [ ] Add a comment in the PR/commit: `⚠️ STORE-AND-FORWARD CHANGE — requires review`
- [ ] Verify no data loss in the test scenario
- [ ] Check both client-side (simulator) and server-side (batch endpoint) logic
