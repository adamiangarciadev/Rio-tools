$ErrorActionPreference = 'Stop'

function Read-PrivateValue([string]$Label) {
    $secure = Read-Host $Label -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

Write-Host 'Conexion privada de Dropbox para el Banco de Medios'
Write-Host 'Los valores ingresados no se muestran ni se guardan en el repositorio.'
$appKey = 'ojrw2bw7su2ffn9'
$appSecret = Read-PrivateValue 'Pega App secret (Settings > Show) y presiona Enter'
$code = Read-PrivateValue 'Pega el codigo de autorizacion de Dropbox y presiona Enter'

try {
    $result = Invoke-RestMethod -Method Post -Uri 'https://api.dropboxapi.com/oauth2/token' -Body @{
        grant_type = 'authorization_code'
        code = $code
        client_id = $appKey
        client_secret = $appSecret
    }
} catch {
    Write-Host 'Dropbox no acepto la autorizacion. Verifica el secreto y usa un codigo nuevo.'
    exit 1
}

if (-not $result.refresh_token) {
    Write-Host 'La autorizacion no devolvio renovacion automatica. Repite la autorizacion con acceso offline.'
    exit 1
}

$privateDirectory = Join-Path $env:LOCALAPPDATA 'RioTools\BancoMedios'
New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $privateDirectory -AclObject $acl
$privateFile = Join-Path $privateDirectory 'dropbox.json'
@{
    appKey = $appKey
    appSecret = $appSecret
    refreshToken = $result.refresh_token
    sharedLink = 'https://www.dropbox.com/scl/fo/q8obvxekzj54c6fvslv5g/AJIDEH4deNIM7WbmZiWp04Y/00_material/02_Material%20marcas/Catalogos%20-%20Productos%20L%C3%ADnea?dl=0&rlkey=2onk2ubuxumm52dexo627x5ea'
} | ConvertTo-Json | Set-Content -LiteralPath $privateFile -Encoding UTF8
$appSecret = $null
$code = $null
$result = $null
Write-Host 'Conexion guardada correctamente en la configuracion privada de esta computadora.'
