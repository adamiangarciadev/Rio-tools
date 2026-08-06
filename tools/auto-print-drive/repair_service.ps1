param(
  [string]$ServiceName = "RioAutoPrintPedidosDrive"
)

$ErrorActionPreference = "Stop"
$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$RepairLog = Join-Path $ToolDir "repair-service.log"

function Write-RepairLog($Message) {
  "$Stamp $Message" | Out-File -FilePath $RepairLog -Append -Encoding utf8
  Write-Host $Message
}

$current = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($current)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Ejecuta este script como administrador."
}

Write-RepairLog "Reiniciando servicio $ServiceName"
Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 8
$service = Get-Service -Name $ServiceName
Write-RepairLog "Estado final: $($service.Status), inicio: $($service.StartType)"

$autoPrintLog = Join-Path $ToolDir "auto-print.log"
if (Test-Path $autoPrintLog) {
  Write-RepairLog "Ultimas lineas de auto-print.log:"
  Get-Content $autoPrintLog -Tail 8 | ForEach-Object { Write-RepairLog $_ }
}
