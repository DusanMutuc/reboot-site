$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory

$dockerDirectory = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
if (Test-Path -LiteralPath $dockerDirectory) { $env:PATH = $dockerDirectory + ';' + $env:PATH }
$supabaseCommand = Join-Path $projectDirectory 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $supabaseCommand)) {
  throw 'Install dependencies with npm.cmd ci before starting the local app.'
}

# Capture local credentials in memory; never write or print them.
$localStatusJson = & $supabaseCommand status --output json
if ($LASTEXITCODE -ne 0) {
  throw 'Start the local Supabase stack with npm.cmd run db:start first.'
}
$localStatus = $localStatusJson | ConvertFrom-Json
if ($localStatus.API_URL -ne 'http://127.0.0.1:54321') {
  throw 'This launcher requires the local Supabase API at http://127.0.0.1:54321.'
}
if (-not $localStatus.ANON_KEY -or -not $localStatus.SERVICE_ROLE_KEY) {
  throw 'The local Supabase stack did not return its required API keys.'
}

# Shell variables override .env.local for this app process.
$env:NEXT_PUBLIC_SUPABASE_URL = $localStatus.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localStatus.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY
$env:REBOOT_NEXT_DIST_DIR = '.next-local'
& node '.\node_modules\next\dist\bin\next' dev --hostname 127.0.0.1 --port 3015
exit $LASTEXITCODE
