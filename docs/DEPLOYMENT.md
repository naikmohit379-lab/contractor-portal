# Deploying RoofDesk

This puts the whole app on one server you rent (about 2 CPU, 4 GB memory, 40 GB disk is plenty to start), with automatic HTTPS, nightly database backups, and updates that roll out from GitHub after you approve them.

None of this has been run end to end yet. Do the first deployment on a throwaway server and a throwaway domain, and test a restore, before you trust it with real customers.

## What you need
- A Linux server (Ubuntu 24.04 is assumed) with Docker and the Docker Compose plugin installed.
- A domain name, with an `A` record pointing at the server.
- This code in a GitHub repository.
- For real use: a Resend account (email) and a Stripe account (payments). You can rehearse everything first with `PAYMENT_PROVIDER=mock` and `EMAIL_PROVIDER=log`.

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
- The `backup` service writes a compressed database copy to `/opt/roofdesk/backups` every 24 hours and keeps `BACKUP_KEEP_DAYS` days.
- **Copy those off the server** (another machine or a storage bucket). A backup on the same disk does not survive losing the server.
- Uploaded files are in the `uploads` Docker volume (unless `STORAGE_DRIVER=s3`). Back it up too:
  `docker run --rm -v roofdesk_uploads:/data -v $PWD/backups:/b alpine tar czf /b/uploads-$(date +%F).tgz -C /data .`
- Restore: stop the API, run `./deploy/restore.sh backups/<file>`, start the API. **Practise this once** on a test server.

## Day-to-day
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`
- Roll back by hand: set `TAG=<an earlier 12-character version>` in `.env`, then `docker compose -f docker-compose.prod.yml up -d`.
- Updates to the server's operating system and Docker are your job; turn on automatic security updates.

## Known limits
- One server, one API process. Live updates and rate limits are kept in that process's memory; running several API servers needs Redis first (see the README).
- No monitoring or alerting is included. Add an uptime check on `/ready` and an alert on backup failures.
- The Docker images and compose file have not been built or run in the environment this was written in.
