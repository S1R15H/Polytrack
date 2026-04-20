# Safety Rules

> These rules prevent catastrophic, hard-to-detect failures. Violating them is a blocking issue.

## Database

- **Never delete a database migration file**, even if it seems redundant. Old environments may depend on it to reach the current schema state.
- Never run raw `DROP TABLE` or `DROP COLUMN` without a migration file that includes a reversible `downgrade()`.

## Store-and-Forward

- **Never modify the store-and-forward buffer logic without explicitly flagging it for human review.** Data loss bugs here are silent and hard to catch.
- Always test with the full cycle: send → network drop → cache → reconnect → flush → verify data integrity.

## GPS / Privacy

- **Never expose raw GPS coordinates in frontend console logs or error messages.** Use device IDs or anonymized references in logs.
- Never log full telemetry payloads at `INFO` level — use `DEBUG` only.

## Secrets

- Never commit `.env` files. Only `.env.example` (with placeholder values) belongs in version control.
- Never hardcode API keys, tokens, or passwords in source code.

## Docker

- Never run `docker compose down -v` in production — this deletes all persistent data.
- Always verify health checks pass after changing container configurations.