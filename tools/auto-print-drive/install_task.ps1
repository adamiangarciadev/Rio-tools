param(
  [string]$TaskName = "Rio Auto Print Pedidos Drive"
)

$ErrorActionPreference = "Stop"
$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = (Get-Command python -ErrorAction Stop).Source
$VenvPython = Join-Path $ToolDir ".venv\Scripts\python.exe"
$Config = Join-Path $ToolDir "config.json"
$ExampleConfig = Join-Path $ToolDir "config.example.json"
$Credentials = Join-Path $ToolDir "credentials.json"

if (!(Test-Path $Config)) {
  Copy-Item $ExampleConfig $Config
  Write-Host "Cree config.json con la carpeta de Drive ya cargada."
}

if (!(Test-Path $Credentials)) {
  Write-Warning "Todavia falta credentials.json. La tarea se instala igual, pero no va a poder conectarse a Drive hasta que lo agregues."
}

if (!(Test-Path $VenvPython)) {
  & $Python -m venv (Join-Path $ToolDir ".venv")
}

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $ToolDir "requirements.txt")

$Action = New-ScheduledTaskAction `
  -Execute $VenvPython `
  -Argument "`"$ToolDir\monitor_drive_print.py`"" `
  -WorkingDirectory $ToolDir

$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 365) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "Monitorea una carpeta de Google Drive e imprime PDFs nuevos de pedidos." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Listo. Tarea instalada e iniciada: $TaskName"
Write-Host "Log: $ToolDir\auto-print.log"
