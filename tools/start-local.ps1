$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$dockerDirectory = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
if (Test-Path -LiteralPath $dockerDirectory) { $env:PATH = $dockerDirectory + ';' + $env:PATH }
$localStatus = & '.\node_modules\.bin\supabase.cmd' status -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $localStatus.API_URL -ne 'http://127.0.0.1:54321') {
  throw 'Start the local Supabase clone first. This launcher refuses any non-local database.'
}
$env:NEXT_PUBLIC_SUPABASE_URL = $localStatus.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localStatus.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY
$env:REBOOT_NEXT_DIST_DIR = '.next-local'
# Shell variables override .env.local. Never write or print local service credentials.
& node '.\node_modules\next\dist\bin\next' dev --hostname 127.0.0.1 --port 3015
exit $LASTEXITCODE
