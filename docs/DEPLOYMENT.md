# Deploying RoofDesk

This guide describes an optional self-hosted Docker deployment on a server you rent (about 2 CPU, 4 GB memory, 40 GB disk to start). The current live deployment is on Vercel with MongoDB Atlas; use its readiness and Atlas backup instructions below instead of the Docker backup container.

None of this has been run end to end yet. Do the first deployment on a throwaway server and a throwaway domain, and test a restore, before you trust it with real customers.

## What you need
- A Linux server (Ubuntu 24.04 is assumed) with Docker and the Docker Compose plugin installed.
- A domain name, with an `A` record pointing at the server.
- This code in a GitHub repository.
- For real use: a Resend account (email) and a Stripe account (payments). You can rehearse everything first with `PAYMENT_PROVIDER=mock` and `EMAIL_PROVIDER=log`.

## Vercel scheduled reminders

`vercel.json` schedules `/api/v1/cron/reminders` daily at 09:00 UTC. Vercel Cron invokes scheduled routes only on Production deployments, not Preview deployments. Before promoting this schedule to production, add a `CRON_SECRET` environment variable to the Vercel Production environment (at least 32 random characters; for example, generate with `openssl rand -hex 32`) and redeploy. The endpoint fails closed if the secret is missing or invalid. Each run creates at most one in-app reminder per overdue open/blocked Operations task, recipient, and UTC day. It does not send email or SMS. See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) and [securing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The photo upload queue stores pending files in IndexedDB in the current browser profile (up to 100 MB) and retries when connectivity returns while the user is signed in. Files are not backed up remotely until the upload completes. Clearing site data or losing the device can remove pending files.

## 1. Prepare the server (once)
```bash
sudo mkdir -p /opt/roofdesk && sudo chown $USER /opt/roofdesk && cd /opt/roofdesk
# copy these from the repository: docker-compose.prod.yml, deploy/ (Caddyfile, backup.sh, restore.sh), .env.production.example
cp .env.production.example .env && chmod 600 .env
openssl rand -base64 756 > deploy/mongo-keyfile && chmod 400 deploy/mongo-keyfile   # lets the database nodes trust each other
```
Edit `.env`: set `DOMAIN`, `IMAGE_PREFIX` (`ghcr.io/<your-github-name>/<your-repo>`), `MONGO_PASSWORD` (`openssl rand -hex 24`), `JWT_ACCESS_SECRET` (`openssl rand -hex 32`), and email and payment settings. The API refuses to start in production if the secret still looks like a placeholder, if `WEB_ORIGIN` is not https, or if Stripe or Resend is chosen without its keys.

Open only ports 80 and 443 in the firewall (and 22 for SSH). The database is not exposed outside Docker.

## 2. Connect GitHub to the server (once)
In the repository, under Settings:
- **Environments**: create `production` and add yourself under *Required reviewers*. Every deployment then waits for your click.
- **Variables**: `DOMAIN` (the same as in `.env`).
- **Secrets**: `DEPLOY_HOST` (server address), `DEPLOY_USER`, `DEPLOY_SSH_KEY` (a private key whose public half is in the server's `~/.ssh/authorized_keys`), `GHCR_PULL_TOKEN` (a GitHub token with only `read:packages`, so the server can pull images).
- After the first run, make the two published packages (`api`, `web`) accessible to the token.

Use a deploy-only SSH key, not your personal one. Consider pinning the actions in the workflow files to full commit versions.

## 3. Ship
Merge to `main`. CI runs the tests, then the Deploy workflow builds the images, waits for your approval, updates the server and checks `https://<domain>/ready`. If the check fails it switches back to the previous version automatically.

The first time, start things by hand so you can watch them: `docker compose -f docker-compose.prod.yml up -d && docker compose -f docker-compose.prod.yml logs -f`.

## 4. Turn on payments (when ready)
1. In Stripe test mode, set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
2. In the Stripe dashboard add a webhook to `https://<domain>/api/v1/webhooks/stripe` for: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Run a test payment, a failed card, and a refund. Check the Payments page reconciliation. Only then use live keys.

## Backups and restore

The Vercel production app uses MongoDB Atlas; the Docker backup service below applies only to the separate self-hosted Compose deployment. Atlas Free (`M0`) does not provide managed Atlas backups, so create manual archives with `deploy/backup-atlas.ps1` and rehearse a non-destructive restore with `deploy/restore-atlas-drill.ps1`. Follow [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for setup and the restore drill. For automated Atlas snapshots and point-in-time recovery, use a cluster tier that supports Cloud Backup.

### Self-hosted Docker deployment only

- The `backup` service writes a compressed database copy to `/opt/roofdesk/backups` every 24 hours and keeps `BACKUP_KEEP_DAYS` days.
- **Copy those off the server** (another machine or a storage bucket). A backup on the same disk does not survive losing the server.
- Uploaded files are in the `uploads` Docker volume (unless `STORAGE_DRIVER=s3`). Back it up too:
  `docker run --rm -v roofdesk_uploads:/data -v $PWD/backups:/b alpine tar czf /b/uploads-$(date +%F).tgz -C /data .`
- Restore: stop the API, run `./deploy/restore.sh backups/<file>`, start the API. **Practise this once** on a test server.

## Monitoring

The `Production monitor` GitHub Actions workflow checks the production site, API liveness and database readiness every 15 minutes. It targets the project's Production domain and is enabled after this workflow reaches the repository's default branch. Enable GitHub Actions failure notifications for your account/repository so failed checks alert the owner. See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for interpreting probes and the recovery checklist.

## Day-to-day
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`
- Roll back by hand: set `TAG=<an earlier 12-character version>` in `.env`, then `docker compose -f docker-compose.prod.yml up -d`.
- Updates to the server's operating system and Docker are your job; turn on automatic security updates.

## Known limits
- One server, one API process. Live updates and rate limits are kept in that process's memory; running several API servers needs Redis first (see the README).
- GitHub Actions availability checks do not replace a dedicated uptime provider or Atlas alerting. Configure Atlas alerts for database availability, storage thresholds and backup failures when the cluster tier supports managed backups.
- The Docker images and compose file have not been built or run in the environment this was written in.
