param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$DataDir = [IO.Path]::GetFullPath($DataDir)
$NodePath = [IO.Path]::GetFullPath($NodePath)
$ConfigPath = if ($ConfigPath) { [IO.Path]::GetFullPath($ConfigPath) } else { Join-Path $DataDir "config\tethermark.env" }
$entrypoint = Join-Path $InstallDir "scripts\run-api-web.mjs"

if (-not (Test-Path -LiteralPath (Join-Path $InstallDir "package.json") -PathType Leaf)) { throw "InstallDir is not a Tethermark checkout." }
if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) { throw "Tethermark service entrypoint is missing." }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "Node.js executable is missing." }
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw "Protected service configuration is missing." }

$env:HARNESS_ENV_FILE = $ConfigPath
$env:HARNESS_ARTIFACT_ROOT = Join-Path $DataDir "artifacts"
$env:HARNESS_LOCAL_DB_ROOT = Join-Path $DataDir "state\local-db"

Set-Location -LiteralPath $InstallDir
& $NodePath $entrypoint
exit $LASTEXITCODE
