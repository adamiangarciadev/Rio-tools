# Auto impresion de pedidos desde Google Drive

Esta herramienta mira la carpeta de Google Drive:

`1ZhniIJmIyjxzLI5Sn9sinwiAVVVr_2Hs`

Cada vez que aparece un PDF nuevo, lo descarga y lo manda a imprimir. Guarda un registro en `printed_files.json` para no imprimir dos veces el mismo archivo.

## Instalacion rapida

1. En Google Cloud crea credenciales OAuth de tipo **Desktop app** para la API de Google Drive.
2. Descarga el JSON y guardalo como:

   `tools\auto-print-drive\credentials.json`

3. Ejecuta PowerShell como administrador en esta carpeta:

   ```powershell
   cd D:\Damian\Rio-tools\tools\auto-print-drive
   .\install_service.ps1
   ```

4. En el primer arranque se abre el navegador para autorizar el acceso a Drive. Despues queda automatico.

## Configuracion

El archivo `config.json` se crea desde `config.example.json`.

- `poll_seconds`: cada cuantos segundos revisa Drive.
- `print_existing_on_first_run`: `false` evita imprimir todo lo que ya estaba en la carpeta antes de instalar.
- `printer_name`: dejar vacio para usar la impresora predeterminada.
- `sumatra_pdf_path`: opcional. Recomendado instalar SumatraPDF para impresion silenciosa y mas confiable.

## Prueba manual

```powershell
.\run_once.ps1
```

## Desinstalar automatizacion

```powershell
.\uninstall_service.ps1
```

## Archivos utiles

- `auto-print.log`: historial de revisiones, descargas, impresiones y errores.
- `downloads\`: PDFs descargados.
- `printed_files.json`: lista de PDFs ya vistos o impresos.
