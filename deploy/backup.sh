#!/bin/sh
# Daily database backup. Runs inside the backup container.
set -u
while true; do
  file="/backups/roofdesk-$(date -u +%Y-%m-%dT%H%M%SZ).archive.gz"
  if mongodump --uri="$MONGODB_URI" --archive="$file" --gzip; then
    echo "backup ok: $file"
  else
    echo "BACKUP FAILED"; rm -f "$file"
  fi
  find /backups -name 'roofdesk-*.archive.gz' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  sleep 86400
done
