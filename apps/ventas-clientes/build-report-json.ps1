param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [string]$OutputDirectory = "",

  [string]$StoreFileName = "ventas_clientes_store.json",

  [string]$ReportFileName = "ventas_clientes_report.json",

  [string]$WarningsFileName = "ventas_clientes_warnings.json"
)

$ErrorActionPreference = "Stop"

$source = Get-Item -LiteralPath $InputPath
if (-not $OutputDirectory) {
  if ($source.PSIsContainer) {
    $OutputDirectory = Join-Path $source.FullName "ventas_clientes_json"
  } else {
    $OutputDirectory = Join-Path $source.DirectoryName ($source.BaseName + "_json")
  }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Split-CsvLine {
  param([string]$Line)

  $fields = New-Object System.Collections.Generic.List[string]
  $sb = [System.Text.StringBuilder]::new()
  $inQuotes = $false
  $i = 0

  while ($i -lt $Line.Length) {
    $ch = $Line[$i]
    if ($ch -eq '"') {
      if ($inQuotes -and ($i + 1) -lt $Line.Length -and $Line[$i + 1] -eq '"') {
        [void]$sb.Append('"')
        $i += 2
        continue
      }
      $inQuotes = -not $inQuotes
    } elseif ($ch -eq ';' -and -not $inQuotes) {
      $fields.Add($sb.ToString())
      [void]$sb.Clear()
    } else {
      [void]$sb.Append($ch)
    }
    $i++
  }

  $fields.Add($sb.ToString())
  return $fields.ToArray()
}

function Normalize-Header {
  param([string]$Value)
  $normalized = $Value.Trim().ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  return -join ($normalized.ToCharArray() | Where-Object {
    [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne [Globalization.UnicodeCategory]::NonSpacingMark
  })
}

function Normalize-Key {
  param([string]$Value)
  if ($null -eq $Value) { $Value = "" }
  $normalized = $Value.Trim().ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $withoutMarks = -join ($normalized.ToCharArray() | Where-Object {
    [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne [Globalization.UnicodeCategory]::NonSpacingMark
  })
  return ($withoutMarks -replace "\s+", " ")
}

function Test-ClienteDescartado {
  param([string]$ClienteId, [string]$ClienteNombre)
  $id = Normalize-Key $ClienteId
  $nombre = Normalize-Key $ClienteNombre

  return $id -eq "cf" -or
    $id -eq "0" -or
    $nombre -eq "consumidor final" -or
    $nombre -eq "cliente consumidor final" -or
    $nombre -eq "cf"
}

function Parse-DateValue {
  param([string]$Value)
  $text = $Value.Trim()
  $formats = @("d/M/yyyy", "dd/MM/yyyy", "d/M/yy", "dd/MM/yy", "yyyy-M-d", "yyyy-MM-dd")
  foreach ($format in $formats) {
    try {
      return [datetime]::ParseExact($text, $format, [Globalization.CultureInfo]::InvariantCulture)
    } catch {}
  }
  return $null
}

function Parse-Amount {
  param([string]$Value)
  $text = $Value.Trim().Replace(".", "").Replace(",", ".")
  $result = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$result)) {
    return $result
  }
  return 0.0
}

function Round2 {
  param([double]$Value)
  return [Math]::Round($Value, 2)
}

function Round4 {
  param([double]$Value)
  return [Math]::Round($Value, 4)
}

function Get-MapNumber {
  param($Map, [string]$Key)
  if ($null -ne $Map -and $Map.ContainsKey($Key)) {
    return [double]$Map[$Key]
  }
  return 0.0
}

function Get-LastMonths {
  param([string]$BaseMonth, [int]$Count)
  if (-not $BaseMonth) { return @() }
  $parts = $BaseMonth.Split("-")
  $date = [datetime]::new([int]$parts[0], [int]$parts[1], 1)
  $out = @()
  for ($i = 0; $i -lt $Count; $i++) {
    $out += $date.AddMonths(-$i).ToString("yyyy-MM")
  }
  return $out
}

function Get-FrequencyText {
  param([int]$PurchaseDays, [double]$AvgGap)
  if ($PurchaseDays -le 1) { return "Una compra registrada" }
  if ($AvgGap -le 15) { return "Muy frecuente" }
  if ($AvgGap -le 35) { return "Frecuente" }
  if ($AvgGap -le 60) { return "Espaciada" }
  return "Muy espaciada"
}

function Get-Segment {
  param($Client, [int]$PurchaseDays, [int]$DaysSinceLast, [double]$AvgGap, [datetime]$First, [datetime]$Last)
  $total = [double]$Client.totalHistorico
  if ($DaysSinceLast -gt 120) { return "Cliente inactivo" }
  if ($First -and $Last -and (($Last - $First).Days -le 45) -and $PurchaseDays -le 2) { return "Cliente nuevo" }
  if ($PurchaseDays -ge 6 -and $total -ge 500000) { return "Compra mucho y frecuente" }
  if ($PurchaseDays -ge 6) { return "Compra frecuente" }
  if ($AvgGap -gt 45 -and $total -ge 500000) { return "Compra mucho y espaciado" }
  if ($AvgGap -gt 45) { return "Compra poco y espaciado" }
  return "Cliente habitual"
}

$clients = @{}
$branchTotals = @{}
$monthTotals = @{}
$totalRows = 0
$discardedRows = 0
$fechaMin = ""
$fechaMax = ""
$fileLogs = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[object]
$importedFiles = @{}
$encoding = [System.Text.Encoding]::GetEncoding(1252)

if ($source.PSIsContainer) {
  $csvFiles = @(Get-ChildItem -LiteralPath $source.FullName -File -Filter *.csv | Sort-Object Name)
} else {
  $csvFiles = @($source)
}

if (-not $csvFiles.Count) {
  throw "No se encontraron archivos CSV para procesar."
}

function Process-CsvFile {
  param([System.IO.FileInfo]$CsvFile)

  Write-Output "Procesando $($CsvFile.Name)..."
  $reader = [System.IO.StreamReader]::new($CsvFile.FullName, $encoding, $true)
  $fileRows = 0
  $fileDiscarded = 0

  try {
    $headerLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($headerLine)) {
      throw "El CSV no tiene cabecera."
    }

    $headers = Split-CsvLine $headerLine | ForEach-Object { Normalize-Header $_ }
    $idx = @{
      sucursal = [array]::IndexOf($headers, "codigo")
      clienteId = [array]::IndexOf($headers, "cliente")
      clienteNombre = [array]::IndexOf($headers, "cliente descripcion")
      fecha = [array]::IndexOf($headers, "fecha")
      listaPrecio = [array]::IndexOf($headers, "lista de precio")
      telefono = [array]::IndexOf($headers, "telefono")
      telefonoMovil = [array]::IndexOf($headers, "telefono movil")
      email = [array]::IndexOf($headers, "email")
      total = [array]::IndexOf($headers, "total")
    }

    foreach ($key in $idx.Keys) {
      if ($idx[$key] -lt 0) { throw "Falta columna requerida: $key" }
    }

    while (($line = $reader.ReadLine()) -ne $null) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      try {
        $row = Split-CsvLine $line
        if ($row.Count -lt $headers.Count) { continue }

        $sucursal = $row[$idx.sucursal].Trim().ToUpperInvariant()
        $clienteId = $row[$idx.clienteId].Trim()
        $nombre = $row[$idx.clienteNombre].Trim()
        $fechaDt = Parse-DateValue $row[$idx.fecha]
        if (Test-ClienteDescartado -ClienteId $clienteId -ClienteNombre $nombre) {
          $script:discardedRows++
          $fileDiscarded++
          continue
        }
        if (-not $sucursal -or -not $clienteId -or -not $fechaDt) { continue }

        $fecha = $fechaDt.ToString("yyyy-MM-dd")
        $periodo = $fechaDt.ToString("yyyy-MM")
        $total = Parse-Amount $row[$idx.total]
        $lista = $row[$idx.listaPrecio].Trim()
        $telefono = $row[$idx.telefono].Trim()
        $telefonoMovil = $row[$idx.telefonoMovil].Trim()
        $email = $row[$idx.email].Trim()

        if (-not $script:clients.ContainsKey($clienteId)) {
          $script:clients[$clienteId] = [ordered]@{
            clienteId = $clienteId
            nombre = $nombre
            telefono = $telefono
            telefonoMovil = $telefonoMovil
            email = $email
            totalHistorico = 0.0
            monthlyTotals = @{}
            dias = @{}
            sucursales = @{}
            listas = @{}
            compras = @{}
          }
        }

        $client = $script:clients[$clienteId]
        if (-not $client.nombre) { $client.nombre = $nombre }
        if (-not $client.telefono) { $client.telefono = $telefono }
        if (-not $client.telefonoMovil) { $client.telefonoMovil = $telefonoMovil }
        if (-not $client.email) { $client.email = $email }
        $client.totalHistorico = [double]$client.totalHistorico + $total
        $client.monthlyTotals[$periodo] = (Get-MapNumber $client.monthlyTotals $periodo) + $total
        $client.dias[$fecha] = $true
        $client.sucursales[$sucursal] = (Get-MapNumber $client.sucursales $sucursal) + $total
        if ($lista) { $client.listas[$lista] = $true }

        $compraKey = "$fecha|$sucursal|$(if ($lista) { $lista } else { '-' })"
        if (-not $client.compras.ContainsKey($compraKey)) {
          $client.compras[$compraKey] = [ordered]@{
            clienteId = $clienteId
            fecha = $fecha
            sucursal = $sucursal
            listaPrecio = $lista
            telefono = $telefono
            telefonoMovil = $telefonoMovil
            email = $email
            total = 0.0
          }
        }
        $client.compras[$compraKey].total = [double]$client.compras[$compraKey].total + $total

        $script:branchTotals[$sucursal] = (Get-MapNumber $script:branchTotals $sucursal) + $total
        $script:monthTotals[$periodo] = (Get-MapNumber $script:monthTotals $periodo) + $total
        $script:totalRows++
        $fileRows++

        if (-not $script:fechaMin -or $fecha -lt $script:fechaMin) { $script:fechaMin = $fecha }
        if (-not $script:fechaMax -or $fecha -gt $script:fechaMax) { $script:fechaMax = $fecha }
      } catch {
        $script:warnings.Add([ordered]@{
          stage = "row"
          file = $CsvFile.Name
          line = $script:totalRows + 1
          message = $_.Exception.Message
        })
        continue
      }

      if (($script:totalRows % 50000) -eq 0) {
        Write-Output "Procesadas $script:totalRows filas..."
      }
    }
  } finally {
    $reader.Dispose()
  }

  $fileId = $CsvFile.BaseName
  $script:importedFiles[$fileId] = [ordered]@{
    id = $fileId
    name = $CsvFile.Name
    importedAt = $script:updatedAt
    rows = $fileRows
  }
  $script:fileLogs.Add([ordered]@{
    fileId = $fileId
    fileName = $CsvFile.Name
    importedAt = $script:updatedAt
    rows = $fileRows
    discardedRows = $fileDiscarded
    status = "OK"
    message = "Generado localmente"
  })
}

$updatedAt = (Get-Date).ToUniversalTime().ToString("o")
foreach ($csv in $csvFiles) {
  Process-CsvFile -CsvFile $csv
}

$baseMonth = if ($fechaMax) { $fechaMax.Substring(0, 7) } else { "" }
$baseYear = if ($fechaMax) { $fechaMax.Substring(0, 4) } else { "" }
$last3Months = Get-LastMonths -BaseMonth $baseMonth -Count 3
$maxDate = if ($fechaMax) { [datetime]::ParseExact($fechaMax, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) } else { $null }

$clientReportsList = New-Object System.Collections.Generic.List[object]
foreach ($clientId in $clients.Keys) {
  try {
    $client = $clients[$clientId]
    $dias = @($client.dias.Keys | Sort-Object)
    $sucursales = @($client.sucursales.Keys | Sort-Object)
    $listas = @($client.listas.Keys | Sort-Object)
    $firstDate = if ($dias.Count) { [datetime]::ParseExact($dias[0], "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) } else { $maxDate }
    $lastDate = if ($dias.Count) { [datetime]::ParseExact($dias[$dias.Count - 1], "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) } else { $maxDate }
    $daysSinceLast = if ($maxDate -and $lastDate) { ($maxDate - $lastDate).Days } else { 0 }
    $activeSpan = if ($firstDate -and $lastDate) { [Math]::Max(1, ($lastDate - $firstDate).Days + 1) } else { 1 }
    $frequencyScore = if ($activeSpan) { $dias.Count / $activeSpan } else { 0 }
    $avgGap = if ($dias.Count -gt 1) { $activeSpan / ($dias.Count - 1) } else { $activeSpan }
    $segment = Get-Segment -Client $client -PurchaseDays $dias.Count -DaysSinceLast $daysSinceLast -AvgGap $avgGap -First $firstDate -Last $lastDate

    $principal = ""
    $principalTotal = [double]::NegativeInfinity
    foreach ($s in $sucursales) {
      if ([double]$client.sucursales[$s] -gt $principalTotal) {
        $principal = $s
        $principalTotal = [double]$client.sucursales[$s]
      }
    }

    $total3 = 0.0
    foreach ($m in $last3Months) { $total3 += Get-MapNumber $client.monthlyTotals $m }
    $totalYear = 0.0
    foreach ($m in $client.monthlyTotals.Keys) {
      if ($m.Substring(0, 4) -eq $baseYear) { $totalYear += [double]$client.monthlyTotals[$m] }
    }

    $clientReportsList.Add([pscustomobject][ordered]@{
      clienteId = $client.clienteId
      nombre = $client.nombre
      telefono = $client.telefono
      telefonoMovil = $client.telefonoMovil
      email = $client.email
      totalHistorico = Round2 ([double]$client.totalHistorico)
      totalMesBase = Round2 (Get-MapNumber $client.monthlyTotals $baseMonth)
      totalUltimos3Meses = Round2 $total3
      totalAnioBase = Round2 $totalYear
      primeraCompra = if ($dias.Count) { $dias[0] } else { "" }
      ultimaCompra = if ($dias.Count) { $dias[$dias.Count - 1] } else { "" }
      diasCompra = $dias.Count
      frequencyScore = Round4 $frequencyScore
      frecuenciaTexto = Get-FrequencyText -PurchaseDays $dias.Count -AvgGap $avgGap
      segmento = $segment
      sucursales = $sucursales
      sucursalPrincipal = $principal
      sucursalesTexto = ($sucursales -join ", ")
      listasTexto = ($listas -join ", ")
    })
  } catch {
    $warnings.Add([ordered]@{
      stage = "client-report"
      clienteId = $clientId
      message = $_.Exception.Message
    })
    continue
  }
}

Write-Output "Armando rankings..."
try {
  $clientReports = @($clientReportsList | Sort-Object totalMesBase, totalHistorico, nombre -Descending)
} catch {
  $warnings.Add([ordered]@{ stage = "client-sort"; message = $_.Exception.Message })
  $clientReports = @($clientReportsList)
}
try {
  $branchReport = @($branchTotals.Keys | ForEach-Object {
    [pscustomobject][ordered]@{ sucursal = $_; total = Round2 ([double]$branchTotals[$_]) }
  } | Sort-Object total -Descending)
} catch {
  $warnings.Add([ordered]@{ stage = "branch-sort"; message = $_.Exception.Message })
  $branchReport = @($branchTotals.Keys | ForEach-Object {
    [pscustomobject][ordered]@{ sucursal = $_; total = Round2 ([double]$branchTotals[$_]) }
  })
}
$monthReport = @($monthTotals.Keys | Sort-Object -Descending | ForEach-Object { [pscustomobject][ordered]@{ mes = $_; total = Round2 ([double]$monthTotals[$_]) } })
$fileLogsArray = @($fileLogs.ToArray())
$warningsArray = @($warnings.ToArray())
$clientReportsArray = @($clientReports)
$branchReportArray = @($branchReport)
$monthReportArray = @($monthReport)

$store = [ordered]@{
  version = 3
  updatedAt = $updatedAt
  importedFiles = $importedFiles
  clients = $clients
  branchTotals = $branchTotals
  monthTotals = $monthTotals
  meta = [ordered]@{ totalFilas = $totalRows; fechaMin = $fechaMin; fechaMax = $fechaMax }
  log = $fileLogsArray
  warnings = $warningsArray
}

$report = [ordered]@{
  version = 3
  updatedAt = $updatedAt
  meta = [ordered]@{
    modo = "json-agregado-local"
    totalFilas = $totalRows
    filasDescartadas = $discardedRows
    totalArchivos = $csvFiles.Count
    fechaMin = $fechaMin
    fechaMax = $fechaMax
    mesBase = $baseMonth
    anioBase = $baseYear
  }
  clientes = $clientReportsArray
  sucursales = $branchReportArray
  meses = $monthReportArray
  warnings = $warningsArray
}

$storePath = Join-Path $OutputDirectory $StoreFileName
$reportPath = Join-Path $OutputDirectory $ReportFileName
$warningsPath = Join-Path $OutputDirectory $WarningsFileName
$jsonDepth = 100
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($storePath, ($store | ConvertTo-Json -Depth $jsonDepth -Compress), $utf8NoBom)
[System.IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth $jsonDepth -Compress), $utf8NoBom)
[System.IO.File]::WriteAllText($warningsPath, ($warningsArray | ConvertTo-Json -Depth $jsonDepth), $utf8NoBom)

Write-Output "JSON generado correctamente."
Write-Output "Archivos procesados: $($csvFiles.Count)"
Write-Output "Filas procesadas: $totalRows"
Write-Output "Filas descartadas CF/Consumidor Final: $discardedRows"
Write-Output "Advertencias: $($warnings.Count)"
Write-Output "Clientes: $($clients.Count)"
Write-Output "Sucursales: $($branchTotals.Count)"
Write-Output "Periodo: $fechaMin a $fechaMax"
Write-Output "Store: $storePath"
Write-Output "Report: $reportPath"
Write-Output "Warnings: $warningsPath"
