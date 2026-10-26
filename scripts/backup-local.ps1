param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'RentByBob-backups\local'),
  [int]$RetentionDays = 30
)
# Full PostgreSQL backup (all schemas, including Auth accounts) of the preserved LOCAL Supabase database only.
# Output stays outside the repository. Never prints connection strings or keys.
$ErrorActionPreference = 'Stop'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectId = ([regex]::Match((Get-Content -LiteralPath (Join-Path $repoRoot 'supabase\config.toml') -Raw), '(?m)^project_id\s*=\s*"([^"]+)"')).Groups[1].Value
if (-not $projectId) { throw 'Could not read project_id from supabase/config.toml.' }
$container = "supabase_db_$projectId"

$ports = @(& docker port $container 5432 2>$null)
if ($LASTEXITCODE -ne 0 -or -not ($ports -match ':54322$')) {
  throw "Refusing to back up: container $container is not the running local database on port 54322."
}

$repoFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
$destinationFull = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
if ($destinationFull.StartsWith($repoFull, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to write backups inside the repository.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$name = "rentbybob-local-$stamp.dump"
$inside = "/tmp/$name"
try {
  & docker exec $container pg_dump -U postgres -d postgres --format=custom --no-owner --file $inside
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; no backup was written.' }
  & docker exec $container pg_restore --list $inside | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The backup could not be read back; it was not kept.' }
  & docker cp "${container}:$inside" (Join-Path $Destination $name) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the backup out of the container.' }
} finally {
  & docker exec $container rm -f $inside 2>$null | Out-Null
}

$file = Get-Item -LiteralPath (Join-Path $Destination $name)
if ($file.Length -le 0) { throw 'The backup file is empty.' }
$removed = @(Get-ChildItem -LiteralPath $Destination -Filter 'rentbybob-local-*.dump' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) })
$removed | Remove-Item -Force
Write-Output "Backup written: $($file.FullName) ($([math]::Round($file.Length / 1KB)) KB). Removed $($removed.Count) backup(s) older than $RetentionDays days."
