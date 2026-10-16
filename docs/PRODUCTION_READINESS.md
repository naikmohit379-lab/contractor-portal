# Production monitoring and backup recovery

This runbook is for the current production topology: the web/API project on Vercel and MongoDB Atlas. The local `docker-compose.prod.yml` backup container is for a separate self-hosted deployment and does not back up the Vercel database.

## Availability monitoring

The `Production monitor` workflow checks these production URLs every 15 minutes after the workflow is on the repository's default branch:

- `/` — the public web app responds.
- `/api/v1/health` — the API process responds.
- `/api/v1/ready` — the API can reach MongoDB.

Run it on demand from GitHub **Actions → Production monitor → Run workflow**. A failed run identifies the URL and HTTP status. In GitHub notification settings, enable notifications for failed Actions runs and choose email or web notifications for the repository. GitHub scheduled runs can be delayed; use a dedicated uptime service if the business needs faster alerts or an uptime SLA.

## Manual backup on the current Atlas Free cluster

Atlas Cloud Backup is not available on Free (`M0`) clusters. The scripts below use MongoDB Database Tools (`mongodump`/`mongorestore`) to make a manual archive. Free/shared tier dumps cannot include oplog data, so they are not point-in-time-consistent backups; this is a best-effort recovery copy. Move to a tier with Cloud Backup before relying on managed snapshots or point-in-time recovery.

1. Install the official MongoDB Database Tools and `mongosh` on a trusted computer.
2. In PowerShell, set the production URI for this session. Paste it only into the local prompt; do not put it in chat, a script, GitHub Actions, or the repository:

   ```powershell
   $secureUri = Read-Host 'Production MongoDB URI' -AsSecureString
   $uriPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
   try { $env:MONGODB_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($uriPtr) }
   finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($uriPtr) }
   ```

3. Identify the production database name from the database segment in the Vercel Production `MONGODB_URI` (the part after `.net/` and before `?`). Run the backup, replacing the example name:

   ```powershell
   .\deploy\backup-atlas.ps1 -DatabaseName roofdesk
   ```

   The script writes a compressed archive and SHA-256 sidecar under `private-backups/`, which is ignored by Git. It checks that the archive is non-empty. Store a copy on encrypted storage separate from this computer; protect both the archive and URI as sensitive company/customer data.

## Non-destructive restore drill

The restore drill remaps the backup's source database into a new, timestamped database on the same Atlas cluster. It refuses to use the source database as the target and refuses a target that already contains collections.

1. Keep `$env:MONGODB_URI` set to a cluster where the database user can create and read/write a database. For the safest drill, use a separate Atlas staging cluster; otherwise the script creates a separate drill database on the same cluster.
2. Run the drill using the archive and source database name:

   ```powershell
   .\deploy\restore-atlas-drill.ps1 `
     -Archive .\private-backups\roofdesk-roofdesk-20261015-120000Z.archive.gz `
     -SourceDatabase roofdesk
   ```

3. Confirm the script reports collections in the isolated restore database. Compare collection names and expected record counts without printing personal data. Record the drill date, archive name, outcome, and elapsed time in your team's operations log.
4. Keep the restored drill database until verification is recorded. Then remove only that explicitly named drill database in Atlas. Never point this drill at the production database.
5. Clear the local URI from the shell when finished: `Remove-Item Env:MONGODB_URI`.

## Recovery objectives and checks

The current free-tier/manual process does not guarantee an RPO or RTO. Agree on acceptable recovery time and data loss with the project owner. After a restore, verify the website and `/api/v1/ready`, sign in with a staging account, and inspect a few synthetic records. Never test restoration by overwriting the live production database.
