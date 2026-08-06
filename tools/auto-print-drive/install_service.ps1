param(
  [string]$ServiceName = "RioAutoPrintPedidosDrive"
)

$ErrorActionPreference = "Stop"
$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = (Get-Command python -ErrorAction Stop).Source
$VenvPython = Join-Path $ToolDir ".venv\Scripts\python.exe"
$Config = Join-Path $ToolDir "config.json"
$ExampleConfig = Join-Path $ToolDir "config.example.json"
$Requirements = Join-Path $ToolDir "requirements.txt"
$Script = Join-Path $ToolDir "monitor_drive_print.py"
$Log = Join-Path $ToolDir "service-output.log"
$ErrLog = Join-Path $ToolDir "service-error.log"

if (!(Test-Path $Config)) {
  Copy-Item $ExampleConfig $Config
}

if (!(Test-Path $VenvPython)) {
  & $Python -m venv (Join-Path $ToolDir ".venv")
}

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r $Requirements

$NssmCommand = Get-Command nssm -ErrorAction SilentlyContinue
if ($NssmCommand) {
  $Nssm = $NssmCommand.Source
} else {
  $Nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\win64\*" } |
    Select-Object -First 1 -ExpandProperty FullName
}

if (!$Nssm) {
  throw "No encontre nssm.exe. Instala NSSM con winget install --id NSSM.NSSM"
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  & $Nssm stop $ServiceName
  & $Nssm remove $ServiceName confirm
}

& $Nssm install $ServiceName $VenvPython $Script
& $Nssm set $ServiceName AppDirectory $ToolDir
& $Nssm set $ServiceName DisplayName "Rio Auto Print Pedidos Drive"
& $Nssm set $ServiceName Description "Monitorea Google Drive e imprime PDFs nuevos de pedidos sin abrir ventanas."
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName AppStdout $Log
& $Nssm set $ServiceName AppStderr $ErrLog
& $Nssm set $ServiceName AppRotateFiles 1
& $Nssm set $ServiceName AppRotateOnline 1
& $Nssm set $ServiceName AppRotateBytes 1048576

Start-Service -Name $ServiceName
Write-Host "Servicio instalado e iniciado: $ServiceName"
Write-Host "Log principal: $ToolDir\auto-print.log"
Write-Host "Log servicio: $Log"
