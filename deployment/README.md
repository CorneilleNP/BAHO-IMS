# VPS Deployment

The deployment uses Docker Compose for PostgreSQL, Django/Gunicorn, and the
React/Nginx frontend. The frontend proxies `/api/` to Django, so the app stays
same-origin and needs no production API URL setting.

## VPS prerequisites

- Docker Engine with the `docker compose` plugin
- `rsync` and SSH access for the deployment user
- A deployment user that can run Docker without interactive sudo
- The existing shared Docker network `edge`
- A TLS-terminating reverse proxy or load balancer for production HTTPS

This setup only creates and updates files in the dedicated deployment
directory. It does not configure the host firewall, install Docker, change
existing proxy site files, or change other applications. The approved setup
adds a separate BAHO site file to the existing proxy. Keep the deployment
directory separate from any existing project, for example
`/home/deploy/baho-ims`.

## One-time setup

1. Create a dedicated SSH key for GitHub Actions and authorize its public key
   for the deployment user.
2. Check `docker compose ls` and choose a unique `COMPOSE_PROJECT_NAME` that
   does not match an existing project. This isolates the app's containers and
   named volumes from other Compose projects.
3. Create the deployment directory under that user's home directory.
4. Copy `.env.deploy.example` to `.env` in the deployment directory and set
   the unique project name and strong, unique secrets. Generate secrets with
   `openssl rand -hex 32`.
5. Point `baho.izere.work` DNS to the VPS and set the matching host and HTTPS
   origin in `.env`.
6. Add `deployment/baho.caddy` as a new site file in `/opt/edge/sites/`, then
   reload Caddy. Do not edit the existing site files or proxy Compose project.
7. Confirm the deployment user can run `docker compose version` and `rsync`.

The database and collected static files live in Compose-managed named volumes.
Normal deployments preserve both. The workflow never syncs or replaces the
server `.env`, and does not use `rsync --delete`.

## GitHub Actions secrets

Add these repository Actions secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | Server IP address or SSH hostname |
| `VPS_USER` | Dedicated deployment username |
| `VPS_SSH_PORT` | SSH port, usually `22` |
| `VPS_SSH_PRIVATE_KEY` | Private half of the Actions deployment key |
| `VPS_SSH_KNOWN_HOSTS` | Verified known-hosts line for the VPS |
| `VPS_DEPLOY_PATH` | Dedicated directory, e.g. `/home/deploy/baho-ims` |

Obtain the known-hosts entry through a trusted channel and verify its
fingerprint before saving it. Do not use an unverified `ssh-keyscan` result as
the sole trust check.

Pushes to `main` and manual `workflow_dispatch` runs deploy the checked-out
revision, but only after CI passes (`.github/workflows/ci.yml`: backend Ruff,
migration check and pytest on PostgreSQL 17; frontend lint, tests and build;
`docker compose config`). A failing check stops the deployment. Pull requests
and other branches run the same CI without deploying.

The first deployment requires the one-time setup and `.env` above; subsequent
runs sync the project, **dump the database to `backups/predeploy-*.dump`**
(the deployment aborts if that dump fails), then build images on the VPS and
start/update only this Compose project. The frontend is not published on a host port; only Caddy
can reach it through the existing `edge` Docker network.

## Services

| Service | What it does |
|---|---|
| `db` | PostgreSQL 17, data in the `postgres_data` volume |
| `backend` | Django/Gunicorn; migrates, creates the cache table and collects static files on start |
| `frontend` | Nginx serving the React app (with security headers) and proxying `/api/` |
| `backup` | Nightly `pg_dump` into `./backups` |
| `sms-worker` | Retries failed SMS every 10 minutes (`send_pending_sms`) |

## Backups

Two kinds of dump land in the `backups/` folder of the deployment directory
(never synced, never committed):

- `baho_ims-YYYYmmdd-HHMMSS.dump`: nightly at `BACKUP_HOUR` (default 01:00
  Kigali time), kept for `BACKUP_KEEP_DAYS` days (default 14).
- `predeploy-YYYYmmdd-HHMMSS.dump`: taken by every deployment before
  migrations run; the 10 most recent are kept.

**A backup on the same server is not enough.** If the VPS or its disk is lost,
so are these files. Copy them somewhere else regularly, for example from an
office machine or a second server:

```bash
rsync -az deploy@VPS:/home/deploy/baho-ims/backups/ /path/to/offsite/baho-backups/
```

Check the backup service: `docker compose logs --tail 20 backup` (look for
`backup ok`). Take one now: `docker compose exec backup sh /scripts/backup.sh --once`.

### Restoring

Test a restore at least once, on a copy, before you need it.

```bash
cd /home/deploy/baho-ims
docker compose stop backend sms-worker frontend
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < backups/<file>.dump
docker compose up -d
```

## Monitoring and logs

- All services log to stdout: `docker compose logs -f backend`.
- Set `SENTRY_DSN` in `.env` to get an alert with a stack trace for every
  server error (free tier at sentry.io is enough). Personal data is not sent.

## Security settings

- Login is limited per client IP (`THROTTLE_LOGIN_IP`, default `30/min`) and
  per email address (`THROTTLE_LOGIN_EMAIL`, default `10/hour`). The client IP
  is read from `X-Forwarded-For` behind Caddy and Nginx
  (`DJANGO_NUM_PROXIES=2`); change it only if the proxy chain changes.
- The refresh token lives in an httpOnly, `Secure`, `SameSite=Strict` cookie;
  logout and password changes revoke it on the server.
- `/api/docs/` and `/api/schema/` are off in production. Setting
  `API_DOCS_ENABLED=true` turns them on for staff users only.

## SMS

`SMS_BACKEND=console` (default) only logs messages. To text farmers for real,
create an Africa's Talking account, then set `SMS_BACKEND=africastalking`,
`AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` and optionally an approved
`SMS_SENDER_ID`. Every message is stored in the outbox (Administration ›
SMS Outbox) whether it was sent or not.
