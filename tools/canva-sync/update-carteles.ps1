$ErrorActionPreference = "Stop"

$Root = if ($env:GITHUB_WORKSPACE) { $env:GITHUB_WORKSPACE } else { "D:\Damian\Rio-tools" }
$LocalNode = "C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$LocalPython = "C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$Node = if (Test-Path $LocalNode) { $LocalNode } else { "node" }
$Python = if (Test-Path $LocalPython) { $LocalPython } else { "python" }

Set-Location $Root

& $Node "$Root\tools\canva-sync\export-selected-designs.mjs"
if ($LASTEXITCODE -ne 0) {
    throw "Fallo la exportacion de los diseños desde Canva (codigo $LASTEXITCODE)."
}

& $Python "$Root\tools\canva-sync\build-carteles-assets.py"
if ($LASTEXITCODE -ne 0) {
    throw "Fallo la generacion del catalogo de carteleria (codigo $LASTEXITCODE)."
}

Write-Host "Pedido de Carteleria actualizado correctamente."
