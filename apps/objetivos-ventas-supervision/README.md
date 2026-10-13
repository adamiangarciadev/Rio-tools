# Control de objetivos locales

Consulta de solo lectura en Supervisores de RÍO Tools. Usa la navegación, las fuentes y la identidad compartidas. Cada tarjeta mantiene objetivo del día, detalle de lunes a sábado, total semanal, acumulado mensual, diferencias, cumplimiento y objetivo completo del mes.

El acceso requiere la sesión común de Supervisores y la API valida su clave en el servidor. No permite editar objetivos ni ventas. El panel existente de Sistemas conserva sus funciones.

## Activación del script independiente

1. Crear un **proyecto nuevo** en Google Apps Script con la cuenta que tiene acceso al JSON privado de Objetivos de ventas. No reemplazar el proyecto existente.
2. Copiar el contenido completo de `apps-script.gs` de esta carpeta en `Code.gs` del nuevo proyecto. Es el archivo listo para pegar; incluye configuración y cálculo.
3. Activar «Mostrar el archivo de manifiesto appsscript.json» en Configuración del proyecto y reemplazar ese manifiesto por `appsscript.json` de esta carpeta. Incluye únicamente el permiso `drive.readonly` y la zona horaria de Buenos Aires.
4. Implementar → Nueva implementación → Aplicación web. Ejecutar como propietario y acceso «Cualquier usuario». Autorizar la lectura de Drive. La API valida la clave de Supervisores antes de leer el archivo; la URL por sí sola no entrega ventas.
5. Copiar la URL terminada en `/exec` en `apiUrl` dentro de `config.js` de esta carpeta y publicar los archivos web.

No se necesita inicialización ni activadores. El script no escribe en Drive, no importa correos y no reinicia meses. Lee el mismo archivo privado por su ID. No modifica el Apps Script de Objetivos de ventas ni el panel de Sistemas.

`node tools/build-objetivos-supervision.cjs` regenera el archivo listo para pegar desde la configuración y los cálculos de Objetivos de ventas, copiando solo los campos necesarios (sin mails ni contraseñas de locales). Si cambia la distribución, los feriados o la clave común de Supervisores, regenerar y actualizar esta implementación independiente. Los objetivos mensuales se leen del JSON en cada consulta.

La API conserva el cálculo de objetivos diario existente y los objetivos congelados de las ventas históricas. Los totales comparan únicamente días informados hasta la fecha seleccionada; cero informado es una venta válida y la falta de información se muestra como `Sin dato`. Las semanas que cruzan de mes muestran `Otro mes` para los días fuera del período disponible. Los domingos siguen dentro del acumulado mensual si hay ventas informadas, pero no en la sección de lunes a sábado.

Vista previa con ejemplos: `?demo=1`, únicamente después de ingresar como Supervisor. La consulta normal nunca sustituye una API fallida por datos inventados.
