# Precios WEB

Comparación de los CSV de zNube LISTA1 y LISTA3 por proveedor + artículo + talle. La clasificación se muestra exactamente como llega; si difiere entre listas se usa la de LISTA1 y se advierte en pantalla. Se distinguen línea, discontinuos (incluidas promociones DISC), otras clasificaciones y sin clasificación. Si falta un precio o LISTA1 vale cero, el porcentaje queda vacío. Los artículos exclusivos de una lista también se muestran.

La selección persiste al cambiar filtros y páginas. La exportación incluye todos los seleccionados, aunque estén ocultos por un filtro, en un XLSX con las siete columnas pedidas; códigos y talles son texto, precios y porcentajes son números.

## Selección desde Tiendanube

El CSV original se lee como UTF-8 o Windows-1252. Se localiza la columna por el encabezado SKU (columna Q del archivo de referencia). Se conserva como texto, se toma la parte anterior al primer `#` y se buscan coincidencias exactas por artículo. Las variantes repetidas se reúnen en artículos únicos y se incluyen todos sus talles del reporte de precios. Todas las coincidencias se seleccionan automáticamente. Los artículos sin coincidencia permanecen en la tabla y en el Excel con precios vacíos.

El detalle del archivo y la segunda hoja `CSV Tiendanube` conservan todas las filas originales, incluidos repetidos y SKU vacíos, con su estado de coincidencia. La primera hoja mantiene las siete columnas de precios. La actualización del reporte conserva el archivo importado y las selecciones existentes.

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

Las filas del mismo proveedor, artículo y clasificación con iguales precios en ambas listas se unifican en pantalla y en Excel. La columna talle reúne sus valores separados por /; los talles con precios distintos mantienen filas separadas.
