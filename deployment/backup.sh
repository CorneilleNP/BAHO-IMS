#!/bin/sh
# Nightly PostgreSQL backups. Runs inside the `backup` Compose service
# (postgres:17-alpine image, so pg_dump matches the server version).
#
# Writes custom-format dumps (restore with pg_restore) to /backups and keeps
# BACKUP_KEEP_DAYS days of them. /backups is the ./backups folder of the
# deployment directory on the VPS: copy it OFF the server regularly
# (see deployment/README.md, "Backups").
set -eu

: "${PGHOST:=db}"
: "${PGUSER:?}"
: "${PGDATABASE:?}"
: "${BACKUP_HOUR:=1}"          # local hour (TZ) to run at, 0-23
: "${BACKUP_KEEP_DAYS:=14}"
export PGHOST PGUSER PGDATABASE

dump() {
  stamp=$(date +%Y%m%d-%H%M%S)
  tmp="/backups/.${PGDATABASE}-${stamp}.dump.partial"
  out="/backups/${PGDATABASE}-${stamp}.dump"
  if pg_dump --format=custom --no-owner --file="$tmp"; then
    mv "$tmp" "$out"
    echo "$(date -Iseconds) backup ok: $out ($(du -h "$out" | cut -f1))"
    find /backups -maxdepth 1 -name "${PGDATABASE}-*.dump" -mtime "+${BACKUP_KEEP_DAYS}" -print -delete
  else
    rm -f "$tmp"
    echo "$(date -Iseconds) backup FAILED" >&2
    return 1
  fi
}

if [ "${1:-}" = "--once" ]; then
  dump
  exit $?
fi

until pg_isready -q; do sleep 5; done
echo "$(date -Iseconds) backup service started: daily at ${BACKUP_HOUR}:00, keeping ${BACKUP_KEEP_DAYS} days"
last_day=""
while true; do
  today=$(date +%Y-%m-%d)
  hour=$(date +%H | sed 's/^0//')
  if [ "$today" != "$last_day" ] && [ "${hour:-0}" -ge "$BACKUP_HOUR" ]; then
    dump || true  # retry tomorrow; the failure is in `docker compose logs backup`
    last_day="$today"
  fi
  sleep 300
done
