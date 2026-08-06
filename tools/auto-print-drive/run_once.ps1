$ErrorActionPreference = "Stop"
$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ToolDir ".venv\Scripts\python.exe"

if (!(Test-Path $Python)) {
  & (Get-Command python -ErrorAction Stop).Source -m venv (Join-Path $ToolDir ".venv")
  & $Python -m pip install --upgrade pip
  & $Python -m pip install -r (Join-Path $ToolDir "requirements.txt")
}

& $Python (Join-Path $ToolDir "monitor_drive_print.py") --once
