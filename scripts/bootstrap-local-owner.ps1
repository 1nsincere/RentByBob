param(
  [Parameter(Mandatory=$true)][guid]$OwnerId,
  [Parameter(Mandatory=$true)][guid]$PropertyId
)
$ErrorActionPreference = 'Continue'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
Push-Location (Split-Path $PSScriptRoot -Parent)
$stage = 'local status'
try {
  $statusOutput = @(& npx.cmd supabase status --output json 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) { throw 'Local stack unavailable.' }
  $statusText = $statusOutput -join "`n"
  $start = $statusText.IndexOf('{'); $end = $statusText.LastIndexOf('}')
  if ($start -lt 0 -or $end -le $start) { throw 'Local status unavailable.' }
  $local = $statusText.Substring($start,$end-$start+1) | ConvertFrom-Json
  if ($local.API_URL -ne 'http://127.0.0.1:54321') { throw 'Non-local API refused.' }
  $query = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'bootstrap-local-owner.sql'))
  $query = $query.Replace('__OWNER_ID__',$OwnerId.ToString()).Replace('__PROPERTY_ID__',$PropertyId.ToString())
  $stage = 'SQL transaction'
  $queryFile = Join-Path ([IO.Path]::GetTempPath()) ('rent-bootstrap-' + [guid]::NewGuid().ToString('N') + '.sql')
  [IO.File]::WriteAllText($queryFile,$query)
  $result = @(& npx.cmd supabase db query --local --file $queryFile 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'Bootstrap refused or failed. Check confirmed fictional identity and existing bootstrap state.' }
  Write-Output 'Local fictional owner bootstrap complete (or identical retry). Staff access still requires MFA.'
} catch {
  Write-Output "Local bootstrap did not complete at $stage. Check the local setup guide."
  exit 1
} finally {
  if ($queryFile -and (Test-Path -LiteralPath $queryFile)) { Remove-Item -LiteralPath $queryFile }
  Pop-Location
}
