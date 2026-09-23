$ErrorActionPreference = 'Stop'
$info = New-Object Diagnostics.ProcessStartInfo
$info.FileName = (Get-Command node.exe).Source
$info.Arguments = '-e "let s='''' ;process.stdin.setEncoding(''utf8'');process.stdin.on(''data'',c=>s+=c);process.stdin.on(''end'',()=>{const p=JSON.parse(s).password;process.exit(p===String.fromCharCode(64,35,65509,37,20013,25991)?0:1)});"'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$p = [Diagnostics.Process]::Start($info)
$synthetic = -join ([char[]]@(64,35,65509,37,20013,25991))
$bytes = [Text.Encoding]::UTF8.GetBytes((@{password=$synthetic}|ConvertTo-Json -Compress))
$p.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
$p.StandardInput.BaseStream.Flush()
$p.StandardInput.Close()
$p.WaitForExit()
if($p.ExitCode -ne 0){throw 'Synthetic Unicode transport failed'}
Write-Output 'Windows PowerShell UTF-8 password pipe: passed'
