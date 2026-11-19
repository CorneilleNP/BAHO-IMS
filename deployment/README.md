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
revision. The first deployment requires the one-time setup and `.env` above;
subsequent runs sync the project, build images on the VPS, and start/update only
this Compose project. The frontend is not published on a host port; only Caddy
can reach it through the existing `edge` Docker network.