$ErrorActionPreference = "Stop"

$Root = if ($env:GITHUB_WORKSPACE) { $env:GITHUB_WORKSPACE } else { "D:\Damian\Rio-tools" }
$LocalNode = "C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$LocalPython = "C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$Node = if (Test-Path $LocalNode) { $LocalNode } else { "node" }
$Python = if (Test-Path $LocalPython) { $LocalPython } else { "python" }

Set-Location $Root

& $Node "$Root\tools\canva-sync\export-selected-designs.mjs"
& $Python "$Root\tools\canva-sync\build-carteles-assets.py"

Write-Host "Pedido de Carteleria actualizado correctamente."
