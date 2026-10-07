$ErrorActionPreference = 'Stop'
$privateDirectory = Join-Path $env:LOCALAPPDATA 'RioTools\BancoMedios'
$config = Get-Content -LiteralPath (Join-Path $privateDirectory 'dropbox.json') -Raw | ConvertFrom-Json
$moduleDirectory = Join-Path $PSScriptRoot '..\apps\banco-medios'
$values = @{
    DROPBOX_APP_KEY = $config.appKey
    DROPBOX_APP_SECRET = $config.appSecret
    DROPBOX_REFRESH_TOKEN = $config.refreshToken
    DROPBOX_SHARED_LINK = $config.sharedLink
} | ConvertTo-Json -Compress
$setup = "function configurarDropboxPrivado() {`n  PropertiesService.getScriptProperties().setProperties($values);`n}`n"
$source = (Get-Content -LiteralPath (Join-Path $moduleDirectory 'apps-script.gs') -Raw) + "`n" + (Get-Content -LiteralPath (Join-Path $moduleDirectory 'dropbox.gs') -Raw)
$destination = Join-Path $privateDirectory 'instalacion-banco-medios.gs'
Set-Content -LiteralPath $destination -Value ($source + "`n" + $setup) -Encoding UTF8
Set-Clipboard -Value ($source + "`n" + $setup)
Write-Host 'Codigo de instalacion copiado. Pegalo solamente en el editor privado de Google Apps Script.'
Write-Host 'Ejecuta configurarDropboxPrivado una vez, luego elimina esa funcion y actualiza la implementacion.'
