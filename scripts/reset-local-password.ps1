Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$worker = Join-Path $PSScriptRoot 'reset-local-password.js'
$node = (Get-Command node.exe).Source
$form = New-Object Windows.Forms.Form
$form.Text = 'API Hub - Local password recovery'
$form.Size = New-Object Drawing.Size(520,330)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$label = New-Object Windows.Forms.Label
$label.Text = "Account: corneliuschen`r`nEnter a new password twice (6-128 characters).`r`nAPI data is preserved. Existing browser sessions will sign out."
$label.SetBounds(20,15,475,65)
$form.Controls.Add($label)
$first = New-Object Windows.Forms.TextBox
$first.UseSystemPasswordChar = $true
$first.MaxLength = 128
$first.SetBounds(20,90,460,30)
$form.Controls.Add($first)
$second = New-Object Windows.Forms.TextBox
$second.UseSystemPasswordChar = $true
$second.MaxLength = 128
$second.SetBounds(20,135,460,30)
$form.Controls.Add($second)
$status = New-Object Windows.Forms.Label
$status.SetBounds(20,180,470,45)
$form.Controls.Add($status)
$submit = New-Object Windows.Forms.Button
$submit.Text = 'Confirm reset'
$submit.SetBounds(180,230,145,32)
$form.Controls.Add($submit)
$cancel = New-Object Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.SetBounds(345,230,130,32)
$cancel.Add_Click({ $form.Close() })
$form.Controls.Add($cancel)
$submit.Add_Click({
    if ($first.Text.Length -lt 6 -or $first.Text -cne $second.Text) {
        $status.Text = 'Passwords must match and contain at least 6 characters.'
        return
    }
    $submit.Enabled = $false
    try {
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = $node
        $info.Arguments = '"' + $worker + '"'
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardInput = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true

        $proc = [Diagnostics.Process]::Start($info)
        $bytes = [Text.Encoding]::UTF8.GetBytes((@{ password=$first.Text } | ConvertTo-Json -Compress))
        $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $proc.StandardInput.BaseStream.Flush()
        [Array]::Clear($bytes, 0, $bytes.Length)
        $proc.StandardInput.Close()
        $first.Clear(); $second.Clear()
        $answer = $proc.StandardOutput.ReadToEnd()
        $null = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        if ($proc.ExitCode -eq 0 -and $answer -eq 'RESET_OK') {
            $status.Text = 'Password updated. Sign in at https://msi.tail4dd8cd.ts.net'
            $first.Enabled = $false; $second.Enabled = $false
            $cancel.Text = 'Close'
        } else { $status.Text = 'Reset failed. Nothing sensitive was logged.'; $submit.Enabled = $true }
        $proc.Dispose()
    } catch { $first.Clear(); $second.Clear(); $status.Text = 'Unable to complete reset.'; $submit.Enabled = $true }
})
$form.Add_Shown({ $form.Activate(); $first.Focus() })
[void]$form.ShowDialog()
$first.Clear(); $second.Clear(); $form.Dispose()
