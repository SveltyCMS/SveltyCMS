#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Run the same commands as GitHub Actions CI locally to reproduce failures.
.DESCRIPTION
  Runs: install, sync, paraglide, lint, check, build, and unit tests.
  Output is saved to scripts/ci-local-output.log
#>

$ErrorActionPreference = "Continue"
$logPath = Join-Path $PSScriptRoot "ci-local-output.log"

function Write-Step {
    param([string]$Msg)
    $line = "=" * 60
    Add-Content -Path $logPath -Value "`n$line`n$Msg`n$line"
    Write-Host "`n$line`n$Msg`n$line" -ForegroundColor Cyan
}

function Run-Cmd {
    param([string]$Cmd, [string]$Name)
    Write-Step "RUNNING: $Name"
    Add-Content -Path $logPath -Value "Command: $Cmd"
    $start = Get-Date
    try {
        Invoke-Expression $Cmd 2>&1 | Tee-Object -FilePath $logPath -Append
        if ($LASTEXITCODE -ne 0) {
            Add-Content -Path $logPath -Value "`n>>> FAILED with exit code $LASTEXITCODE <<<"
            Write-Host ">>> FAILED <<<" -ForegroundColor Red
            return $false
        }
    } catch {
        Add-Content -Path $logPath -Value "`n>>> ERROR: $_ <<<"
        Write-Host ">>> ERROR: $_ <<<" -ForegroundColor Red
        return $false
    }
    $elapsed = (Get-Date) - $start
    Add-Content -Path $logPath -Value "`nCompleted in $($elapsed.TotalSeconds)s"
    return $true
}

# Start fresh log
"" | Out-File -FilePath $logPath

Write-Host "CI Local Reproducer - Output: $logPath" -ForegroundColor Green

$steps = @(
    @{ Cmd = "bun install --frozen-lockfile"; Name = "1. Install dependencies" },
    @{ Cmd = "bun x svelte-kit sync"; Name = "2. SvelteKit sync" },
    @{ Cmd = "bun run paraglide"; Name = "3. Paraglide compile" },
    @{ Cmd = "bun run lint"; Name = "4. ESLint" },
    @{ Cmd = "bun run check"; Name = "5. Type check (svelte-check)" },
    @{ Cmd = "bun run build"; Name = "6. Production build" },
    @{ Cmd = "bun test --preload ./tests/unit/setup.ts --max-concurrency 1 tests/unit/services tests/unit/utils tests/unit/stores tests/unit/widgets tests/unit/*.test.ts"; Name = "7. Unit tests" }
)

$failed = $false
foreach ($step in $steps) {
    if (-not (Run-Cmd -Cmd $step.Cmd -Name $step.Name)) {
        $failed = $true
        Write-Host "`nStopping at first failure. Full log: $logPath" -ForegroundColor Yellow
        break
    }
}

if ($failed) {
    Write-Host "`nCI REPRODUCTION: FAILED - See $logPath" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nCI REPRODUCTION: ALL PASSED" -ForegroundColor Green
    exit 0
}
