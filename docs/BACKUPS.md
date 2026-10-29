# Backups and recovery

## User backup

Back up downloads collection data, not the link credential. A local export with pending/conflicting edits includes their operation payloads in `recoveryChanges`. The visible-state snapshot imports as a new collection, while rejected operations are retained in the JSON for manual recovery; importing does not automatically replay them. Keep the sharing link separately.

Legacy imports validate version 1, show a preview and create a new collection only after confirmation. All shops and rows are retained. The old `purchased` flag is validated but omitted from the new model. The provided real backup was parsed locally for counts only and was not copied into this repository, imported into the running server, or used as a committed fixture.

## Consistent server snapshot

Local server, with a destination file that does not already exist:

```bash
node server/backup.ts /absolute/private/path/backup.sqlite
```

Inside an installed stack:

```bash
sudo docker compose -p shoppinglist --env-file /srv/stacks/shoppinglist/.env -f /srv/stacks/shoppinglist/compose.yaml exec -T api node server/backup.ts /data/backups/manual-UNIQUE.sqlite
```

This uses SQLite `VACUUM INTO`, not a raw copy of a live main file with outstanding WAL changes. Copy the completed snapshot off the VPS; permission-restrict it. Server access-token digests, shared data and receipts are in it. Configure a daily schedule, retention and off-VPS copy separately; none has been scheduled by the build.

## Restore after an actual data incident

1. Stop the app's web/API services, leaving its volume and all neighbouring stacks intact. Export any local pending work from clients when possible. Retain a copy of the damaged/current DB and its WAL/SHM before changing anything.
2. Restore the chosen consistent snapshot into the app volume as `shopping.sqlite` with the API user's ownership. Do not leave WAL/SHM files from a different database beside it. Do not overwrite a live/open DB.
3. Before allowing clients back, run `server/recovery-epoch.ts --confirm-restored-database` against that restored DB, through an isolated maintenance container or local command with the correct DB_PATH. It changes collection recovery epochs and clears stale operation receipts.
4. Restart the app and verify content plus sharing access. Old queued edits are deliberately rejected for review, not silently replayed. Users can export, inspect and reapply them explicitly.
5. Rehearse this procedure on a separate volume/stack before relying on it for production recovery.

Do not run the epoch-renewal command on an ordinary app update. Code rollback keeps the current DB and must only use schema-compatible versions. A pre-release snapshot is recovery material, not a reason to discard newer shared changes automatically.
