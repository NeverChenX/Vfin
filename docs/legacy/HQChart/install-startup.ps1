$ws = New-Object -ComObject WScript.Shell
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'VFin-HQChart.lnk'
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath = 'E:\Share\Project\HQChart\start.bat'
$sc.WorkingDirectory = 'E:\Share\Project\HQChart'
$sc.WindowStyle = 7
$sc.Description = 'VFin HQChart Auto Start'
$sc.Save()
Write-Host "Shortcut created at: $shortcutPath"
