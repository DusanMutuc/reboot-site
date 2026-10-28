param(
  [ValidateSet('apply', 'start', 'test')]
  [string]$Mode = 'start',
  [switch]$FeatureOff
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$supabaseCommand = Join-Path $projectDirectory 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $supabaseCommand)) { throw 'Run npm.cmd ci first.' }

# Read only the already-running local stack. Never load .env.local or --linked.
$statusJson = & $supabaseCommand status --output json
if ($LASTEXITCODE -ne 0) { throw 'Start your isolated local Supabase database first.' }
$localStatus = $statusJson | ConvertFrom-Json
if ($localStatus.API_URL -ne 'http://127.0.0.1:54321') {
  throw 'Refusing any Supabase API other than http://127.0.0.1:54321.'
}
if (-not $localStatus.ANON_KEY -or -not $localStatus.SERVICE_ROLE_KEY) {
  throw 'Local Supabase credentials are missing.'
}

if ($Mode -eq 'apply') {
  # Apply only this feature's migration to an existing local schema; never reset.
  & $supabaseCommand db query --local --file 'supabase/migrations/20261028140114_verified_backup_email.sql'
  if ($LASTEXITCODE -ne 0) { throw 'Local migration failed. Inspect the error before retrying.' }
  Write-Host 'Backup-email migration applied locally. No remote migration history was changed.'
  exit 0
}

# Non-empty shell values override any real settings in .env.local for this process.
$env:NEXT_PUBLIC_SUPABASE_URL = $localStatus.API_URL
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localStatus.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY
$env:REBOOT_NEXT_DIST_DIR = '.next-backup-email-local'
$env:BACKUP_EMAIL_ENABLED = if ($FeatureOff) { 'false' } else { 'true' }
$env:BACKUP_EMAIL_ORIGIN = 'http://127.0.0.1:3017'
$env:BACKUP_EMAIL_SECRET = 'local-backup-email-tests-only-never-use-on-a-live-server'
$env:BACKUP_EMAIL_DELIVERY_MODE = 'local'
$env:BACKUP_EMAIL_LOCAL_SMTP_HOST = '127.0.0.1'
$env:BACKUP_EMAIL_LOCAL_SMTP_PORT = '54325'
$env:BACKUP_EMAIL_LOCAL_FROM_EMAIL = 'accounts@reboot.test'
$env:SUPPORT_TO_EMAIL = 'disabled'
$env:SUPPORT_FROM_EMAIL = 'disabled'
$env:SUPPORT_SMTP_HOST = '127.0.0.1'
$env:SUPPORT_SMTP_PORT = '0'
$env:SUPPORT_SMTP_SECURE = 'false'
$env:SUPPORT_SMTP_USER = 'disabled'
$env:SUPPORT_SMTP_PASSWORD = 'disabled'
$env:SUPPORT_RATE_LIMIT_SECRET = 'disabled'
$env:RESEND_API_KEY = 'disabled'
$env:GHL_API_BASE = 'http://127.0.0.1:54329'
$env:GHL_PRIVATE_TOKEN = 'disabled'
$env:GHL_LOCATION_ID = 'disabled'
$env:GHL_ASSISTANT_WEBHOOK_SECRET = 'disabled'
$env:TRANSISTOR_API_KEY = 'disabled'
$env:CRON_SECRET = 'disabled'

if ($Mode -eq 'test') {
  $env:BACKUP_EMAIL_LOCAL_HTTP_TEST = '1'
  $env:BACKUP_EMAIL_LOCAL_APP_URL = $env:BACKUP_EMAIL_ORIGIN
  $env:BACKUP_EMAIL_LOCAL_MAILPIT_URL = 'http://127.0.0.1:54324'
  $env:BACKUP_EMAIL_LOCAL_EXPECT_DISABLED = if ($FeatureOff) { '1' } else { '0' }
  & node --test 'tests/backupEmail.local.test.mjs'
} else {
  Write-Host "Local app: http://127.0.0.1:3017 | Captured email: http://127.0.0.1:54324 | Backup email enabled: $env:BACKUP_EMAIL_ENABLED"
  & node '.\node_modules\next\dist\bin\next' dev --hostname 127.0.0.1 --port 3017
}
exit $LASTEXITCODE
