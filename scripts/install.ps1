param(
  [string]$RepoUrl = $(if ($env:TETHERMARK_REPO_URL) { $env:TETHERMARK_REPO_URL } else { "https://github.com/jjdomain/tethermark.git" }),
  [string]$InstallDir = $(if ($env:TETHERMARK_INSTALL_DIR) { $env:TETHERMARK_INSTALL_DIR } else { Join-Path ([Environment]::GetFolderPath("UserProfile")) ".tethermark\tethermark" }),
  [string]$Ref = $(if ($env:TETHERMARK_VERSION) { $env:TETHERMARK_VERSION } else { "main" }),
  [switch]$Update,
  [switch]$NoOnboard,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Format-Step {
  param([string]$FilePath, [string[]]$Arguments = @())
  $formatted = @($FilePath) + ($Arguments | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
  })
  return ($formatted -join " ")
}

function Invoke-Step {
  param([string]$FilePath, [string[]]$Arguments = @(), [string]$WorkingDirectory = $PWD.Path)
  Write-Host ("+ " + (Format-Step $FilePath $Arguments))
  if (-not $DryRun) {
    Push-Location -LiteralPath $WorkingDirectory
    try {
      & $FilePath @Arguments
      if ($LASTEXITCODE -ne 0) {
        throw "$FilePath exited with code $LASTEXITCODE"
      }
    } finally {
      Pop-Location
    }
  }
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name. Install $Name, then rerun this installer."
  }
}

Require-Command git
Require-Command node
Require-Command npm

$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$userProfile = [IO.Path]::GetFullPath([Environment]::GetFolderPath("UserProfile")).TrimEnd('\', '/')
$installRoot = [IO.Path]::GetPathRoot($InstallDir).TrimEnd('\', '/')
if ([string]::IsNullOrWhiteSpace($Ref) -or $Ref.StartsWith("-")) {
  throw "Ref must be non-empty and must not begin with '-'."
}
if ($InstallDir.TrimEnd('\', '/') -eq $installRoot -or $InstallDir.TrimEnd('\', '/') -eq $userProfile) {
  throw "Refusing unsafe install directory: $InstallDir"
}

$mode = if ($Update) { "update" } else { "install" }
Write-Host "Tethermark $mode"
Write-Host "Install dir: $InstallDir"
Write-Host "Repo: $RepoUrl"
Write-Host "Ref: $Ref"

if (-not $Update) {
  if (Test-Path -LiteralPath $InstallDir) {
    throw "Install directory already exists. Use -Update for an existing Tethermark checkout: $InstallDir"
  }
  $parent = Split-Path -Parent $InstallDir
  if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  } else {
    Write-Host ("+ New-Item -ItemType Directory -Force -Path `"$parent`"")
  }
  Invoke-Step git @("clone", "--filter=blob:none", "--no-checkout", "--", $RepoUrl, $InstallDir)
} else {
  if (-not (Test-Path -LiteralPath (Join-Path $InstallDir ".git")) -or -not (Test-Path -LiteralPath (Join-Path $InstallDir "package.json"))) {
    throw "Update requires an existing Tethermark git checkout: $InstallDir"
  }
  $dirty = & git -C $InstallDir status --porcelain
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect checkout state: $InstallDir" }
  if ($dirty) {
    throw "Refusing to update a checkout with uncommitted or untracked files: $InstallDir"
  }
}

Invoke-Step git @("-C", $InstallDir, "fetch", "--depth", "1", "origin", $Ref)
Invoke-Step git @("-C", $InstallDir, "checkout", "--detach", "--force", "FETCH_HEAD")

$firstRunArgs = @((Join-Path $InstallDir "scripts\first-run.mjs"))
if ($NoOnboard) { $firstRunArgs += "--no-onboard" }
Invoke-Step node $firstRunArgs $InstallDir

if (-not $DryRun) {
  $commitSha = (& git -C $InstallDir rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Unable to resolve installed commit." }
  Invoke-Step node @(
    (Join-Path $InstallDir "scripts\write-install-marker.mjs"),
    "--install-dir", $InstallDir,
    "--repo", $RepoUrl,
    "--ref", $Ref,
    "--commit", $commitSha
  ) $InstallDir
}

Write-Host "Done. Start Tethermark with:"
Write-Host "  cd `"$InstallDir`"; npm run oss"
Write-Host "Update this installation with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Update -InstallDir `"$InstallDir`" -Ref `"$Ref`""
