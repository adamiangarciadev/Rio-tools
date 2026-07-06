$ErrorActionPreference = "Stop"

$Root = "D:\Damian\Rio-tools"
$Node = "C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$Python = "C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

Set-Location $Root

& $Node "$Root\tools\canva-sync\export-selected-designs.mjs"
& $Python "$Root\tools\canva-sync\build-carteles-assets.py"

Write-Host "Pedido de Carteleria actualizado correctamente."
