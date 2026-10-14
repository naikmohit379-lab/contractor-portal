#!/bin/sh
# Restore a backup, replacing the current data. Run from the server:
#   docker compose -f docker-compose.prod.yml stop api
#   ./deploy/restore.sh backups/roofdesk-2026-10-14T020000Z.archive.gz
#   docker compose -f docker-compose.prod.yml start api
set -eu
[ $# -eq 1 ] || { echo "usage: $0 <backup-file.archive.gz>"; exit 1; }
[ -f "$1" ] || { echo "no such file: $1"; exit 1; }
printf "This REPLACES all current data with %s. Type YES to continue: " "$1"
read -r answer
[ "$answer" = "YES" ] || { echo "cancelled"; exit 1; }
docker compose -f docker-compose.prod.yml run --rm --no-deps -v "$(pwd)/$1:/restore.archive.gz:ro" --entrypoint sh backup -c \
  'mongorestore --uri="$MONGODB_URI" --archive=/restore.archive.gz --gzip --drop'
