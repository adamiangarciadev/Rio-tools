# Centro de incidentes

Aplicación independiente para registrar y consultar problemas internos. No está enlazada desde el `index.html` principal.

## Estado actual

- Funciona inmediatamente en modo local (`localStorage`).
- Recuerda la sucursal y también reconoce las claves usadas por otras apps de RIO.
- Permite imágenes, videos, PDF y documentos (máximo 6 archivos, 10 MB por archivo).
- Incluye filtros, métricas, detalle y prioridades.
- El pedido de etiquetas puede realizarse sin baja; cuando se informan códigos para dar de baja genera dos incidentes vinculados.
- Está preparado un backend de Google Apps Script que guarda los incidentes en un archivo JSON y los adjuntos en Drive. No requiere Google Sheets.
- La app `sistemas` usa el mismo backend para asignar responsables, cambiar estados y registrar notas de seguimiento.

## Activar el almacenamiento central

1. Crear un proyecto en Google Apps Script.
2. Copiar `apps-script.gs` y ejecutar `configurar()` una vez. Esto crea `rio-incidentes.json` y la carpeta de adjuntos dentro de la carpeta de Drive configurada en `CONFIG.rootFolderId`.
3. Publicarlo como aplicación web, ejecutada por el propietario y accesible para los usuarios deseados.
4. Copiar la URL `/exec` en `api-config.js`.

Hasta completar esos pasos, cada navegador conserva sus propios tickets y los adjuntos dentro de `localStorage`; los archivos grandes podrían superar la cuota del navegador. Para uso real compartido debe activarse el backend.
