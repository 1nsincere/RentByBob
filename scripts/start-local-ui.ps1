param([switch]$Preview)
$ErrorActionPreference = 'Continue'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $output = @(& npx.cmd supabase status --output json 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) { throw 'Local stack unavailable' }
  $value = $output -join "`n"
  $local = $value.Substring($value.IndexOf('{'),$value.LastIndexOf('}')-$value.IndexOf('{')+1) | ConvertFrom-Json
  if ($local.API_URL -ne 'http://127.0.0.1:54321') { throw 'Non-local stack refused' }
  $env:VITE_SUPABASE_URL = $local.API_URL
  $env:VITE_SUPABASE_ANON_KEY = $local.ANON_KEY
  # Public browser configuration only; no privileged key goes to Vite or disk.
  if ($Preview) { Write-Output 'Open the fictional offline preview at http://127.0.0.1:5173/?preview=1' }
  & npm.cmd run dev -- --port 5173 --strictPort
} catch { Write-Output 'Could not start the local UI. Start local Supabase first; no connection keys are displayed.'; exit 1 }
finally { Remove-Item Env:VITE_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue; Remove-Item Env:VITE_SUPABASE_URL -ErrorAction SilentlyContinue; Pop-Location }
