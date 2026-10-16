# Optional interactive fictional seed, never imported by the application.
$ErrorActionPreference = 'Continue'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $raw = @(& npx.cmd supabase status --output json 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) { throw 'Local stack unavailable' }
  $text = $raw -join "`n"
  $local = $text.Substring($text.IndexOf('{'),$text.LastIndexOf('}')-$text.IndexOf('{')+1) | ConvertFrom-Json
  if ($local.API_URL -ne 'http://127.0.0.1:54321') { throw 'Non-local stack refused' }
  $rawCount = @(& npx.cmd supabase db query --local 'select count(*) as count from public.properties' 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) { throw 'Local state check failed' }
  $countText = $rawCount -join "`n"
  $state = $countText.Substring($countText.IndexOf('{'),$countText.LastIndexOf('}')-$countText.IndexOf('{')+1) | ConvertFrom-Json
  if ([int]$state.rows[0].count -ne 0) {
    Write-Output 'A property already exists. Sign in as its existing owner. No accounts or records were changed.'
    exit 1
  }
  $email = (Read-Host 'Fictional owner email (must end in .invalid)').Trim().ToLowerInvariant()
  if ($email -notmatch '^[^\s@]+@[^\s@]+\.invalid$') { throw 'A fictional .invalid email is required' }
  $secure = Read-Host 'Choose your local test password (12 or more characters; hidden)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($password.Length -lt 12) { throw 'Password too short' }
  $body = @{email=$email; password=$password; email_confirm=$true} | ConvertTo-Json
  $created = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/admin/users" -Method Post -ContentType 'application/json' -Headers @{apikey=$local.SERVICE_ROLE_KEY; Authorization="Bearer $($local.SERVICE_ROLE_KEY)"} -Body $body -ErrorAction Stop
  if (-not $created.id) { throw 'No identity returned' }
  $propertyId = [guid]::NewGuid().ToString()
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/bootstrap-local-owner.ps1" -OwnerId $created.id -PropertyId $propertyId
  if ($LASTEXITCODE -ne 0) { throw 'Account exists but bootstrap was refused; use the documented administrative review, not a reset' }
  Write-Output 'Fictional owner created. Run npm.cmd run dev:local, sign in with the email/password you chose, then enroll your authenticator. No credentials were saved to a file.'
} catch { Write-Output 'Setup did not complete. Check the local stack, empty-property prerequisite and fictional email/password requirements. Existing accounts are never overwritten; no reset was performed.'; exit 1 }
finally { $password=$null; $body=$null; $secure=$null; $local=$null; Pop-Location }
