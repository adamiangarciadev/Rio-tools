param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [int]$MaxSizeMb = 1,

  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"

$source = Get-Item -LiteralPath $InputPath
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $source.DirectoryName ($source.BaseName + "_partes")
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$maxBytes = [Math]::Max(256KB, $MaxSizeMb * 1MB)
$encoding = [System.Text.Encoding]::GetEncoding(1252)
$reader = [System.IO.StreamReader]::new($source.FullName, $encoding, $true)

try {
  $header = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($header)) {
    throw "El CSV no tiene cabecera."
  }

  $part = 1
  $writer = $null
  $currentBytes = 0
  $rowsInPart = 0
  $totalRows = 0

  function New-PartWriter {
    param(
      [int]$PartNumber,
      [string]$Directory,
      [string]$BaseName,
      [string]$Header,
      [System.Text.Encoding]$Encoding
    )

    $path = Join-Path $Directory ("{0}_parte_{1:000}.csv" -f $BaseName, $PartNumber)
    $writer = [System.IO.StreamWriter]::new($path, $false, $Encoding)
    $writer.WriteLine($Header)
    return @{ Writer = $writer; Path = $path; Bytes = $Encoding.GetByteCount($Header + "`r`n") }
  }

  $created = New-PartWriter -PartNumber $part -Directory $OutputDirectory -BaseName $source.BaseName -Header $header -Encoding $encoding
  $writer = $created.Writer
  $currentBytes = $created.Bytes

  while (($line = $reader.ReadLine()) -ne $null) {
    $lineBytes = $encoding.GetByteCount($line + "`r`n")

    if ($rowsInPart -gt 0 -and ($currentBytes + $lineBytes) -gt $maxBytes) {
      $writer.Close()
      $part++
      $rowsInPart = 0
      $created = New-PartWriter -PartNumber $part -Directory $OutputDirectory -BaseName $source.BaseName -Header $header -Encoding $encoding
      $writer = $created.Writer
      $currentBytes = $created.Bytes
    }

    $writer.WriteLine($line)
    $currentBytes += $lineBytes
    $rowsInPart++
    $totalRows++
  }

  if ($writer) { $writer.Close() }

  Write-Output "CSV dividido correctamente."
  Write-Output "Archivo original: $($source.FullName)"
  Write-Output "Carpeta salida: $OutputDirectory"
  Write-Output "Partes creadas: $part"
  Write-Output "Filas copiadas: $totalRows"
} finally {
  if ($writer) { $writer.Dispose() }
  $reader.Dispose()
}
