#!/bin/sh
# Called by the deploy workflow on the VPS, from the deployment directory,
# before `docker compose up --build` (which runs migrations).
# - First deployment (database not running yet): nothing to back up.
# - Database running: dump it; if the dump fails, stop the deployment.
set -eu

mkdir -p backups
if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "Database is not running yet; skipping pre-deploy backup."
  exit 0
fi

stamp=$(date +%Y%m%d-%H%M%S)
out="backups/predeploy-${stamp}.dump"
docker compose exec -T db sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$out.partial"
if [ ! -s "$out.partial" ]; then
  rm -f "$out.partial"
  echo "Pre-deploy backup is empty; aborting deployment." >&2
  exit 1
fi
mv "$out.partial" "$out"
echo "Pre-deploy backup: $out"

# Keep the 10 most recent pre-deploy dumps.
ls -1t backups/predeploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
