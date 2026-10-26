param([string]$Email = 'owner@example.invalid')
# Sets a new password for a FICTIONAL (@example.invalid) account on the LOCAL Supabase stack only.
# The password is typed privately and never printed; no keys are printed. MFA (authenticator) is unchanged.
$ErrorActionPreference = 'Stop'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
Set-Location (Split-Path -Parent $PSScriptRoot)

if ($Email -notmatch '^[^@\s]+@example\.invalid$') { throw 'Only fictional @example.invalid accounts can be reset with this script.' }
# supabase status writes informational notes (e.g. "Stopped services: ...") to stderr; they are not failures.
$ErrorActionPreference = 'Continue'
$output = @(& npx.cmd supabase status --output json 2>&1 | ForEach-Object { $_.ToString() })
$statusExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$text = $output -join "`n"; $start = $text.IndexOf('{'); $end = $text.LastIndexOf('}')
if ($statusExit -ne 0 -or $start -lt 0) { throw 'Local Supabase is not running. Start Docker Desktop and run: npx.cmd supabase start' }
$local = $text.Substring($start, $end - $start + 1) | ConvertFrom-Json
if ($local.API_URL -ne 'http://127.0.0.1:54321') { throw 'Refusing: the target is not the local stack at 127.0.0.1:54321.' }
$headers = @{ apikey = $local.SERVICE_ROLE_KEY; Authorization = "Bearer $($local.SERVICE_ROLE_KEY)" }

$users = (Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/admin/users?per_page=1000" -Headers $headers).users
$user = $users | Where-Object { $_.email -eq $Email.ToLowerInvariant() } | Select-Object -First 1
if (-not $user) { throw "No local account found for $Email." }

function Read-Plain([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$first = Read-Plain 'New password (at least 12 characters, hidden)'
$second = Read-Plain 'Type the new password again'
if ($first.Length -lt 12) { throw 'The password must be at least 12 characters. Nothing was changed.' }
if ($first -ne $second) { throw 'The passwords do not match. Nothing was changed.' }

$body = @{ password = $first } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "$($local.API_URL)/auth/v1/admin/users/$($user.id)" -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
$first = $null; $second = $null
Write-Output "Password updated for $Email on the local stack. Sign in with it at http://127.0.0.1:5173 (start the app with: npm.cmd run dev:local). Your authenticator code is still required."
