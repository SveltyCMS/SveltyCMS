<#
.SYNOPSIS
  Run a SveltyCMS E2E project inside a Podman container that mirrors the
  GitHub Actions CI environment (ubuntu-latest, Bun 1.3.14, Node 24).

.DESCRIPTION
  This is the "simulate CI on Linux" runner. Use it to verify env-only
  failures (e.g. visual-regression viewport/DPI) that don't reproduce on
  the Windows dev machine, OR to confirm a project passes on the exact OS
  CI uses before opening a PR.

  It does NOT use the Windows-side node_modules or build/ — those are
  Windows-built binaries. Instead it uses Podman named volumes so the
  container keeps its own Linux-native node_modules, build/, and Playwright
  browser cache. Re-runs are fast (no reinstall/rebuild unless forced).

  Usage:
    .\scripts\e2e-podman.ps1 -Project users
    .\scripts\e2e-podman.ps1 -Project visual-regression
    .\scripts\e2e-podman.ps1 -Project builder -Grep "Invite User"
    .\scripts\e2e-podman.ps1 -Project users -Rebuild        # force bun install + build
    .\scripts\e2e-podman.ps1 -Project users -ReinstallBrowsers
    .\scripts\e2e-podman.ps1 -Project users -KeepContainer   # don't --rm (debug)

  First run: ~10-15 min (image build + bun install + build + pw install).
  Subsequent runs of the same project: ~1-3 min (server boot + test run).

.PARAMETER Project
  Required. Playwright project name, e.g. "users", "visual-regression", "builder".

.PARAMETER Grep
  Optional. Passed as `--grep "<Grep>"` to Playwright (run a single test).

.PARAMETER Shard
  Optional. e.g. "1/2". Passed as `--shard <Shard>`.

.PARAMETER Rebuild
  Force `bun install` + `bun run build` inside the container (ignores cache).

.PARAMETER ReinstallBrowsers
  Force `bun x playwright install --with-deps chromium` inside the container.

.PARAMETER KeepContainer
  Don't pass --rm (useful for `podman exec` debugging afterwards).

.EXAMPLE
  .\scripts\e2e-podman.ps1 -Project visual-regression
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Project,

  [string]$Grep = "",
  [string]$Shard = "",
  [switch]$Rebuild,
  [switch]$ReinstallBrowsers,
  [switch]$KeepContainer,
  [switch]$UpdateSnapshots
)

$ErrorActionPreference = "Stop"

# ── Resolve repo root (this script lives in <repo>/scripts/) ────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
Set-Location $RepoRoot

Write-Host "▶ Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "▶ Project: $Project" -ForegroundColor Cyan

# ── Ensure podman is available and the WSL machine is running ──────────────
$podman = (Get-Command podman -ErrorAction SilentlyContinue)
if (-not $podman) {
  Write-Error "podman not found on PATH. Install Podman Desktop or podman CLI first."
  exit 1
}
& podman machine list 2>&1 | Select-String -Pattern "Currently running" | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "▶ Starting podman machine..." -ForegroundColor Yellow
  & podman machine start
  if ($LASTEXITCODE -ne 0) { Write-Error "podman machine start failed"; exit 1 }
}

# ── Build the image if missing (or if --Rebuild) ───────────────────────────
$ImageName = "svelty-e2e:latest"
$existingImages = & podman images --format "{{.Repository}}:{{.Tag}}" 2>$null
$hasImage = $existingImages | Select-String -SimpleMatch -Pattern $ImageName -Quiet
if (-not $hasImage) {
  Write-Host "▶ Building image $ImageName (first run; ~5-10 min)..." -ForegroundColor Yellow
  & podman build -t $ImageName -f Containerfile.e2e .
  if ($LASTEXITCODE -ne 0) { Write-Error "podman build failed"; exit 1 }
} else {
  Write-Host "▶ Image $ImageName present." -ForegroundColor Green
}

# ── Ensure tests/e2e/.auth/test-secret.txt exists (mirrors CI line 71-72) ──
$authDir = Join-Path $RepoRoot "tests\e2e\.auth"
if (-not (Test-Path $authDir)) { New-Item -ItemType Directory -Path $authDir -Force | Out-Null }
$secretFile = Join-Path $authDir "test-secret.txt"
if (-not (Test-Path $secretFile)) {
  $secret = "SVELTYCMS_E2E_MASTER_SECRET_$([int][double]::Parse((Get-Date -UFormat %s)))"
  Set-Content -Path $secretFile -Value $secret -NoNewline
  Write-Host "▶ Generated test-secret.txt" -ForegroundColor Yellow
}
$TestApiSecret = (Get-Content $secretFile -Raw).Trim()

# ── Build the env var list (mirrors ci.yml `e2e` job, lines 504-519) ──────
# These are passed to the container and read by the entrypoint + server.
$EnvVars = @(
  "DB_TYPE=sqlite",
  "DB_HOST=127.0.0.1",
  "DB_NAME=e2e_auth_test",
  "DB_USER=",
  "DB_PASSWORD=",
  "PASSWORD_MIN_LENGTH=8",
  "TEST_MODE=true",
  "SKIP_TEST_CLEANUP=false",
  "ADMIN_PASSWORD=Password123!",
  "JWT_SECRET_KEY=Auth-Setup-JWT-Secret-Key-2026-32ch",
  "ENCRYPTION_KEY=Auth-Setup-Encryption-Key-2026-32ch",
  "TEST_API_SECRET=$TestApiSecret",
  "HOST=127.0.0.1",
  "PORT=4173",
  "SKIP_E2E_DEPS=true",
  # CRITICAL: CI=true makes playwright.config.ts disable its webServer block
  # (line ~246) so the entrypoint can start `node build/index.js` manually,
  # exactly like CI line 526. Also enables retries=1, workers=4, forbidOnly.
  "CI=true",
  "PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173"
)

# ── Build the run command ───────────────────────────────────────────────────
$extraArgs = ""
if ($Grep)    { $extraArgs += " --grep `"$Grep`"" }
if ($UpdateSnapshots) { $extraArgs += " --update-snapshots" }
$skipBuild = if ($Rebuild) { "0" } else { "1" }
$skipPw    = if ($ReinstallBrowsers) { "0" } else { "1" }

$entrypointEnv = @(
  "PROJECT=$Project",
  "SHARD=$Shard",
  "EXTRA_ARGS=$extraArgs",
  "SKIP_BUILD=$skipBuild",
  "SKIP_PW_INSTALL=$skipPw"
)

# ── Named volumes for Linux-native caches (NOT shared with Windows) ──────
# node_modules from Windows are win-x64 binaries — wrong for Linux. Use a named
# volume so the container keeps its own Linux node_modules and re-runs are fast.
# Playwright browser cache is also Linux-only.
#
# NOTE: we do NOT use a named volume for /app/build. The svelte-adapter-uws
# adapter calls `rimraf('build')` at the start of every build, and you can't
# `rm` a named-volume mountpoint (EBUSY). Instead, /app/build is a regular
# subdirectory on the bind mount — `rm -rf build` works fine there. Each
# environment (Windows / container) rebuilds before running its own tests,
# so there's no cross-platform artifact contamination in practice.
$VolumeArgs = @(
  "-v", "${RepoRoot}:/app",
  "-v", "svelty-e2e-node-modules:/app/node_modules",
  "-v", "svelty-e2e-pw-cache:/home/pwuser/.cache/ms-playwright",
  "-v", "svelty-e2e-bun-cache:/home/pwuser/.bun"
)

$RunArgs = @("run", "--rm", "--name", "svelty-e2e-$Project-$([int][double]::Parse((Get-Date -UFormat %s)))")
if ($KeepContainer) { $RunArgs = @("run", "--name", "svelty-e2e-$Project-debug") }
foreach ($e in $EnvVars)       { $RunArgs += @("-e", $e) }
foreach ($e in $entrypointEnv) { $RunArgs += @("-e", $e) }
$RunArgs += $VolumeArgs
# Run as the pwuser (UID 1000) the image already switched to — explicit so
# bind-mount artifacts get written as 1000 (matches WSL host UID).
$RunArgs += @("--user", "1000:1000")
$RunArgs += @($ImageName, "bash", "-lc", "/app/scripts/e2e-ci-entrypoint.sh")

Write-Host "▶ Running: podman $($RunArgs -join ' ')" -ForegroundColor DarkGray
& podman @RunArgs
$exit = $LASTEXITCODE

if ($exit -eq 0) {
  Write-Host "PASS: E2E project '$Project' PASSED in CI-parity container." -ForegroundColor Green
} else {
  Write-Host "FAIL: E2E project '$Project' FAILED (exit $exit) in CI-parity container." -ForegroundColor Red
}

exit $exit
