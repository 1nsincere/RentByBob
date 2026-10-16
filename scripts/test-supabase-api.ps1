param([switch]$TestBootstrap)
$ErrorActionPreference = 'Continue'
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH

function Invoke-LocalSql([string]$Query) {
  $output = @(& npx.cmd supabase db query --local $Query 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) { throw 'Local SQL operation failed.' }
  return $output
}

function Get-LocalTotpCode([string]$Secret) {
  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  $bytes = [System.Collections.Generic.List[byte]]::new()
  $buffer = 0
  $bits = 0
  foreach ($character in $Secret.ToUpperInvariant().ToCharArray()) {
    if ($character -eq '=') { break }
    $value = $alphabet.IndexOf($character)
    if ($value -lt 0) { throw 'Local Auth returned an invalid test TOTP secret.' }
    $buffer = ($buffer -shl 5) -bor $value
    $bits += 5
    if ($bits -ge 8) {
      $bits -= 8
      $bytes.Add([byte](($buffer -shr $bits) -band 255))
      $buffer = $buffer -band ((1 -shl $bits) - 1)
    }
  }
  if ($bytes.Count -eq 0) { throw 'Local Auth returned an empty test TOTP secret.' }

  $counter = [BitConverter]::GetBytes([long][Math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / 30))
  [Array]::Reverse($counter)
  $hmac = [System.Security.Cryptography.HMACSHA1]::new($bytes.ToArray())
  try { $hash = $hmac.ComputeHash($counter) } finally { $hmac.Dispose() }
  $offset = $hash[$hash.Length - 1] -band 15
  $binary = (($hash[$offset] -band 127) -shl 24) -bor
    (($hash[$offset + 1] -band 255) -shl 16) -bor
    (($hash[$offset + 2] -band 255) -shl 8) -bor
    ($hash[$offset + 3] -band 255)
  return ([int]($binary % 1000000)).ToString('D6')
}

function New-LocalMfaSession([string]$Email, [string]$Password, [string]$ApiUrl, [string]$AnonKey) {
  $session = Invoke-RestMethod -Uri "$ApiUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $AnonKey } -Method Post -ContentType 'application/json' -Body (@{
    email = $Email
    password = $Password
  } | ConvertTo-Json) -ErrorAction Stop
  $userHeaders = @{ apikey = $AnonKey; Authorization = "Bearer $($session.access_token)" }
  $factor = Invoke-RestMethod -Uri "$ApiUrl/auth/v1/factors" -Headers $userHeaders -Method Post -ContentType 'application/json' -Body (@{
    factor_type = 'totp'
    friendly_name = 'disposable-local-integration'
  } | ConvertTo-Json) -ErrorAction Stop
  $challenge = Invoke-RestMethod -Uri "$ApiUrl/auth/v1/factors/$($factor.id)/challenge" -Headers $userHeaders -Method Post -ContentType 'application/json' -Body '{}' -ErrorAction Stop
  $verified = Invoke-RestMethod -Uri "$ApiUrl/auth/v1/factors/$($factor.id)/verify" -Headers $userHeaders -Method Post -ContentType 'application/json' -Body (@{
    challenge_id = $challenge.id
    code = Get-LocalTotpCode $factor.totp.secret
  } | ConvertTo-Json) -ErrorAction Stop
  if (-not $verified.access_token) { throw 'Local Auth did not return the verified MFA session.' }
  return $verified
}

function Invoke-LocalInvitation($Local, [string]$Token, [string]$PropertyId, [string]$AccountType, [string]$Email) {
  return Invoke-WebRequest -Uri "$($Local.API_URL)/functions/v1/invite-account" -Headers @{
    apikey = $Local.ANON_KEY
    Authorization = "Bearer $Token"
    Origin = 'http://127.0.0.1:5173'
  } -Method Post -ContentType 'application/json' -Body (@{
    propertyId = $PropertyId
    accountType = $AccountType
    email = $Email
  } | ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
}

function Get-MailpitMessagesForAddresses($Messages, [string[]]$Addresses) {
  $matches = [System.Collections.Generic.List[object]]::new()
  foreach ($message in $Messages) {
    foreach ($recipient in $message.To) {
      if ($Addresses -contains [string]$recipient.Address) {
        $matches.Add($message)
        break
      }
    }
  }
  return $matches.ToArray()
}

function Get-InviteLinkResponse([string]$Uri, [string]$AnonKey) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers @{ apikey = $AnonKey } -Method Get -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
    return [pscustomobject]@{ Status = [int]$response.StatusCode; Location = [string]$response.Headers['Location'] }
  } catch {
    if ($_.Exception.Response) {
      return [pscustomobject]@{
        Status = [int]$_.Exception.Response.StatusCode
        Location = [string]$_.Exception.Response.Headers['Location']
      }
    }
    throw 'Invitation verification request failed unexpectedly.'
  }
}

$statusOutput = @(& npx.cmd supabase status --output json 2>&1 | ForEach-Object { $_.ToString() })
if ($LASTEXITCODE -ne 0) { throw 'Could not read local Supabase status.' }
$statusText = $statusOutput -join "`n"
$jsonStart = $statusText.IndexOf('{')
$jsonEnd = $statusText.LastIndexOf('}')
if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'Local Supabase status returned no connection details.' }
$local = $statusText.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
if ($local.API_URL -ne 'http://127.0.0.1:54321') { throw 'Refusing to test a non-local Supabase API.' }

$anonHeaders = @{ apikey = $local.ANON_KEY; Authorization = "Bearer $($local.ANON_KEY)" }
$adminHeaders = @{ apikey = $local.SERVICE_ROLE_KEY; Authorization = "Bearer $($local.SERVICE_ROLE_KEY)" }
$testId = [guid]::NewGuid().ToString('N')
$propertyId = [guid]::NewGuid().ToString()
$tenantA = [guid]::NewGuid().ToString()
$tenantB = [guid]::NewGuid().ToString()
$attemptTenant = [guid]::NewGuid().ToString()
$createdUsers = [System.Collections.Generic.List[string]]::new()
$invitedEmails = [System.Collections.Generic.List[string]]::new()
$mailpitMessageIds = [System.Collections.Generic.List[string]]::new()
$passed = [System.Collections.Generic.List[string]]::new()
$sqlFixturesStarted = $false
$stage = 'read local migration history'
$failed = $false

try {
  $requiredMigrations = @(Get-ChildItem -LiteralPath "$PSScriptRoot/../supabase/migrations" -Filter '*.sql' | ForEach-Object { $_.Name.Split('_')[0] })
  $migrationOutput = Invoke-LocalSql "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version"
  $migrationText = $migrationOutput -join "`n"
  $migrationStart = $migrationText.IndexOf('{')
  $migrationEnd = $migrationText.LastIndexOf('}')
  if ($migrationStart -lt 0 -or $migrationEnd -le $migrationStart) { throw 'Migration history returned no data.' }
  $migrationState = $migrationText.Substring($migrationStart, $migrationEnd - $migrationStart + 1) | ConvertFrom-Json
  $appliedMigrations = @($migrationState.rows | ForEach-Object { $_.version })
  if (@($requiredMigrations | Where-Object { $appliedMigrations -notcontains $_ }).Count -gt 0) {
    throw 'The required access and invitation migrations are not all applied to the local database.'
  }
  $passed.Add('Access and invitation migrations applied to local database')

  $stage = 'check anonymous access'
  $anonymousStatus = 0
  try {
    $null = Invoke-WebRequest -Uri "$($local.API_URL)/rest/v1/tenants?select=id" -Headers $anonHeaders -Method Get -UseBasicParsing -ErrorAction Stop
    $anonymousStatus = 200
  } catch {
    if ($_.Exception.Response) { $anonymousStatus = [int]$_.Exception.Response.StatusCode } else { throw 'Anonymous API request failed unexpectedly.' }
  }
  if ($anonymousStatus -lt 400) { throw 'Anonymous access unexpectedly read tenant records.' }
  $passed.Add('Anonymous tenant access denied')

  $stage = 'check public sign-up'
  $signupStatus = 0
  $signupId = $null
  try {
    $signup = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/signup" -Headers $anonHeaders -Method Post -ContentType 'application/json' -Body (@{
      email = "signup-check-$testId@example.invalid"
      password = [guid]::NewGuid().ToString('N')
    } | ConvertTo-Json) -ErrorAction Stop
    $signupStatus = 200
    if ($signup.user.id) { $signupId = [string]$signup.user.id; $createdUsers.Add($signupId) }
  } catch {
    if ($_.Exception.Response) { $signupStatus = [int]$_.Exception.Response.StatusCode } else { throw 'Sign-up API request failed unexpectedly.' }
  }
  if ($signupStatus -lt 400) { throw 'Public sign-up unexpectedly succeeded.' }
  $passed.Add('Public sign-up disabled')

  $stage = 'create fictional local Auth users'
  $emails = @(
    "rent-test-a-$testId@example.invalid",
    "rent-test-b-$testId@example.invalid",
    "staff-owner-$testId@example.invalid",
    "staff-clerk-$testId@example.invalid"
  )
  $passwords = @(
    "$([guid]::NewGuid().ToString('N'))A1!",
    "$([guid]::NewGuid().ToString('N'))B2!",
    "$([guid]::NewGuid().ToString('N'))C3!",
    "$([guid]::NewGuid().ToString('N'))D4!"
  )
  $userIds = [System.Collections.Generic.List[string]]::new()
  for ($i = 0; $i -lt 4; $i++) {
    $newUser = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/admin/users" -Headers $adminHeaders -Method Post -ContentType 'application/json' -Body (@{
      email = $emails[$i]
      password = $passwords[$i]
      email_confirm = $true
      user_metadata = @{ role = 'owner' }
    } | ConvertTo-Json -Depth 4) -ErrorAction Stop
    $userId = [string]$newUser.id
    if (-not $userId) { throw 'Auth did not return a test-user identifier.' }
    $userIds.Add($userId)
    $createdUsers.Add($userId)
  }

  $stage = 'create fictional local database records'
  $sqlFixturesStarted = $true
  if ($TestBootstrap) {
    $stage = 'bootstrap local fictional owner and repeat identical request'
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
      $bootstrapOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/bootstrap-local-owner.ps1" -OwnerId $userIds[2] -PropertyId $propertyId 2>&1)
      if ($LASTEXITCODE -ne 0) { $failureDetail = $bootstrapOutput -join ' '; throw 'Local bootstrap failed (requires an empty property table on first run).' }
    }
    $passed.Add('Local administrative bootstrap and identical retry succeed')
  } else {
    $null = Invoke-LocalSql "INSERT INTO public.properties(id,name) VALUES ('$propertyId','Local API test property')"
  }
  $null = Invoke-LocalSql "INSERT INTO public.tenants(id,property_id,display_name,kind) VALUES ('$tenantA','$propertyId','Local Test Tenant A','individual'),('$tenantB','$propertyId','Local Test Tenant B','individual')"
  $null = Invoke-LocalSql "INSERT INTO public.tenant_contacts(property_id,tenant_id,user_id) VALUES ('$propertyId','$tenantA','$($userIds[0])'),('$propertyId','$tenantB','$($userIds[1])')"
  if (-not $TestBootstrap) {
    $null = Invoke-LocalSql "INSERT INTO public.staff_memberships(property_id,user_id,role) VALUES ('$propertyId','$($userIds[2])','owner')"
  }
  $null = Invoke-LocalSql "INSERT INTO public.staff_memberships(property_id,user_id,role) VALUES ('$propertyId','$($userIds[3])','clerk')"

  $stage = 'sign in fictional local users'
  $tokens = [System.Collections.Generic.List[string]]::new()
  for ($i = 0; $i -lt 2; $i++) {
    $session = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/token?grant_type=password" -Headers @{ apikey = $local.ANON_KEY } -Method Post -ContentType 'application/json' -Body (@{
      email = $emails[$i]
      password = $passwords[$i]
    } | ConvertTo-Json) -ErrorAction Stop
    if (-not $session.access_token) { throw 'Auth did not issue a local test session.' }
    $tokens.Add([string]$session.access_token)
  }
  $stage = 'enroll staff MFA for local invitation authorization tests'
  $ownerSession = New-LocalMfaSession $emails[2] $passwords[2] $local.API_URL $local.ANON_KEY
  $clerkSession = New-LocalMfaSession $emails[3] $passwords[3] $local.API_URL $local.ANON_KEY
  $ownerToken = [string]$ownerSession.access_token
  $clerkToken = [string]$clerkSession.access_token
  if (-not $ownerToken -or -not $clerkToken) { throw 'Local staff MFA did not issue sessions.' }
  $passed.Add('Owner and clerk obtained sessions after real local TOTP verification')

  $stage = 'verify tenant isolation through REST API'
  $visibleA = @(Invoke-RestMethod -Uri "$($local.API_URL)/rest/v1/tenants?select=id,display_name&order=id" -Headers @{
    apikey = $local.ANON_KEY
    Authorization = "Bearer $($tokens[0])"
  } -Method Get -ErrorAction Stop)
  $visibleB = @(Invoke-RestMethod -Uri "$($local.API_URL)/rest/v1/tenants?select=id,display_name&order=id" -Headers @{
    apikey = $local.ANON_KEY
    Authorization = "Bearer $($tokens[1])"
  } -Method Get -ErrorAction Stop)
  if ($visibleA.Count -ne 1 -or [string]$visibleA[0].id -ne $tenantA) { throw 'Tenant A saw an unexpected set of records.' }
  if ($visibleB.Count -ne 1 -or [string]$visibleB[0].id -ne $tenantB) { throw 'Tenant B saw an unexpected set of records.' }
  $passed.Add('Authenticated API isolates each tenant contact')

  $stage = 'verify invitation CORS preflight'
  $preflight = Invoke-WebRequest -Uri "$($local.API_URL)/functions/v1/invite-account" -Headers @{
    Origin = 'http://127.0.0.1:5173'
    'Access-Control-Request-Method' = 'POST'
    'Access-Control-Request-Headers' = 'authorization,apikey,content-type'
  } -Method Options -UseBasicParsing -ErrorAction Stop
  if ([int]$preflight.StatusCode -lt 200 -or [int]$preflight.StatusCode -ge 300) {
    throw 'The local API gateway rejected invitation CORS preflight.'
  }
  $passed.Add('Local API gateway accepts function CORS preflight')

  $stage = 'verify renter cannot issue invitations'
  $inviteStatus = 0
  try {
    $null = Invoke-WebRequest -Uri "$($local.API_URL)/functions/v1/invite-account" -Headers @{
      apikey = $local.ANON_KEY
      Authorization = "Bearer $($tokens[0])"
      Origin = 'http://127.0.0.1:5173'
    } -Method Post -ContentType 'application/json' -Body (@{
      propertyId = $propertyId
      accountType = 'staff'
      email = "must-not-send-$testId@example.invalid"
    } | ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
    $inviteStatus = 200
  } catch {
    if ($_.Exception.Response) { $inviteStatus = [int]$_.Exception.Response.StatusCode } else { throw 'Invitation function request failed unexpectedly.' }
  }
  if ($inviteStatus -ne 403) { throw "A renter's staff invitation request returned HTTP $inviteStatus instead of 403." }
  $passed.Add('Renter cannot invite staff, even with forged owner metadata')

  $stage = 'verify clerk can invite renters but cannot invite staff'
  $clerkInviteEmail = "invite-tenant-$testId@example.invalid"
  $invitedEmails.Add($clerkInviteEmail)
  $clerkInviteResponse = Invoke-LocalInvitation $local $clerkToken $propertyId 'tenant' $clerkInviteEmail
  if ([int]$clerkInviteResponse.StatusCode -ne 202) { throw 'Authorized clerk renter invitation did not return 202.' }
  $clerkInvite = $clerkInviteResponse.Content | ConvertFrom-Json
  if (-not $clerkInvite.invitationId) { throw 'Clerk renter invitation did not return its audit reference.' }
  $passed.Add('MFA clerk can issue a renter invitation')

  $clerkStaffStatus = 0
  try {
    $null = Invoke-LocalInvitation $local $clerkToken $propertyId 'staff' "clerk-staff-$testId@example.invalid"
    $clerkStaffStatus = 202
  } catch {
    if ($_.Exception.Response) { $clerkStaffStatus = [int]$_.Exception.Response.StatusCode } else { throw 'Clerk staff invitation request failed unexpectedly.' }
  }
  if ($clerkStaffStatus -ne 403) { throw "Clerk staff invitation returned HTTP $clerkStaffStatus instead of 403." }
  $passed.Add('MFA clerk cannot issue staff invitations')

  $stage = 'verify owner can issue renter and staff invitations'
  $ownerTenantEmail = "owner-tenant-$testId@example.invalid"
  $invitedEmails.Add($ownerTenantEmail)
  $ownerStaffEmail = "owner-staff-$testId@example.invalid"
  $invitedEmails.Add($ownerStaffEmail)
  $ownerTenantResponse = Invoke-LocalInvitation $local $ownerToken $propertyId 'tenant' $ownerTenantEmail
  if ([int]$ownerTenantResponse.StatusCode -ne 202) { throw 'Authorized owner renter invitation did not return 202.' }
  $ownerTenantInvite = $ownerTenantResponse.Content | ConvertFrom-Json
  if (-not $ownerTenantInvite.invitationId) { throw 'Owner renter invitation did not return an audit reference.' }
  $ownerStaffResponse = Invoke-LocalInvitation $local $ownerToken $propertyId 'staff' $ownerStaffEmail
  if ([int]$ownerStaffResponse.StatusCode -ne 202) { throw 'Authorized owner staff invitation did not return 202.' }
  $ownerStaffInvite = $ownerStaffResponse.Content | ConvertFrom-Json
  if (-not $ownerStaffInvite.invitationId) { throw 'Owner staff invitation did not return an audit reference.' }
  $passed.Add('MFA owner can issue renter and staff invitations')

  $stage = 'deny browser invitation outcome forgery'
  $spoofStatus = 0
  try {
    $null = Invoke-WebRequest -Uri "$($local.API_URL)/rest/v1/rpc/complete_account_invitation" -Headers @{
      apikey = $local.ANON_KEY; Authorization = "Bearer $ownerToken"
    } -Method Post -ContentType 'application/json' -Body (@{
      p_invitation_id = $ownerStaffInvite.invitationId; p_outcome = 'failed'
    } | ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
  } catch {
    if ($_.Exception.Response) { $spoofStatus = [int]$_.Exception.Response.StatusCode } else { throw 'Outcome denial request failed unexpectedly.' }
  }
  if ($spoofStatus -notin @(401,403,404)) { throw 'Browser outcome forgery was not denied.' }
  $passed.Add('Even MFA owner cannot call dispatcher outcome RPC')

  $stage = 'verify invitations create no application access and avoid email in audit'
  $invitationAccess = Invoke-LocalSql "SELECT count(*) AS access_count FROM (SELECT user_id FROM public.staff_memberships UNION ALL SELECT user_id FROM public.tenant_contacts) access_rows JOIN auth.users u ON u.id = access_rows.user_id WHERE lower(u.email) IN ('$clerkInviteEmail','$ownerTenantEmail','$ownerStaffEmail')"
  $invitationAccessText = $invitationAccess -join "`n"
  $accessStart = $invitationAccessText.IndexOf('{')
  $accessEnd = $invitationAccessText.LastIndexOf('}')
  if ($accessStart -lt 0 -or $accessEnd -le $accessStart) { throw 'Invitation access audit query returned no data.' }
  $accessState = $invitationAccessText.Substring($accessStart, $accessEnd - $accessStart + 1) | ConvertFrom-Json
  if ([int]$accessState.rows[0].access_count -ne 0) {
    $failureDetail = "Found $($accessState.rows[0].access_count) application membership(s) for invited addresses."
    throw 'An invitation unexpectedly granted a staff or tenant membership.'
  }
  $auditCountOutput = Invoke-LocalSql "SELECT count(*) AS event_count FROM public.audit_events WHERE property_id='$propertyId' AND action LIKE 'account_invitation_%'"
  $auditCountText = $auditCountOutput -join "`n"
  $auditCountStart = $auditCountText.IndexOf('{')
  $auditCountEnd = $auditCountText.LastIndexOf('}')
  if ($auditCountStart -lt 0 -or $auditCountEnd -le $auditCountStart) { throw 'Invitation event count query returned no data.' }
  $auditCountState = $auditCountText.Substring($auditCountStart, $auditCountEnd - $auditCountStart + 1) | ConvertFrom-Json
  $databaseAuditCount = [int]$auditCountState.rows[0].event_count
  $audit = @(Invoke-RestMethod -Uri "$($local.API_URL)/rest/v1/audit_events?select=action,reason,target_id&action=like.account_invitation_*&property_id=eq.$propertyId" -Headers @{
    apikey = $local.ANON_KEY
    Authorization = "Bearer $ownerToken"
  } -Method Get -ErrorAction Stop)
  $auditActions = @($audit | ForEach-Object { $_.action })
  $auditReasons = @($audit | ForEach-Object { $_.reason })
  $emailInAudit = @($auditReasons | Where-Object { $_ -match '@' }).Count -gt 0
  if ($auditActions.Count -ne 6 -or $emailInAudit) {
    $actionSummary = $auditActions -join ','
    $failureDetail = "Expected six audit events; database count: $databaseAuditCount; owner API count: $($auditActions.Count); actions: $actionSummary; email present: $emailInAudit."
    throw 'Invitation audit records are incomplete or contain an email address.'
  }
  $passed.Add('Invitations grant no app access and audit contains no email address')

  $stage = 'verify local invitations reached the mail catcher'
  $mail = Invoke-RestMethod -Uri "$($local.MAILPIT_URL)/api/v1/messages?start=0&limit=100" -Method Get -ErrorAction Stop
  $invitedMail = @(Get-MailpitMessagesForAddresses $mail.messages @($clerkInviteEmail, $ownerTenantEmail, $ownerStaffEmail))
  if ($invitedMail.Count -ne 3) {
    $failureDetail = "Expected three local invitation emails; received $($invitedMail.Count)."
    throw 'Local Mailpit did not receive the expected invitation emails.'
  }
  foreach ($message in $invitedMail) {
    if ($message.ID) { $mailpitMessageIds.Add([string]$message.ID) }
  }
  $passed.Add('Three authorized invitation emails reached local Mailpit')

  $stage = 'read invitation email from local Mailpit'
  $clerkInviteMessage = @($invitedMail | Where-Object {
    $toAddresses = @($_.To | ForEach-Object { $_.Address })
    $toAddresses -contains $clerkInviteEmail
  })[0]
  $clerkInviteDetail = Invoke-RestMethod -Uri "$($local.MAILPIT_URL)/api/v1/message/$($clerkInviteMessage.ID)" -Method Get -ErrorAction Stop
  $stage = 'find invitation verification link'
  $inviteLinkMatch = [regex]::Match([string]$clerkInviteDetail.Text, 'https?://[^\s<>"'']+')
  if (-not $inviteLinkMatch.Success) { throw 'Local invitation email did not contain a verification link.' }
  $inviteUri = [uri]$inviteLinkMatch.Value.TrimEnd(').,;')
  $stage = 'validate invitation link is local'
  if ($inviteUri.Scheme -ne 'http' -or $inviteUri.Host -ne '127.0.0.1' -or $inviteUri.Port -ne 54321 -or $inviteUri.AbsolutePath -ne '/auth/v1/verify') {
    throw 'Invitation email verification link did not point to the local Auth service.'
  }
  $stage = 'verify invitation token'
  $firstVerification = Get-InviteLinkResponse $inviteUri.AbsoluteUri $local.ANON_KEY
  if ($firstVerification.Status -lt 300 -or $firstVerification.Status -ge 400) {
    throw "Local invitation verification returned HTTP $($firstVerification.Status) instead of a redirect."
  }
  $firstRedirect = [uri]$firstVerification.Location
  if ($firstRedirect.Fragment -notmatch 'access_token=') { throw 'The first invitation verification did not issue a session.' }
  $inviteSession = @{}
  foreach ($part in $firstRedirect.Fragment.TrimStart('#').Split('&')) {
    $pair = $part.Split('=', 2)
    if ($pair.Count -eq 2) {
      $inviteSession[[System.Net.WebUtility]::UrlDecode($pair[0])] = [System.Net.WebUtility]::UrlDecode($pair[1])
    }
  }
  if ($inviteSession.type -ne 'invite' -or -not $inviteSession.access_token) {
    throw 'The verification redirect did not provide an invitation session.'
  }
  $stage = 'set recipient password from invitation session'
  $recipientPassword = "$([guid]::NewGuid().ToString('N'))Z9!"
  $null = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/user" -Headers @{
    apikey = $local.ANON_KEY
    Authorization = "Bearer $($inviteSession.access_token)"
  } -Method Put -ContentType 'application/json' -Body (@{ password = $recipientPassword } | ConvertTo-Json) -ErrorAction Stop
  $recipientSession = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/token?grant_type=password" -Headers @{ apikey = $local.ANON_KEY } -Method Post -ContentType 'application/json' -Body (@{
    email = $clerkInviteEmail
    password = $recipientPassword
  } | ConvertTo-Json) -ErrorAction Stop
  if (-not $recipientSession.access_token) { throw 'The invited user could not sign in after setting a password.' }
  $passed.Add('Invited recipient can set a password and sign in')
  $stage = 'verify accepted invitation grants no application access'
  $acceptedAccessOutput = Invoke-LocalSql "SELECT count(*) AS access_count FROM (SELECT user_id FROM public.staff_memberships UNION ALL SELECT user_id FROM public.tenant_contacts) access_rows JOIN auth.users u ON u.id = access_rows.user_id WHERE lower(u.email) = '$clerkInviteEmail'"
  $acceptedAccessText = $acceptedAccessOutput -join "`n"
  $acceptedAccessStart = $acceptedAccessText.IndexOf('{')
  $acceptedAccessEnd = $acceptedAccessText.LastIndexOf('}')
  if ($acceptedAccessStart -lt 0 -or $acceptedAccessEnd -le $acceptedAccessStart) { throw 'Accepted invitation access query returned no data.' }
  $acceptedAccessState = $acceptedAccessText.Substring($acceptedAccessStart, $acceptedAccessEnd - $acceptedAccessStart + 1) | ConvertFrom-Json
  if ([int]$acceptedAccessState.rows[0].access_count -ne 0) { throw 'Accepting an invitation unexpectedly granted application access.' }
  $passed.Add('Accepted invitation still grants no app membership')
  $stage = 'verify invitation replay rejection'
  $replay = Get-InviteLinkResponse $inviteUri.AbsoluteUri $local.ANON_KEY
  $replayRejected = $replay.Status -ge 400
  if (-not $replayRejected -and $replay.Location) {
    $replayRedirect = [uri]$replay.Location
    $replayRejected = $replayRedirect.Query -match 'error(_code)?=' -or $replayRedirect.Fragment -match 'error(_code)?='
  }
  if (-not $replayRejected) {
    $failureDetail = "The same local invite URL returned HTTP $($replay.Status) without an error redirect."
    throw 'A replayed invitation link remained usable.'
  }
  $passed.Add('Local invitation link verifies once and rejects replay')

  $stage = 'verify disallowed origin cannot issue invitations'
  $originStatus = 0
  try {
    $null = Invoke-WebRequest -Uri "$($local.API_URL)/functions/v1/invite-account" -Headers @{
      apikey = $local.ANON_KEY
      Authorization = "Bearer $($tokens[0])"
      Origin = 'https://untrusted.example.invalid'
    } -Method Post -ContentType 'application/json' -Body (@{
      propertyId = $propertyId
      accountType = 'tenant'
      email = "must-not-send-origin-$testId@example.invalid"
    } | ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
    $originStatus = 200
  } catch {
    if ($_.Exception.Response) { $originStatus = [int]$_.Exception.Response.StatusCode } else { throw 'Disallowed-origin request failed unexpectedly.' }
  }
  if ($originStatus -ne 403) { throw "A disallowed origin returned HTTP $originStatus instead of 403." }
  $passed.Add('Invitation handler rejects unapproved origins')

  $stage = 'verify revocation was persisted in local PostgreSQL'
  $null = Invoke-LocalSql "UPDATE public.tenant_contacts SET revoked_at = now() WHERE tenant_id = '$tenantA'"
  $revocationOutput = Invoke-LocalSql "SELECT revoked_at IS NOT NULL AS revoked FROM public.tenant_contacts WHERE tenant_id = '$tenantA'"
  $revocationText = $revocationOutput -join "`n"
  $revocationStart = $revocationText.IndexOf('{')
  $revocationEnd = $revocationText.LastIndexOf('}')
  if ($revocationStart -lt 0 -or $revocationEnd -le $revocationStart) { throw 'The revocation query returned no data.' }
  $revocationState = $revocationText.Substring($revocationStart, $revocationEnd - $revocationStart + 1) | ConvertFrom-Json
  if ($revocationState.rows.Count -ne 1 -or $revocationState.rows[0].revoked -ne $true) { throw 'The local database did not persist test contact revocation.' }
  $stage = 'fetch records after contact revocation'
  $revokedResponse = Invoke-WebRequest -Uri "$($local.API_URL)/rest/v1/tenants?select=id,display_name&order=id" -Headers @{
    apikey = $local.ANON_KEY
    Authorization = "Bearer $($tokens[0])"
  } -Method Get -UseBasicParsing -ErrorAction Stop
  $stage = 'parse records after contact revocation'
  $parsedRevokedRecords = ConvertFrom-Json -InputObject $revokedResponse.Content
  if ($null -eq $parsedRevokedRecords) { $visibleAfterRevocation = @() }
  else { $visibleAfterRevocation = @($parsedRevokedRecords) }
  $stage = 'assert revoked contact has no tenant access'
  if ($visibleAfterRevocation.Count -ne 0) {
    $sawTenantA = @($visibleAfterRevocation | Where-Object { [string]$_.id -eq $tenantA }).Count -gt 0
    $sawTenantB = @($visibleAfterRevocation | Where-Object { [string]$_.id -eq $tenantB }).Count -gt 0
    $failureDetail = "PostgREST returned $($visibleAfterRevocation.Count) row(s); own record visible: $sawTenantA; other contact record visible: $sawTenantB."
    throw 'A revoked contact retained tenant access in its existing session.'
  }
  $passed.Add('Contact revocation takes effect with an existing session')

  $stage = 'verify user metadata cannot grant staff permission'
  $rpcDenied = $false
  try {
    $null = Invoke-WebRequest -Uri "$($local.API_URL)/rest/v1/rpc/create_tenant" -Headers @{
      apikey = $local.ANON_KEY
      Authorization = "Bearer $($tokens[0])"
    } -Method Post -ContentType 'application/json' -Body (@{
      p_property_id = $propertyId
      p_tenant_id = $attemptTenant
      p_display_name = 'Unauthorized local test'
      p_kind = 'individual'
    } | ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
  } catch {
    if ($_.Exception.Response) { $rpcDenied = ([int]$_.Exception.Response.StatusCode -ge 400) } else { throw 'Staff function API request failed unexpectedly.' }
  }
  if (-not $rpcDenied) { throw 'Renter with forged user metadata unexpectedly called a staff-only function.' }
  $passed.Add('Forged user metadata cannot grant staff function access')
} catch {
  $failed = $true
  $failureStage = $stage
  $failureType = $_.Exception.GetType().Name
  if ($_.Exception.Response) { $failureHttpStatus = [int]$_.Exception.Response.StatusCode }
} finally {
  if ($invitedEmails.Count -gt 0) {
    try {
      $mail = Invoke-RestMethod -Uri "$($local.MAILPIT_URL)/api/v1/messages?start=0&limit=100" -Method Get -ErrorAction Stop
      $matchingMessages = @(Get-MailpitMessagesForAddresses $mail.messages $invitedEmails.ToArray())
      foreach ($message in $matchingMessages) {
        if ($message.ID -and -not $mailpitMessageIds.Contains([string]$message.ID)) {
          $mailpitMessageIds.Add([string]$message.ID)
        }
      }
    } catch {
      if (-not $failed) {
        $failed = $true
        $failureStage = 'find Mailpit fixtures for cleanup'
        $failureType = $_.Exception.GetType().Name
      }
    }
  }
  if ($invitedEmails.Count -gt 0) {
    try {
      $emailList = ($invitedEmails | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ','
      $invitedUserOutput = Invoke-LocalSql "SELECT id FROM auth.users WHERE lower(email) IN ($emailList)"
      $invitedUserText = $invitedUserOutput -join "`n"
      $invitedUserStart = $invitedUserText.IndexOf('{')
      $invitedUserEnd = $invitedUserText.LastIndexOf('}')
      if ($invitedUserStart -lt 0 -or $invitedUserEnd -le $invitedUserStart) { throw 'Local Auth invitation cleanup query returned no data.' }
      $invitedUserState = $invitedUserText.Substring($invitedUserStart, $invitedUserEnd - $invitedUserStart + 1) | ConvertFrom-Json
      foreach ($row in $invitedUserState.rows) {
        if (-not $createdUsers.Contains([string]$row.id)) { $createdUsers.Add([string]$row.id) }
      }
    } catch {
      if (-not $failed) {
        $failed = $true
        $failureStage = 'find invited Auth fixtures for cleanup'
        $failureType = $_.Exception.GetType().Name
      }
    }
  }
  if ($sqlFixturesStarted) {
    try {
      $null = Invoke-LocalSql "DELETE FROM public.audit_events WHERE property_id='$propertyId'"
      $null = Invoke-LocalSql "DELETE FROM public.tenant_contacts WHERE tenant_id IN ('$tenantA','$tenantB')"
      $null = Invoke-LocalSql "DELETE FROM public.tenants WHERE id IN ('$tenantA','$tenantB','$attemptTenant')"
      $null = Invoke-LocalSql "DELETE FROM public.staff_memberships WHERE property_id='$propertyId'"
      $null = Invoke-LocalSql "DELETE FROM public.properties WHERE id='$propertyId'"
    } catch {
      if (-not $failed) {
        $failed = $true
        $failureStage = 'clean local database fixtures'
        $failureType = $_.Exception.GetType().Name
        if ($_.Exception.Response) { $failureHttpStatus = [int]$_.Exception.Response.StatusCode }
      }
    }
  }
  foreach ($userId in $createdUsers) {
    try {
      $null = Invoke-RestMethod -Uri "$($local.API_URL)/auth/v1/admin/users/$userId" -Headers $adminHeaders -Method Delete -ErrorAction Stop
    } catch {
      if (-not $failed) {
        $failed = $true
        $failureStage = 'clean local Auth fixtures'
        $failureType = $_.Exception.GetType().Name
        if ($_.Exception.Response) { $failureHttpStatus = [int]$_.Exception.Response.StatusCode }
      }
    }
  }
  if ($mailpitMessageIds.Count -gt 0) {
    try {
      $null = Invoke-WebRequest -Uri "$($local.MAILPIT_URL)/api/v1/messages" -Method Delete -ContentType 'application/json' -Body (@{
        IDs = @($mailpitMessageIds)
      } | ConvertTo-Json) -UseBasicParsing -ErrorAction Stop
    } catch {
      if (-not $failed) {
        $failed = $true
        $failureStage = 'clean local Mailpit fixtures'
        $failureType = $_.Exception.GetType().Name
        if ($_.Exception.Response) { $failureHttpStatus = [int]$_.Exception.Response.StatusCode }
      }
    }
  }
}

foreach ($result in $passed) { Write-Output "PASS: $result" }
if ($failed) {
  if ($failureDetail) { Write-Output "FAIL: $failureStage ($failureDetail)." }
  elseif ($failureHttpStatus) { Write-Output "FAIL: $failureStage (HTTP $failureHttpStatus)." }
  else { Write-Output "FAIL: $failureStage ($failureType)." }
  exit 1
}
Write-Output 'Local Supabase API checks passed; fictional fixtures removed.'
