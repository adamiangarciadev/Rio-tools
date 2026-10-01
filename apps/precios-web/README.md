# Precios WEB

Comparación de los CSV de zNube LISTA1 y LISTA3 por proveedor + artículo + talle. La clasificación se muestra exactamente como llega; si difiere entre listas se usa la de LISTA1 y se advierte en pantalla. Se distinguen línea, discontinuos (incluidas promociones DISC), otras clasificaciones y sin clasificación. Si falta un precio o LISTA1 vale cero, el porcentaje queda vacío. Los artículos exclusivos de una lista también se muestran.

La selección persiste al cambiar filtros y páginas. La exportación incluye todos los seleccionados, aunque estén ocultos por un filtro, en un XLSX con las siete columnas pedidas; códigos y talles son texto, precios y porcentajes son números.

## Activación con el Gmail actual

1. Ingresar en https://script.google.com con el Gmail que recibe los reportes y crear un proyecto independiente.
2. Copiar todo `instalacion-completa.gs` en `Código.gs`. Esa versión incluye el lector de CSV y el backend en un único archivo. Como alternativa, usar `apps-script.gs` y `core.js` en dos archivos separados; no mezclar ambas opciones porque duplicaría las definiciones.
3. Configurar zona horaria `America/Argentina/Buenos_Aires` y runtime V8, o usar el manifest `appsscript.json` incluido.
4. Ejecutar `instalarPreciosWeb` y autorizar Gmail, Drive y los disparadores desde la cuenta titular. No necesita contraseña en la web.
5. Implementar como aplicación web, ejecutando como el titular. La web estática consume la URL `/exec`; el modo de acceso debe permitir la lectura desde el navegador de la sucursal. Un despliegue de acceso público hace que quien tenga esa URL pueda leer estos precios. No devuelve cuerpos de mails ni acceso al resto del correo.
6. Pegar la URL en `api-config.js`, en `window.PRECIOS_API_URL`, y publicar los archivos de la app.

El chequeo se ejecuta cada cinco minutos durante todo el día y procesa el último mail recibido de cada lista, sin restricciones de horario o fecha. Incluye los envíos de la mañana y de la tarde. Se verifica el remitente y el asunto exacto; las fechas de origen se muestran por separado. Si uno de los mails llega antes que el otro, se muestra la última versión disponible de cada lista. Solo se vuelve a generar el reporte si cambia alguno de los mails de origen.

Si falta una lista o el último adjunto tiene datos inválidos, conserva el reporte anterior y vuelve a intentar. Para actualizar ahora ejecutar `actualizarPreciosWeb`. Después de cambiar el código, editar la implementación existente y seleccionar una nueva versión para conservar la URL `/exec`.

La carga manual acepta CSV o los `.eml` de los ejemplos, con adjuntos CSV base64 UTF-8. Permite probar y exportar antes de conectar Gmail. Los archivos cargados manualmente no se suben al servidor ni se guardan en el repositorio.

## Verificación

`node tools/test-precios-web.cjs` verifica cruces, faltantes, cero, CSV, duplicados y programación. Con los mails de ejemplo disponibles en Downloads también comprueba todas sus filas y la conservación de códigos y talles. La exportación se verificó en navegador serializando y releyendo el XLSX de cinco talles del artículo 05-21013: conserva siete columnas, códigos de texto, precios numéricos y formato de porcentaje.
