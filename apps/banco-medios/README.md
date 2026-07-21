# Banco de Medios

Este modulo carga videos desde Google Drive mediante un endpoint de Google Apps Script.

## Carpeta origen

La carpeta configurada en `apps-script.gs` es:

```text
https://drive.google.com/drive/folders/1X555Xwpx_W77xFs9P3i_c3v4v6cIMjDE
```

El script recorre esa carpeta y sus subcarpetas, toma archivos de video y devuelve los datos que usa la app:

- nombre del archivo;
- carpeta/ruta;
- marca detectada por carpeta o nombre;
- link de preview;
- link de descarga directa;
- peso del archivo.

## Como publicarlo

1. Crear o abrir un proyecto en Google Apps Script.
2. Pegar el contenido de `apps-script.gs`.
3. Publicar como Web App.
4. Ejecutar como: `Yo`.
5. Acceso: usuarios que deban usar la app, o cualquier usuario con el enlace si el banco es interno pero abierto por link.
6. Copiar la URL `/exec` publicada.
7. Reemplazar la URL en `api-config.js`, manteniendo `?accion=videos` al final.

Ejemplo:

```js
window.BANCO_MEDIOS_API_URL =
  "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec?accion=videos";
```

Para forzar refresco del cache durante pruebas:

```text
https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec?accion=videos&refresh=1
```

