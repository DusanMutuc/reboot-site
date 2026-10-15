$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$previewEnvironment = Join-Path $projectDirectory '.env.coach-preview'
if (-not (Test-Path -LiteralPath $previewEnvironment)) {
  throw 'Create local synthetic fixtures first: node tools/coach-preview.mjs --seed --supabase-bin <path-to-supabase>'
}

# Only load the generated local preview fields; never inherit the hosted GHL connection.
$allowedNames = @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GHL_API_BASE', 'GHL_PRIVATE_TOKEN', 'GHL_VERSION', 'GHL_LOCATION_ID')
$previewValues = @{}
foreach ($line in Get-Content -LiteralPath $previewEnvironment) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$' -and $allowedNames -contains $Matches[1]) {
    $previewValues[$Matches[1]] = $Matches[2]
  }
}
if ($previewValues.NEXT_PUBLIC_SUPABASE_URL -ne 'http://127.0.0.1:54321' -or $previewValues.GHL_API_BASE -ne 'http://127.0.0.1:54329') {
  throw 'Coach preview requires the local Supabase and local synthetic GHL server.'
}
foreach ($name in $allowedNames) {
  if (-not $previewValues[$name]) { throw "The local preview configuration is missing $name." }
  [Environment]::SetEnvironmentVariable($name, $previewValues[$name], 'Process')
}
$env:REBOOT_NEXT_DIST_DIR = '.next-local'
$stubReady = $false
try {
  $stubHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:54329/health' -TimeoutSec 2
  $stubReady = $stubHealth.ok -and $stubHealth.synthetic
} catch { }
if (-not $stubReady) {
  $nodeExecutable = (Get-Command node).Source
  Start-Process -FilePath $nodeExecutable -ArgumentList 'tools/coach-preview.mjs', '--serve' -WorkingDirectory $projectDirectory -WindowStyle Hidden | Out-Null
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $stubHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:54329/health' -TimeoutSec 2
      if ($stubHealth.ok -and $stubHealth.synthetic) { $stubReady = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
}
if (-not $stubReady) { throw 'The local synthetic GHL server could not start on port 54329.' }
Write-Host 'Coach preview: http://127.0.0.1:3015/coach (synthetic local members and meetings)'
& node '.\node_modules\next\dist\bin\next' dev --hostname 127.0.0.1 --port 3015
exit $LASTEXITCODE
