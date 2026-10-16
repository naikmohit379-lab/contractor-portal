param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_-]+$')]
  [string]$DatabaseName,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\private-backups')
)

$ErrorActionPreference = 'Stop'
if (-not $env:MONGODB_URI) { throw 'Set MONGODB_URI in this PowerShell session; do not put credentials in this script or commit them.' }
$mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongodump) { throw 'MongoDB Database Tools are required. Install the official tools, then reopen PowerShell.' }

$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
$archive = Join-Path $OutputDirectory "roofdesk-$DatabaseName-$stamp.archive.gz"

& $mongodump.Source "--uri=$env:MONGODB_URI" "--db=$DatabaseName" "--archive=$archive" --gzip --quiet
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  throw "mongodump failed with exit code $LASTEXITCODE. No backup was recorded."
}
if (-not (Test-Path -LiteralPath $archive) -or (Get-Item -LiteralPath $archive).Length -eq 0) {
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  throw 'mongodump returned success but the archive is empty.'
}

$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
Set-Content -LiteralPath "$archive.sha256" -Value "$hash  $([IO.Path]::GetFileName($archive))" -Encoding ascii
Write-Output "Backup created: $archive"
Write-Output "SHA-256: $hash"
Write-Warning 'This archive contains customer and company data. Move it to encrypted off-device storage and keep credentials private.'
