param(
  [string]$InstallDir = $(if ($env:TETHERMARK_INSTALL_DIR) { $env:TETHERMARK_INSTALL_DIR } else { Join-Path ([Environment]::GetFolderPath("UserProfile")) ".tethermark\tethermark" }),
  [string]$BackupDir,
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$PurgeData
)

$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$installParent = Split-Path -Parent $InstallDir
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
  $BackupDir = Join-Path $installParent "uninstall-backups"
}
$BackupDir = [IO.Path]::GetFullPath($BackupDir)
$userProfile = [IO.Path]::GetFullPath([Environment]::GetFolderPath("UserProfile")).TrimEnd('\', '/')
$installRoot = [IO.Path]::GetPathRoot($InstallDir).TrimEnd('\', '/')
$normalizedInstall = $InstallDir.TrimEnd('\', '/')
if ($normalizedInstall -eq $installRoot -or $normalizedInstall -eq $userProfile -or $normalizedInstall -eq $BackupDir.TrimEnd('\', '/')) {
  throw "Refusing unsafe uninstall target: $InstallDir"
}
if (-not (Test-Path -LiteralPath $InstallDir -PathType Container)) {
  Write-Host "Tethermark install directory does not exist: $InstallDir"
  exit 0
}

$markerPath = Join-Path $InstallDir ".tethermark-install.json"
$gitPath = Join-Path $InstallDir ".git"
$packagePath = Join-Path $InstallDir "package.json"
$validInstall = $false
if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
  try {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -eq "tethermark") {
      if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
        $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
        $validInstall = ($marker.schema_version -eq "2026-08-27.install-marker.v1" -and $marker.commit_sha -match '^[0-9a-fA-F]{40}$')
      } else {
        $validInstall = Test-Path -LiteralPath $gitPath -PathType Container
      }
    }
  } catch { $validInstall = $false }
}
if (-not $validInstall) {
  throw "Refusing to remove a directory that is not a verified Tethermark installation: $InstallDir"
}

$stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$stateBackup = Join-Path $BackupDir "tethermark-$stamp"
$preserved = @(".env", ".env.local", ".artifacts", ".tethermark")

Write-Host "Tethermark uninstall"
Write-Host "Install dir: $InstallDir"
if ($PurgeData) {
  Write-Host "Local configuration, audit data, and managed worker files inside the checkout will be deleted."
} else {
  Write-Host "Local configuration and data will be preserved under: $stateBackup"
}
Write-Host "User-scoped static tools outside the checkout are not removed."

if (-not $DryRun -and -not $Yes) {
  throw "No changes made. Re-run with -Yes after reviewing this target."
}

if ($DryRun) {
  if (-not $PurgeData) {
    Write-Host "+ New-Item -ItemType Directory -Force -Path `"$stateBackup`""
    foreach ($name in $preserved) {
      $source = Join-Path $InstallDir $name
      if (Test-Path -LiteralPath $source) {
        Write-Host "+ Move-Item -LiteralPath `"$source`" -Destination `"$(Join-Path $stateBackup $name)`""
      }
    }
  }
  Write-Host "+ Remove-Item -LiteralPath `"$InstallDir`" -Recurse -Force"
  Write-Host "Uninstall dry run complete; nothing was removed."
  exit 0
}

if (-not $PurgeData) {
  New-Item -ItemType Directory -Force -Path $stateBackup | Out-Null
  foreach ($name in $preserved) {
    $source = Join-Path $InstallDir $name
    if (Test-Path -LiteralPath $source) {
      Move-Item -LiteralPath $source -Destination (Join-Path $stateBackup $name)
    }
  }
}

$resolvedBeforeDelete = (Resolve-Path -LiteralPath $InstallDir).Path
if ($resolvedBeforeDelete.TrimEnd('\', '/') -ne $normalizedInstall) {
  throw "Resolved uninstall target changed unexpectedly: $resolvedBeforeDelete"
}
Remove-Item -LiteralPath $resolvedBeforeDelete -Recurse -Force
Write-Host "Removed Tethermark application checkout: $resolvedBeforeDelete"
if (-not $PurgeData) {
  Write-Host "Preserved local state: $stateBackup"
}
