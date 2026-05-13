param(
  [string]$RepoUrl = $(if ($env:TETHERMARK_REPO_URL) { $env:TETHERMARK_REPO_URL } else { "https://github.com/jjdomain/tethermark.git" }),
  [string]$InstallDir = $(if ($env:TETHERMARK_INSTALL_DIR) { $env:TETHERMARK_INSTALL_DIR } else { Join-Path $HOME ".tethermark\tethermark" }),
  [switch]$NoOnboard,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param([string]$FilePath, [string[]]$Arguments = @(), [string]$WorkingDirectory = $PWD.Path)
  Write-Host ("+ " + $FilePath + " " + ($Arguments -join " "))
  if (-not $DryRun) {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "$FilePath exited with code $($process.ExitCode)"
    }
  }
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name. Install $Name, then rerun this installer."
  }
}

Write-Host "Tethermark installer"
Write-Host "Install dir: $InstallDir"
Write-Host "Repo: $RepoUrl"

Require-Command git
Require-Command node
Require-Command npm

if (-not (Test-Path (Join-Path $InstallDir ".git"))) {
  $parent = Split-Path -Parent $InstallDir
  if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Invoke-Step git @("clone", $RepoUrl, $InstallDir)
} else {
  Invoke-Step git @("-C", $InstallDir, "pull", "--ff-only")
}

Invoke-Step npm @("install") $InstallDir

if (-not $NoOnboard) {
  Invoke-Step npm @("run", "scan", "--", "onboard") $InstallDir
}

Write-Host "Done. Start Tethermark with:"
Write-Host "  cd `"$InstallDir`"; npm run oss"
