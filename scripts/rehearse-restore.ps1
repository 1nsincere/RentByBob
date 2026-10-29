param(
  [string]$BackupFile,
  [string]$BackupDirectory = (Join-Path $env:USERPROFILE 'RentByBob-backups\local')
)
# Restore rehearsal: restores a backup into a THROWAWAY container (same Postgres image as local Supabase,
# no published ports) and compares exact row counts with the preserved local database using read-only queries.
# The preserved database is never written to. The throwaway container is always removed.
$ErrorActionPreference = 'Stop'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectId = ([regex]::Match((Get-Content -LiteralPath (Join-Path $repoRoot 'supabase\config.toml') -Raw), '(?m)^project_id\s*=\s*"([^"]+)"')).Groups[1].Value
$source = "supabase_db_$projectId"
if (-not $BackupFile) {
  $latest = Get-ChildItem -LiteralPath $BackupDirectory -Filter 'rentbybob-local-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { throw "No backups found in $BackupDirectory. Run scripts/backup-local.ps1 first." }
  $BackupFile = $latest.FullName
}
$image = & docker inspect $source --format '{{.Config.Image}}'
if ($LASTEXITCODE -ne 0 -or -not $image) { throw "Local database container $source is not available." }

$countSql = "select string_agg(format('select %L as t, count(*) as n from %I.%I', table_schema || '.' || table_name, table_schema, table_name), ' union all ' order by table_schema, table_name) from information_schema.tables where table_schema in ('public','auth') and table_type = 'BASE TABLE'"
function Get-Counts([string]$container, [string]$database, [string]$user) {
  $query = (& docker exec $container psql -U $user -d $database -At -c $countSql) -join ''
  if ($LASTEXITCODE -ne 0 -or -not $query) { throw "Could not list tables in $database." }
  $rows = & docker exec $container psql -U $user -d $database -At -F '=' -c "$query order by 1"
  if ($LASTEXITCODE -ne 0) { throw "Could not count rows in $database." }
  $counts = @{}; foreach ($row in $rows) { $name, $n = $row -split '=', 2; $counts[$name] = [int64]$n }
  return $counts
}

$throwaway = "rbbrestore$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$started = Get-Date
try {
  $password = [guid]::NewGuid().ToString('N')
  & docker run -d --name $throwaway -e "POSTGRES_PASSWORD=$password" $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the throwaway restore container.' }
  # The image restarts once during first-time setup; wait for three consecutive successful checks.
  # Startup errors are expected while waiting, so they must not stop the script here.
  $ready = 0
  $ErrorActionPreference = 'Continue'
  for ($i = 0; $i -lt 90 -and $ready -lt 3; $i++) {
    Start-Sleep -Seconds 2
    & docker exec $throwaway psql -U postgres -d postgres -Atc 'select 1' 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready++ } else { $ready = 0 }
  }
  $ErrorActionPreference = 'Stop'
  if ($ready -lt 3) { throw 'The throwaway restore container did not become ready.' }
  & docker cp $BackupFile "${throwaway}:/tmp/rehearsal.dump" | Out-Null
  # supabase_admin is the image's superuser; restore warnings are written to stderr and counted, not fatal.
  & docker exec $throwaway psql -U supabase_admin -d postgres -c 'create database rehearsal' | Out-Null
  $ErrorActionPreference = 'Continue'
  $restoreLog = @(& docker exec $throwaway pg_restore -U supabase_admin -d rehearsal --no-owner /tmp/rehearsal.dump 2>&1 | ForEach-Object { $_.ToString() })
  $ErrorActionPreference = 'Stop'
  $restoreErrors = @($restoreLog | Where-Object { $_ -match 'error:' }).Count
  $restoreSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds)

  $expected = Get-Counts $source 'postgres' 'postgres'
  $restored = Get-Counts $throwaway 'rehearsal' 'supabase_admin'
  $mismatches = @($expected.Keys | Where-Object { -not $restored.ContainsKey($_) -or $restored[$_] -ne $expected[$_] } | Sort-Object)
  $appTables = @($expected.Keys | Where-Object { $_ -like 'public.*' }).Count
  $rowsChecked = ($expected.Values | Measure-Object -Sum).Sum
  Write-Output "Backup: $BackupFile"
  Write-Output "Restored into a throwaway container in about $restoreSeconds s (restore messages flagged as errors: $restoreErrors)."
  $restoreLog | Where-Object { $_ -match 'error:' } | Select-Object -First 10 | ForEach-Object { Write-Output "  restore note: $_" }
  Write-Output "Compared $($expected.Count) tables ($appTables app tables, plus Auth) and $rowsChecked rows against the preserved local database."
  if ($mismatches.Count) {
    foreach ($table in $mismatches) { Write-Output "MISMATCH $table expected $($expected[$table]) restored $($restored[$table])" }
    throw 'Restore rehearsal FAILED: restored row counts differ (the local database may have changed since this backup; take a fresh backup and retry).'
  }
  Write-Output 'Restore rehearsal PASSED: every table restored with the same row count.'
} finally {
  & docker rm -f $throwaway 2>$null | Out-Null
}
