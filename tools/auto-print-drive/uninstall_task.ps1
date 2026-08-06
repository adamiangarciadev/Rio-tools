param(
  [string]$TaskName = "Rio Auto Print Pedidos Drive"
)

$ErrorActionPreference = "Stop"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Tarea eliminada: $TaskName"
} else {
  Write-Host "No existe la tarea: $TaskName"
}
