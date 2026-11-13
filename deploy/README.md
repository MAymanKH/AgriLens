# Deploy the backend over SSH

The [workflow](../.github/workflows/deploy.yaml) follows the
[Akhbar-Elyom API deployment](https://github.com/MAymanKH/Akhbar-Elyom-API/blob/main/.github/workflows/deploy.yaml):
a push to `main` connects to a server over SSH and restarts a PM2 process.
AgriLens first tests the backend, builds its pinned data release, imports its
snapshots, and checks all 144 comparisons on ports 18000–18002. Only then does
it replace the serving process. Manual runs also deploy the selected `main` commit.
Concurrent deployments are serialized in Actions and locked on the server.

## Prepare the server

Use a Linux server with Bash, Git, Python 3.10 or newer with venv support,
Node.js 22 or newer, npm, PM2, and `flock`. Run MongoDB Community 8.0 as a
separate persistent service bound to loopback. The current release importer
supports a single loopback MongoDB address only. It does not provision MongoDB.
Install PM2 under the deployment user's account and make all commands available
in a noninteractive SSH shell.

Clone this repository into a dedicated directory, for example `/srv/agrilens`.
Give that server clone read access to the GitHub repository. The SSH key used by
Actions to access the server does not also grant the server access to GitHub.
Keep the server clone's `origin` pointed at this repository.

Copy `.env.example` to `/srv/agrilens/.env`. Set `APP_ORIGIN` to the frontend's
exact origin and configure your local MongoDB URI and separate database names.
Keep `HOST=127.0.0.1`. Reserve service ports 8000–8002 and preflight ports
18000–18002, or change the serving ports in `.env`. Protect `.env` with mode 600.
Values are literal `KEY=value` strings; do not add shell quotes or `export`.
Release tooling selects `unreviewed` mode and exact snapshot IDs itself.

Configure your HTTPS reverse proxy to forward `/api/` and `/health` to
`127.0.0.1:8000`. Do not expose MongoDB or the Climate/Crop ports. This workflow
deploys the backend only. It does not install the proxy, TLS, or the frontend.

## Configure GitHub

Create the `production` environment and add these repository or environment secrets:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | Server hostname or IP |
| `SSH_USER` | Deployment user who owns the clone and PM2 process |
| `SSH_PRIVATE_KEY` | Private key authorized for that user |
| `SSH_PORT` | Optional, defaults to 22 |
| `SSH_HOST_FINGERPRINT` | Trusted SHA256 server host-key fingerprint |
| `PROJECT_PATH` | Absolute server clone path, such as `/srv/agrilens` |
| `PROJECT_NAME` | Unique PM2 name, such as `agrilens-backend` |

Obtain the host fingerprint through a trusted server console. GitHub environment
protection rules, if configured, apply before SSH deployment. Push the workflow
to `main` or run **Deploy backend** manually on `main`.

After the first successful deployment, run `pm2 startup` as the deployment user
and execute the command it prints to enable reboot recovery. Deployments run
`pm2 save` after readiness passes.

## Inspect or recover a deployment

Run `pm2 logs agrilens-backend` with your chosen process name. Service logs are in
`.local/backend/logs/` inside the selected release directory.
`PROJECT_PATH/.local/deploy/current` points to the last successful release.
Each attempt retains its source, venv, dependencies and data bundle in
`PROJECT_PATH/.local/deploy/releases/`. The original clone, `.env` and MongoDB
files are not reset or cleaned. Failed preflight checks leave the serving process
alone. A failure after switching PM2 attempts to restart the previous release,
checks its HTTP readiness, and still fails the workflow. A first-deploy failure
removes the unsuccessful process. Database snapshots are immutable and retained.
There is a brief interruption while PM2 switches processes.

To restore an older retained directory manually, substitute its absolute path:

```sh
pm2 delete agrilens-backend
pm2 start /srv/agrilens/.local/deploy/releases/OLD/.local/ecosystem.json
/srv/agrilens/.local/deploy/releases/OLD/.local/mongo-venv/bin/python \
  /srv/agrilens/.local/deploy/releases/OLD/deploy/process.py ready agrilens-backend
pm2 save
ln -sfn /srv/agrilens/.local/deploy/releases/OLD /srv/agrilens/.local/deploy/current
```

Set `current` to the restored directory before the next deployment. Keep at least
the current and previous verified directories; cleanup is manual. Back up MongoDB
and the retained release bundles using [the backend runbook](../docs/BACKEND.md).
Changing the root `.env` affects new deployments only. Rollback uses the previous
release's configuration copy.

## Verify a change

Run `bash deploy/check.sh` for the CI checks. The deployment script additionally
uses real MongoDB and `tools/backend.py check` before switching PM2. Deliberate
changes to release inputs or runtime require rebuilding and committing
`releases/prototype.json` with `scripts/prototype_release.py build --pin`.
Deployment rejects a stale pin and never updates it automatically.

The backend remains an **unreviewed prototype**. Deployment does not approve
scientific inputs or remove response warnings.

References: [SSH action inputs](https://github.com/appleboy/ssh-action),
[PM2 process configuration](https://pm2.keymetrics.io/docs/usage/application-declaration/).
