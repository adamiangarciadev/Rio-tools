# Verificación del rediseño integral

## Alcance

Portada, 25 aplicaciones principales y 2 HTML de respaldo de Pedido Semanal. Estilos compartidos y particulares, navegación entre apps, favoritos y búsqueda. Los archivos `apps/**/app.js` de procesos operativos no se modificaron.

## Verificaciones realizadas

- Las 25 rutas principales responden HTTP 200 bajo `/Rio-tools/`, simulando el prefijo de GitHub Pages.
- Los 27 HTML conservan todos los IDs, controles identificados y scripts operativos presentes antes de esta ampliación.
- Todas las hojas de estilo locales referenciadas existen.
- 25/25 aplicaciones con navegación nueva y sin desbordamiento horizontal de página a 1440 px.
- 25/25 aplicaciones con navegación nueva y sin desbordamiento horizontal de página a 390 px.
- Seleccionar Operaciones oculta el hero y muestra sus 4 herramientas con cabecera sticky.
- Menú móvil: apertura, identificación de aplicación activa y cierre.
- Búsqueda entre aplicaciones: Pedido Semanal → Generador de Etiquetas.
- Filtro de artículos: el catálogo de Etiquetas contiene 5885 opciones; buscar `04-1418` devuelve la opción correspondiente.
- Favoritos desde una aplicación: agregar y quitar.
- Formulario de reporte: apertura y cierre, con superficie clara.
- Acceso de supervisión: 24 herramientas visibles al habilitarlo; 16 sin acceso.
- Sintaxis JavaScript verificada y `git diff --check` sin errores.
- Versiones de contenido en CSS y scripts de interfaz para evitar caché obsoleta.

## Aplicación de identidad RÍO (11 de septiembre de 2026)

- Fuente: PDF y tipografías originales de `01_Identidad`; logotipos exportados como vectores, sin reconstruirlos con texto.
- Gotham y Gotham Rounded servidas localmente en WOFF2. Colores extraídos del material: coral `#FF5F5C`, violeta `#7F7EFF` y menta `#4CCCAD`.
- Portada y 27 HTML de aplicaciones enlazan la identidad compartida mediante rutas relativas.
- Segunda revisión en navegador: 25/25 aplicaciones cargan Gotham y el logotipo original a 1440 px y 390 px. Sin desbordamiento horizontal de página; se corrigió el ajuste de identificadores largos en Pedido Semanal.

## Límites de las pruebas

Las comprobaciones validan presentación, navegación y conservación de contratos. No se enviaron depósitos, asistencias, pedidos ni incidentes de prueba a servicios externos. No se verificó transaccionalmente cada integración. El servidor de vista previa es local; no se publicó en GitHub Pages.
