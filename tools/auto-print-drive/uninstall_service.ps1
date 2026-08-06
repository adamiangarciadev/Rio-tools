param(
  [string]$ServiceName = "RioAutoPrintPedidosDrive"
)

$ErrorActionPreference = "Stop"
$NssmCommand = Get-Command nssm -ErrorAction SilentlyContinue
if ($NssmCommand) {
  $Nssm = $NssmCommand.Source
} else {
  $Nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\win64\*" } |
    Select-Object -First 1 -ExpandProperty FullName
}

if (!$Nssm) {
  throw "No encontre nssm.exe."
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  & $Nssm stop $ServiceName
  & $Nssm remove $ServiceName confirm
  Write-Host "Servicio eliminado: $ServiceName"
} else {
  Write-Host "No existe el servicio: $ServiceName"
}
