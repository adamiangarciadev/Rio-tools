# Automatización Google · Stock y ventas zNube

Esta aplicación de Google Apps Script busca el mail diario de zNube, transforma el CSV al mismo esquema utilizado por las webs de RIO y guarda un JSON por día en Drive.

## Instalación

1. Crear un proyecto nuevo en [Google Apps Script](https://script.google.com/).
2. Copiar `Code.gs` en el editor.
3. Abrir **Configuración del proyecto**, activar la visualización del manifiesto y copiar el contenido de `appsscript.json`.
4. Ejecutar manualmente la función `instalar` y aceptar los permisos de Gmail, Drive y disparadores.
5. En **Implementar → Nueva implementación**, elegir **Aplicación web**.
6. Ejecutar como **Yo** y permitir acceso a los usuarios que deban consultar la información.
7. Copiar la URL terminada en `/exec` y pegarla en los archivos `api-config.js` de las dos webs.

El disparador revisa Gmail cada 30 minutos. Solo procesa el mensaje más reciente que todavía no haya sido registrado.

## Archivos creados en Drive

- `YYYY-MM-DD.json`: reporte completo de ese día.
- `index.json`: índice liviano del histórico.

La carpeta se llama `RIO - Histórico stock y ventas`.

## Endpoints

- `URL/exec`: último reporte completo.
- `URL/exec?mode=status`: estado y metadatos del último reporte.
- `URL/exec?date=2026-08-11`: reporte de una fecha determinada.

## Funciones útiles

- `instalar()`: crea el disparador y procesa el último correo disponible.
- `procesarCorreoStockVentas()`: ejecución automática normal.
- `reprocesarUltimoCorreo()`: vuelve a generar el último día para una prueba o corrección.

