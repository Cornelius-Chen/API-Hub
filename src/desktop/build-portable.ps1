$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$dist = Join-Path $root "dist"
$portable = Join-Path $dist "API Hub Portable"
$zip = Join-Path $dist "API-Hub-Portable-win-x64.zip"
$node = $env:npm_node_execpath
if ([string]::IsNullOrWhiteSpace($node) -or -not (Test-Path -LiteralPath $node)) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($nodeCommand) { $node = $nodeCommand.Source }
}
if ([string]::IsNullOrWhiteSpace($node) -or -not (Test-Path -LiteralPath $node)) {
  $node = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and (Test-Path -LiteralPath $_.ExecutablePath) } |
    Select-Object -First 1 -ExpandProperty ExecutablePath
}
if ([string]::IsNullOrWhiteSpace($node) -or -not (Test-Path -LiteralPath $node) -or [IO.Path]::GetFileName($node) -ne "node.exe") {
  throw "A valid Node.js runtime could not be located for portable packaging."
}

if (-not $portable.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Portable output escaped the governed dist directory."
}

if (Test-Path -LiteralPath $portable) {
  $resolvedPortable = (Resolve-Path -LiteralPath $portable).Path
  if (-not $resolvedPortable.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove an output outside dist."
  }
  Remove-Item -LiteralPath $resolvedPortable -Recurse -Force
}
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

New-Item -ItemType Directory -Force -Path $portable, (Join-Path $portable "runtime"), (Join-Path $portable "src\gateway"), (Join-Path $portable "src\sdk\node"), (Join-Path $portable "public"), (Join-Path $portable "data\runtime") | Out-Null

& (Join-Path $PSScriptRoot "build-launcher.ps1") -OutputPath (Join-Path $portable "API Hub.exe") | Out-Null
Copy-Item -LiteralPath $node -Destination (Join-Path $portable "runtime\node.exe")
Copy-Item -LiteralPath (Join-Path $root "server.js") -Destination $portable
Copy-Item -LiteralPath (Join-Path $root "src\database.js") -Destination (Join-Path $portable "src\database.js")
Copy-Item -LiteralPath (Join-Path $root "src\security.js") -Destination (Join-Path $portable "src\security.js")
Copy-Item -LiteralPath (Join-Path $root "src\gateway\execution-engine.js") -Destination (Join-Path $portable "src\gateway\execution-engine.js")
Get-ChildItem -LiteralPath (Join-Path $root "src\sdk\node") -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portable "src\sdk\node")
}
Get-ChildItem -LiteralPath (Join-Path $root "public") -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portable "public")
}

foreach ($required in @("public\index.html", "public\app.js", "public\styles.css")) {
  if (-not (Test-Path -LiteralPath (Join-Path $portable $required))) {
    throw "Portable package is missing required UI asset: $required"
  }
}

@'
API Hub Portable

Double-click "API Hub.exe". The bundled runtime starts the local service and
opens http://127.0.0.1:4310. Use the tray icon's "Stop and exit" command before
moving or deleting this folder.

Application data is created locally under data\runtime on first launch. Keep the
whole folder private. Do not email or publish it after adding real credentials.

The bundled MCP bridge is at src\sdk\node\mcp.js. Agent hosts can start it with
runtime\node.exe after setting API_HUB_URL and a separately issued
API_HUB_APP_TOKEN in the host's private environment.
'@ | Set-Content -LiteralPath (Join-Path $portable "README.txt") -Encoding UTF8

$forbidden = Get-ChildItem -LiteralPath $portable -Recurse -File | Where-Object {
  $_.Name -match '\.(sqlite|sqlite-wal|sqlite-shm|key|env)$' -or $_.Name -like '.env*'
}
if ($forbidden) { throw "Secret or durable runtime files entered the portable release." }

$hashLines = Get-ChildItem -LiteralPath $portable -Recurse -File | Sort-Object FullName | ForEach-Object {
  $relative = $_.FullName.Substring($portable.Length + 1).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $relative"
}
$hashLines | Set-Content -LiteralPath (Join-Path $portable "SHA256SUMS.txt") -Encoding ASCII

Compress-Archive -LiteralPath $portable -DestinationPath $zip -CompressionLevel Optimal
$archiveHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$archiveHash  $([IO.Path]::GetFileName($zip))" | Set-Content -LiteralPath "$zip.sha256" -Encoding ASCII

[pscustomobject]@{
  PortableDirectory = $portable
  Archive = $zip
  ArchiveBytes = (Get-Item -LiteralPath $zip).Length
  ArchiveSha256 = $archiveHash
  BundledNode = (Get-Item -LiteralPath (Join-Path $portable "runtime\node.exe")).VersionInfo.FileVersion
  Files = @(Get-ChildItem -LiteralPath $portable -Recurse -File).Count
} | ConvertTo-Json
