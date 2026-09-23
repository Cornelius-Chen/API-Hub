$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$archive = Join-Path $root "dist\API-Hub-Portable-win-x64.zip"
$extractRoot = Join-Path $env:TEMP ("api-hub-portable-extract-" + [Guid]::NewGuid().ToString("N"))
$portable = Join-Path $extractRoot "API Hub Portable"
$launcher = Join-Path $portable "API Hub.exe"
$runtime = Join-Path $portable "runtime\node.exe"
$testBase = Join-Path $env:TEMP ("api-hub-portable-" + [Guid]::NewGuid().ToString("N"))

if (-not (Test-Path -LiteralPath $archive)) {
  throw "Build the portable archive before running its lifecycle test."
}
if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 4310 -State Listen -ErrorAction SilentlyContinue) {
  throw "Port 4310 must be free for portable lifecycle verification."
}

$oldPath = $env:PATH
$oldDb = $env:API_HUB_DB_PATH
$oldVault = $env:API_HUB_VAULT_KEY_PATH
try {
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot
  if (-not (Test-Path -LiteralPath $launcher) -or -not (Test-Path -LiteralPath $runtime)) {
    throw "Extracted portable archive is missing its launcher or bundled runtime."
  }
  foreach ($required in @("server.js", "public\index.html", "public\app.js", "public\styles.css", "src\database.js", "src\security.js", "src\gateway\execution-engine.js", "src\sdk\node\index.js", "src\sdk\node\mcp.js")) {
    if (-not (Test-Path -LiteralPath (Join-Path $portable $required))) { throw "Extracted portable archive is missing $required." }
  }
  & $runtime --check (Join-Path $portable "src\sdk\node\mcp.js")
  if ($LASTEXITCODE -ne 0) { throw "Bundled MCP bridge failed syntax validation." }
  $forbidden = Get-ChildItem -LiteralPath $portable -Recurse -File | Where-Object { $_.Name -match '\.(sqlite|sqlite-wal|sqlite-shm|key|env)$' -or $_.Name -like '.env*' }
  if ($forbidden) { throw "Extracted portable archive contains forbidden secret or runtime data." }
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
  $env:API_HUB_DB_PATH = "$testBase.sqlite"
  $env:API_HUB_VAULT_KEY_PATH = "$testBase.key"
  $process = Start-Process -FilePath $launcher -ArgumentList "--verify" -WorkingDirectory $portable -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Portable lifecycle returned exit code $($process.ExitCode)." }
  if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 4310 -State Listen -ErrorAction SilentlyContinue) {
    throw "Portable lifecycle did not release port 4310."
  }
  Write-Output "portable bundled-runtime lifecycle without Node on PATH: passed"
}
finally {
  $env:PATH = $oldPath
  $env:API_HUB_DB_PATH = $oldDb
  $env:API_HUB_VAULT_KEY_PATH = $oldVault
  foreach ($suffix in @(".sqlite", ".sqlite-wal", ".sqlite-shm", ".key")) {
    Remove-Item -LiteralPath "$testBase$suffix" -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $extractRoot) {
    $resolvedExtract = (Resolve-Path -LiteralPath $extractRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if ($resolvedExtract.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedExtract).StartsWith("api-hub-portable-extract-")) {
      Remove-Item -LiteralPath $resolvedExtract -Recurse -Force
    }
  }
}
