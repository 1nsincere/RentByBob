$ErrorActionPreference = 'Stop'
$appUrl = 'http://127.0.0.1:5173/'

try {
  $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 3
  if ($response.StatusCode -eq 200 -and $response.Content.Contains('<div id="root">')) {
    Write-Output 'RentByBob is already available on port 5173.'
    Write-Output 'Open the fictional offline preview at http://127.0.0.1:5173/?preview=1'
    Write-Output 'The existing server and its configured backend are unchanged.'
    exit 0
  }
} catch {
  Write-Output 'No verified RentByBob response was available on port 5173.'
}

$listener = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
if ($listener.Count -gt 0) {
  Write-Error 'Port 5173 is occupied by a service that did not identify as RentByBob. Nothing was changed; stop that service or choose the existing RentByBob server.'
  exit 1
}

Write-Output 'No RentByBob server is available. Starting the authenticated local app; local Supabase must already be running.'
& (Join-Path $PSScriptRoot 'start-local-ui.ps1') -Preview
