param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_-]+$')]
  [string]$SourceDatabase,
  [ValidatePattern('^[A-Za-z0-9_-]+$')]
  [string]$RestoreDatabase = "roofdesk_restore_drill_$([DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss'))"
)

$ErrorActionPreference = 'Stop'
if (-not $env:MONGODB_URI) { throw 'Set MONGODB_URI for the intended Atlas cluster in this PowerShell session.' }
if ($RestoreDatabase -eq $SourceDatabase) { throw 'The restore database must differ from the source database. Production data will not be overwritten.' }
$Archive = [IO.Path]::GetFullPath($Archive)
if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) { throw "Backup archive not found: $Archive" }
$sidecar = "$Archive.sha256"
if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { throw "The SHA-256 sidecar is missing: $sidecar" }
$expectedHash = ((Get-Content -LiteralPath $sidecar -Raw).Trim() -split '\s+')[0]
$actualHash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'The backup archive failed its SHA-256 integrity check.' }
foreach ($tool in @('mongorestore', 'mongosh')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "MongoDB Database Tools and mongosh are required; '$tool' was not found." }
}

$uri = $env:MONGODB_URI
$preflight = & mongosh $uri --quiet --eval "db.getSiblingDB('$RestoreDatabase').getCollectionNames().length" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Could not verify the restore target. Check the Atlas URI, IP access list, and database user's permissions." }
if ([int]($preflight | Select-Object -Last 1) -gt 0) { throw "Restore target '$RestoreDatabase' is not empty. Choose a new restore database name." }

& mongorestore "--uri=$uri" "--archive=$Archive" --gzip "--nsFrom=$SourceDatabase.*" "--nsTo=$RestoreDatabase.*"
if ($LASTEXITCODE -ne 0) { throw "mongorestore failed with exit code $LASTEXITCODE. Review the output; the source database was not targeted." }

$collections = & mongosh $uri --quiet --eval "JSON.stringify(db.getSiblingDB('$RestoreDatabase').getCollectionNames())"
if ($LASTEXITCODE -ne 0) { throw 'Restore completed but collection verification failed.' }
$collectionList = ($collections | Select-Object -Last 1 | ConvertFrom-Json)
if (-not $collectionList -or $collectionList.Count -eq 0) { throw "Restore target '$RestoreDatabase' contains no collections." }
Write-Output "Restore drill succeeded into isolated database '$RestoreDatabase'. Collections: $($collectionList -join ', ')"
Write-Warning 'Review expected collections and representative record counts without exposing customer data. Remove the drill database only after recording the result.'
