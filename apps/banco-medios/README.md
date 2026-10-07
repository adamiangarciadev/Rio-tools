# Banco de Medios

## Imagenes de Dropbox

La pestaña de Dropbox navega la carpeta compartida configurada y sus subcarpetas. Muestra JPG, JPEG, PNG, WEBP, GIF y BMP, y videos MP4, MOV, M4V, WEBM, AVI, MPEG y MPG. No realiza operaciones de escritura. El buscador de Dropbox consulta por nombre todos los archivos de la carpeta actual antes de paginar; no busca dentro de subcarpetas. Permite filtrar imagenes, videos o ambos. La reproduccion depende del formato y codec admitido por el navegador; se ofrece abrir en Dropbox y descargar como alternativa.

Agregar `dropbox.gs` al mismo proyecto de Apps Script que `apps-script.gs`. Configurar en Propiedades del script `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` y `DROPBOX_SHARED_LINK`. Luego actualizar la implementacion existente (nueva version, manteniendo su URL). Nunca colocar credenciales en `api-config.js`.

Para instalar desde la configuracion privada local, ejecutar `tools/preparar-banco-dropbox.ps1`. Copia al portapapeles el codigo combinado con una funcion temporal `configurarDropboxPrivado`. Pegar en el editor privado del proyecto existente, ejecutar esa funcion una vez y eliminarla antes de actualizar la implementacion. El archivo generado permanece fuera del repositorio, en LocalAppData/RioTools/BancoMedios.

Las consultas usan `?accion=imagenes&path=/Marca&offset=0`. El servidor pagina las carpetas completas y entrega hasta 12 imagenes por pedido. La vista previa carga el original de forma diferida; carpetas con imagenes grandes pueden consumir mas datos. OneDrive aun no esta conectado: falta el enlace y el tipo de cuenta.

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

