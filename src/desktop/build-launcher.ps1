param(
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$source = Join-Path $PSScriptRoot "ApiHubLauncher.cs"
$outputDirectory = Join-Path $root "dist"
$output = if ([string]::IsNullOrWhiteSpace($OutputPath)) { Join-Path $outputDirectory "API Hub Launcher.exe" } else { [IO.Path]::GetFullPath($OutputPath) }

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "Windows C# compiler was not found at $compiler"
}

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($output)) | Out-Null
& $compiler /nologo /target:winexe /optimize+ "/out:$output" `
  /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll $source

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
  throw "API Hub Launcher compilation failed."
}

Get-Item -LiteralPath $output | Select-Object FullName, Length, LastWriteTime
