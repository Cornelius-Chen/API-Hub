$ErrorActionPreference = 'Stop'
$hubRoot = Split-Path $PSScriptRoot -Parent
if (Get-NetTCPConnection -LocalPort 4310 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 4310 is occupied. This launcher never stops an existing process.'
}
$hubNode = (Get-Command node.exe).Source
$env:API_HUB_PUBLIC_ORIGIN = 'https://msi.tail4dd8cd.ts.net'
$env:API_HUB_HOST = '127.0.0.1'
$env:PORT = '4310'
$hubProcess = Start-Process -FilePath $hubNode -ArgumentList 'server.js' -WorkingDirectory $hubRoot -WindowStyle Hidden -PassThru
Write-Output ('API Hub started, PID ' + $hubProcess.Id)
