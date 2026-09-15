# Sucursal compartida e integraciones recuperadas

## Origen de las versiones

La copia local partía de `11757c1`. La revisión de GitHub encontró `origin/main` en `8925f0b`, con integraciones que faltaban localmente. Se recuperaron de esa revisión `apps/margenes/app.js`, `api-config.js`, `apps-script.gs`, su README y las aplicaciones `objetivos-ventas` y `objetivos-ventas-sistemas`. Se conservaron los estilos de RÍO y se incorporaron ambas pantallas al catálogo y a la portada. No se realizó un merge completo de todos los cambios remotos ni una publicación.

## Comportamiento

- El primer ingreso pide sucursal o área. Se conserva en `localStorage`, por navegador y origen, no por cuenta de Windows.
- Las pantallas con sucursal operativa reciben esa selección; los selectores de destino de mercadería conservan su función.
- Los nombres equivalentes de sucursal se resuelven contra las opciones reales de cada aplicación. Si una herramienta no ofrece esa sucursal se muestra un aviso, sin elegir otro local.
- Picking Salida sólo aparece para Depósito; abrir su URL con otro perfil vuelve al inicio.
- Administración utiliza la clave existente de la suite y una sesión de navegador. Las herramientas privadas conservan su control de acceso existente. Este control estático organiza el acceso de la interfaz; no reemplaza autenticación del servidor.
- Objetivos conserva la autenticación de su Apps Script. Completa el correo de la sucursal y separa el token por local. La clave de la suite no sustituye la de esta API.
- Los nuevos borradores de Pedido Semanal y Entrada de Mercadería se guardan separados por sucursal. Las antiguas claves de borradores se conservan sin modificarlas y no se asignan a un local automáticamente.
- Cambiar sucursal en otra pestaña bloquea la pantalla anterior hasta volver al inicio, para evitar mezclar contextos.

## Evidencia de verificación

- Márgenes: carga real desde `api-config.js`, 199 filas y 9 sucursales; correo del 11/09/2026 16:23:20, reporte actualizado 18:16:13. Se añadió un botón para volver a consultar el reporte, con límite de espera y error recuperable.
- Objetivos: autenticación existente de Quilmes validada; dashboard de septiembre de 2026 y actualización del 11/09/2026 09:20:08.
- Quilmes aplicado en Pedido Semanal, Depósitos a Confirmar, Etiquetas, Incidentes, Archivos Administrativos, Pedidos Web Locales, Entrada de Mercadería, Envíos, Asistencia, Mercadería en Tránsito y Control de Remitos. Las tres últimas se verificaron después de cargar las opciones remotas.
- Administración: clave incorrecta rechazada y clave vigente aceptada. Picking oculto para Quilmes y visible/operativo para el perfil Depósito.
- Seis pruebas automáticas de contexto: primera visita, URL directa de Picking, sesión de Administración, equivalencias, preferencias heredadas y aislamiento de borradores.
- Revisión visual de selector y objetivos a 390 px; corregida distribución móvil de búsqueda y selector en la cabecera.

No se registraron pedidos, depósitos, asistencia ni cambios de objetivos. Las credenciales, implementaciones de Apps Script y permisos de Drive no se modificaron. Los datos observados son una instantánea de la prueba, no una garantía de actualización futura.
