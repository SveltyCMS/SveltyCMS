# Run integration tests for all four CMS adapters (Docker DBs must be up).
# Usage: powershell -File scripts/run-integration-matrix.ps1
$ErrorActionPreference = "Continue"
$dbs = @("sqlite", "mongodb", "mariadb", "postgresql")
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$results = New-Object System.Collections.Generic.List[object]
$overall = 0

Write-Host ""
Write-Host "=== Building integration artifact (COMPILE_ALL_ADAPTERS) ===" -ForegroundColor Cyan
$env:COMPILE_ALL_ADAPTERS = "true"
$env:TEST_MODE = "true"
& bun run build 2>&1 | Tee-Object -FilePath matrix-build.log | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed - see matrix-build.log" -ForegroundColor Red
  exit 1
}
Write-Host "Build OK" -ForegroundColor Green

foreach ($db in $dbs) {
  Write-Host ""
  Write-Host "=== Integration matrix: $db ===" -ForegroundColor Cyan
  $log = "integration-$db.log"
  if (Test-Path $log) { Remove-Item $log -Force }

  $env:DB_TYPE = $db
  & bun run scripts/run-integration-tests.ts --no-build --db=$db 2>&1 | Tee-Object -FilePath $log | Out-Null
  $code = $LASTEXITCODE
  if ($code -ne 0) { $overall = 1 }

  $passLines = @(Select-String -Path $log -SimpleMatch "Passed (" -ErrorAction SilentlyContinue)
  $failLines = @(Select-String -Path $log -Pattern '^Failed$' -ErrorAction SilentlyContinue)
  $passed = $passLines.Count
  $failed = $failLines.Count
  $status = if ($code -eq 0) { "PASS" } else { "FAIL" }

  $results.Add([pscustomobject]@{
    DB = $db
    Status = $status
    PassedFiles = $passed
    FailedFiles = $failed
    Exit = $code
  }) | Out-Null

  $color = if ($code -eq 0) { "Green" } else { "Red" }
  Write-Host ("  {0} => {1} (file Pass={2} Fail={3} exit={4})" -f $db, $status, $passed, $failed, $code) -ForegroundColor $color
}

Write-Host ""
Write-Host "========== 4-DB INTEGRATION MATRIX ==========" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$results | ConvertTo-Json | Set-Content -Path matrix-results.json -Encoding utf8
exit $overall
