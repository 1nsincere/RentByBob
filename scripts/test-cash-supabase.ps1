$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectId = "rbbcash$([guid]::NewGuid().ToString('N').Substring(0,16))"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) $projectId
$supabaseDir = Join-Path $testRoot 'supabase'
$migrationSource = Join-Path $repoRoot 'supabase\migrations'
$configSource = Join-Path $repoRoot 'supabase\config.toml'
$stackMayExist = $false
$viteProcess = $null
$exitCode = 1

function Invoke-Cli([string[]]$Arguments, [string]$FailureMessage, [switch]$IncludeFailureDetails) {
  $output = @(& npx.cmd supabase --workdir $testRoot @Arguments 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) {
    if ($IncludeFailureDetails) {
      $details = ($output | Select-Object -Last 6) -join ' '
      throw "$FailureMessage $details"
    }
    throw $FailureMessage
  }
  return $output
}

# Free only if it can be bound on loopback (a dev server listening there) and on every address (how Docker publishes ports).
function Test-PortAvailable([int]$Port) {
  foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::Any)) {
    $listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
    try { $listener.Start() } catch { return $false } finally { $listener.Stop() }
  }
  return $true
}

try {
  $dockerOutput = @(& docker info --format '{{.ServerVersion}}' 2>&1 | ForEach-Object { $_.ToString() })
  $dockerExitCode = $LASTEXITCODE
  if ($dockerExitCode -ne 0) {
    throw "Docker Desktop's Linux engine is unavailable (docker info exited $dockerExitCode). Start the engine and retry; no disposable test workspace or stack was created."
  }
  $dockerVersion = ($dockerOutput -join ' ').Trim()
  if ([string]::IsNullOrWhiteSpace($dockerVersion)) {
    throw 'Docker info returned no server version; no disposable test workspace or stack was created.'
  }
  Write-Output "Docker Desktop Linux engine is available (server version $dockerVersion)."

  New-Item -ItemType Directory -Path $supabaseDir -Force | Out-Null
  Copy-Item -LiteralPath $migrationSource -Destination $supabaseDir -Recurse

  $config = Get-Content -LiteralPath $configSource -Raw
  $portMatches = [regex]::Matches($config, '(?m)^(\s*port\s*=\s*)(\d+)')
  $ports = @($portMatches | ForEach-Object { [int]$_.Groups[2].Value } | Sort-Object -Unique)
  $offset = $null
  foreach ($candidate in (10000..20000 | Get-Random -Count 600)) {
    $candidatePorts = @($ports | ForEach-Object { $_ + $candidate })
    if (($candidatePorts | Where-Object { $_ -gt 65535 -or -not (Test-PortAvailable $_) }).Count -eq 0) {
      $offset = $candidate
      break
    }
  }
  if ($null -eq $offset) { throw 'Could not find an unused local port range for the disposable test stack.' }

  $config = [regex]::Replace($config, '(?m)^(\s*port\s*=\s*)(\d+)', {
    param($match)
    "$($match.Groups[1].Value)$([int]$match.Groups[2].Value + $offset)"
  })
  $config = [regex]::Replace($config, '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$projectId`"")
  Set-Content -LiteralPath (Join-Path $supabaseDir 'config.toml') -Value $config -Encoding utf8

  $env:CASH_TEST_PROJECT_ID = $projectId
  $env:CASH_TEST_OWNER_EMAIL = "owner-$projectId@example.invalid"
  $env:CASH_TEST_CLERK_EMAIL = "clerk-$projectId@example.invalid"
  $env:CASH_TEST_OTHER_EMAIL = "other-$projectId@example.invalid"
  $env:CASH_TEST_PASSWORD = "$([guid]::NewGuid().ToString('N'))Aa1!"
  $env:CASH_TEST_PROPERTY_ID = [guid]::NewGuid().ToString()
  $env:CASH_TEST_TENANT_ID = [guid]::NewGuid().ToString()
  $env:CASH_TEST_BUILDING_ID = [guid]::NewGuid().ToString()
  $env:CASH_TEST_UNIT_ID = [guid]::NewGuid().ToString()
  $env:CASH_TEST_FREE_UNIT_ID = [guid]::NewGuid().ToString()
  $env:CASH_TEST_AUDIT_CASH_ID = [guid]::NewGuid().ToString()
  $env:CASH_TEST_AUDIT_TRIGGER = "fail_cash_audit_$projectId"
  $env:CASH_TEST_AUDIT_CHECK_ID = [guid]::NewGuid().ToString()

  Write-Output 'Starting isolated local Supabase stack...'
  $stackMayExist = $true
  $null = Invoke-Cli @('start', '--exclude', 'realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor') 'Disposable Supabase startup failed.' -IncludeFailureDetails

  Write-Output 'Applying reviewed migrations to the disposable database...'
  $null = Invoke-Cli @('db', 'push', '--local', '--yes') 'Disposable database migrations failed.'

  $statusOutput = Invoke-Cli @('status', '--output', 'json') 'Could not inspect the disposable local stack.'
  $statusText = ($statusOutput | ForEach-Object { $_.ToString() }) -join "`n"
  $jsonStart = $statusText.IndexOf('{')
  $jsonEnd = $statusText.LastIndexOf('}')
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'Disposable Supabase returned no status data.' }
  $local = $statusText.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
  if ($local.API_URL -notmatch '^http://127\.0\.0\.1:\d+$') { throw 'Refusing a non-local cash API test target.' }

  Write-Output "Disposable API at $($local.API_URL)"
  $env:CASH_TEST_API_URL = $local.API_URL
  $env:CASH_TEST_ANON_KEY = $local.ANON_KEY
  $env:CASH_TEST_SERVICE_KEY = $local.SERVICE_ROLE_KEY
  $userOutput = @(& node (Join-Path $PSScriptRoot 'test-cash-supabase-api.mjs') create-users 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -ne 0) {
    $safeError = $userOutput | Where-Object { $_ -match 'Cash API integration error' } | Select-Object -First 1
    if ($safeError) { throw "Disposable Auth fixture setup failed: $safeError" }
    throw 'Could not create fictional users in the disposable Auth service.'
  }
  $users = ($userOutput -join "`n") | ConvertFrom-Json
  $env:CASH_TEST_CLERK_ID = $users.clerk

  $fixtureStatements = @(
    "insert into public.properties(id,name) values ('$($env:CASH_TEST_PROPERTY_ID)','Disposable cash API test property')",
    "insert into public.tenants(id,property_id,display_name,kind) values ('$($env:CASH_TEST_TENANT_ID)','$($env:CASH_TEST_PROPERTY_ID)','Sample API test renter','individual')",
    "insert into public.buildings(id,property_id,label) values ('$($env:CASH_TEST_BUILDING_ID)','$($env:CASH_TEST_PROPERTY_ID)','Test building')",
    "insert into public.units(id,property_id,building_id,label) values ('$($env:CASH_TEST_UNIT_ID)','$($env:CASH_TEST_PROPERTY_ID)','$($env:CASH_TEST_BUILDING_ID)','Test room'),('$($env:CASH_TEST_FREE_UNIT_ID)','$($env:CASH_TEST_PROPERTY_ID)','$($env:CASH_TEST_BUILDING_ID)','Test free room')",
    "insert into public.staff_memberships(property_id,user_id,role) values ('$($env:CASH_TEST_PROPERTY_ID)','$($users.owner)','owner'),('$($env:CASH_TEST_PROPERTY_ID)','$($users.clerk)','clerk')",
    @"
create function public.$($env:CASH_TEST_AUDIT_TRIGGER)() returns trigger language plpgsql as `$`$ begin
 if (new.action='rent_cash_confirmed' and new.target_id='$($env:CASH_TEST_AUDIT_CASH_ID)'::uuid)
    or (new.action='rent_check_cleared' and new.target_id='$($env:CASH_TEST_AUDIT_CHECK_ID)'::uuid) then
  raise exception 'Simulated disposable cash audit failure';
 end if;
 return new;
end `$`$
"@,
    "create trigger $($env:CASH_TEST_AUDIT_TRIGGER) before insert on public.audit_events for each row execute function public.$($env:CASH_TEST_AUDIT_TRIGGER)()"
  )
  for ($index = 0; $index -lt $fixtureStatements.Count; $index++) {
    $fixturePath = Join-Path $testRoot "cash-fixture-$index.sql"
    Set-Content -LiteralPath $fixturePath -Value $fixtureStatements[$index] -Encoding utf8
    $null = Invoke-Cli @('db', 'query', '--local', '--file', $fixturePath) 'Could not create disposable fictional cash-test fixtures.' -IncludeFailureDetails
  }

  $testServiceKey = $env:CASH_TEST_SERVICE_KEY
  $testPassword = $env:CASH_TEST_PASSWORD
  Remove-Item Env:CASH_TEST_SERVICE_KEY, Env:CASH_TEST_PASSWORD -ErrorAction SilentlyContinue
  $uiPort = 5173
  while (-not (Test-PortAvailable $uiPort)) { $uiPort++ }
  $env:VITE_SUPABASE_URL = $local.API_URL
  $env:VITE_SUPABASE_ANON_KEY = $local.ANON_KEY
  $env:VITE_SUPABASE_TARGET = 'isolated-cash-test'
  $env:CASH_TEST_UI_URL = "http://127.0.0.1:$uiPort"
  $vitePath = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
  $viteStdout = Join-Path $testRoot 'vite.stdout.log'
  $viteStderr = Join-Path $testRoot 'vite.stderr.log'
  $viteArguments = "`"$vitePath`" --host 127.0.0.1 --port $uiPort --strictPort --mode isolated-cash-test"
  $viteProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList $viteArguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $viteStdout -RedirectStandardError $viteStderr
  $uiReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($viteProcess.HasExited) { throw 'Isolated UI server exited before becoming ready.' }
    try {
      $null = Invoke-WebRequest -Uri $env:CASH_TEST_UI_URL -UseBasicParsing -TimeoutSec 2
      $uiReady = $true
      break
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $uiReady) { throw 'Isolated UI server did not become ready.' }

  $env:CASH_TEST_SERVICE_KEY = $testServiceKey
  $env:CASH_TEST_PASSWORD = $testPassword
  Write-Output 'Checking isolated Auth, MFA, RLS, retries, audit rollback and independent-session concurrency...'
  & node (Join-Path $PSScriptRoot 'test-cash-supabase-api.mjs') verify
  if ($LASTEXITCODE -ne 0) { throw 'One or more disposable cash API assertions failed.' }
  $exitCode = 0
}
catch {
  Write-Error $_.Exception.Message
}
finally {
  if ($viteProcess -and -not $viteProcess.HasExited) {
    Stop-Process -Id $viteProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:CASH_TEST_API_URL, Env:CASH_TEST_ANON_KEY, Env:CASH_TEST_SERVICE_KEY, Env:CASH_TEST_PASSWORD, Env:CASH_TEST_CLERK_ID, Env:CASH_TEST_AUDIT_CHECK_ID, Env:CASH_TEST_UI_URL -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_SUPABASE_URL, Env:VITE_SUPABASE_ANON_KEY, Env:VITE_SUPABASE_TARGET -ErrorAction SilentlyContinue
  if ($stackMayExist -and (Test-Path -LiteralPath (Join-Path $supabaseDir 'config.toml'))) {
    $null = & npx.cmd supabase --workdir $testRoot stop --project-id $projectId --no-backup 2>&1 | ForEach-Object { $_.ToString() }
  }
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}

exit $exitCode
