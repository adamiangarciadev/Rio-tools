# RIO Tools Suite

RIO Tools Suite es una plataforma web interna que centraliza procesos de locales, depósito, ecommerce, administración y soporte. Está compuesta por aplicaciones independientes en HTML, CSS y JavaScript vanilla, agrupadas detrás de un panel principal y preparadas para ejecutarse localmente o publicarse como sitio estático.

La suite prioriza despliegues simples, módulos aislados y automatizaciones puntuales mediante Google Apps Script, Google Drive, Canva, Python y PowerShell.

## Estado actual

- Panel principal reorganizado en Operaciones, Ecommerce, Depósito, Administración, Sistemas y Supervisores.
- Acceso de supervisión desde el encabezado; al desbloquearlo aparece la columna completa de herramientas reservadas.
- Mesa de Ayuda para crear y consultar incidentes internos.
- Consola de Sistemas para asignar responsables, cambiar estados y registrar el seguimiento de esos incidentes.
- Botón común **Informar problema con la página** incorporado a las aplicaciones operativas.
- Datos pesados, descargas y archivos generados excluidos del repositorio para mantenerlo liviano.

## Aplicaciones

| Área | Aplicaciones y alcance |
| --- | --- |
| Operaciones | Entrada de Mercadería, Mercadería en Tránsito, Control de Remitos de Clientes, Envíos y Flete |
| Ecommerce | Categorizador, Pedidos Web, Pedidos Web Locales, Pedidos Dashboard y Banco de Medios |
| Depósito | Picking Salida, Pedido Semanal, Etiquetas y Remitos Depósito |
| Administración | Asistencia, Confirmación de Depósitos, Archivos Administrativos y otras herramientas de control |
| Comunicación visual | Pedido de Cartelería y catálogo sincronizado desde Canva |
| Sistemas | Mesa de Ayuda para locales y Gestión de Incidentes para seguimiento interno |
| Supervisores | Control de Asistencia, Márgenes, Dashboard de Asistencia, Check Depósitos, Ventas por Cliente, Remitos Depósito y Apercibimientos |

Las herramientas de la columna **Supervisores** solo se muestran después de habilitar el acceso correspondiente desde el panel principal.

## Cambios funcionales recientes

### Panel principal

- Se amplió el tablero y se redistribuyeron los módulos en hasta seis columnas.
- Pedido de Cartelería pasó a Administración.
- Se agregó el área Sistemas con acceso a la Mesa de Ayuda.
- Se creó una columna exclusiva para Supervisores.
- El desbloqueo de supervisión ahora se abre desde un botón compacto en el encabezado y conserva el estado mediante `assets/rio-access.js`.
- Se retiraron los módulos antiguos `revision-stock` y `supervisores-control`.

### Mesa de Ayuda e incidentes

`apps/incidentes/` permite:

- crear incidentes con sucursal, colaborador, área, prioridad, título y descripción;
- adjuntar hasta 6 imágenes, videos, PDF o documentos, con un máximo de 10 MB por archivo;
- buscar y filtrar reportes, consultar métricas y abrir su detalle;
- generar pedidos de etiquetas a partir de artículo, color y talle;
- vincular automáticamente un pedido de etiquetas con la baja de artículos cuando corresponde;
- informar stock negativo identificando el código exacto desde los archivos de equivalencias;
- operar con Google Apps Script y Drive o usar `localStorage` como respaldo local.

`apps/sistemas/` consume la misma base de incidentes y agrega:

- métricas de pendientes, en proceso, críticos y resueltos en el día;
- filtros por texto, estado, sucursal y prioridad;
- asignación por código de colaborador validado contra el padrón;
- cambios de estado, notas e historial de seguimiento;
- acceso a los adjuntos del incidente.

La configuración y el despliegue del backend están documentados en `apps/incidentes/README.md`.

### Reporte de problemas desde las apps

`assets/rio-report-problem.js` agrega junto al botón Volver un acceso para informar errores de la página actual. Detecta la sucursal guardada por las distintas aplicaciones, permite adjuntar un archivo de hasta 10 MB y genera el ticket directamente en la Mesa de Ayuda.

El componente está incorporado en Apercibimientos, Archivos Administrativos, Asistencia, Dashboard de Asistencia, Banco de Medios, Categorizador, Check Depósitos, Confirmación de Depósitos, Control de Remitos, Entrada de Mercadería, Envíos, Etiquetas, Flete, Márgenes, Mercadería en Tránsito, Pedido de Cartelería, Pedido Semanal, Pedidos Dashboard, Pedidos Web, Pedidos Web Locales, Remitos Depósito, Supervisores y Ventas por Cliente.

### Envíos

- Al ingresar un DNI o CUIL busca el último envío del cliente.
- Completa automáticamente nombre, contacto y domicilio sin sobrescribir campos que el usuario ya haya escrito.
- Normaliza DNI y CUIL para reconocer al mismo cliente y muestra el resultado debajo del campo.

### Banco de Medios

- La carga automática al hacer scroll fue reemplazada por un botón explícito **Cargar más videos**.
- Se agregó **Actualizar lista**, que fuerza la actualización del origen de datos.
- El botón informa cuántos elementos se cargarán en el próximo lote.

### Ventas por Cliente

- Las compras ahora conservan y muestran el número de comprobante.
- El comprobante forma parte de la clave que agrupa ventas, evitando unir operaciones distintas del mismo día, sucursal y lista de precios.
- El campo se incluye en consultas, exportaciones y generadores JSON de Apps Script, Python y PowerShell.
- Se aceptan distintas variantes del encabezado de comprobante y se mantiene compatibilidad con CSV anteriores que no lo incluyen.

### Pedidos Web Locales

- Se actualizó el endpoint de Google Apps Script utilizado por la aplicación.

## Pedido de Cartelería y Canva

`apps/pedido-carteleria/` presenta un catálogo visual generado desde proyectos de Canva, con búsqueda por texto y descarga de carteles imprimibles.

La sincronización vive en `tools/canva-sync/` y el workflow `.github/workflows/update-carteles.yml` puede ejecutarla periódicamente. Los PDFs, páginas y previews generados ya no se versionan: se regeneran localmente o durante la automatización y están excluidos por `.gitignore`.

Credenciales y archivos locales que nunca deben subirse:

```text
tools/canva-sync/.env
tools/canva-sync/.canva-token.json
tools/canva-sync/canva-designs.json
tools/canva-sync/canva-project-rows.json
tools/canva-sync/canva-page-rows.json
```

Secrets requeridos por GitHub Actions:

```text
CANVA_CLIENT_ID
CANVA_CLIENT_SECRET
CANVA_TOKEN_JSON
```

## Impresión automática desde Google Drive

`tools/auto-print-drive/` monitorea una carpeta de Drive, descarga los PDF nuevos y los envía a la impresora una sola vez. Puede instalarse como servicio de Windows o como tarea programada, admite impresora específica y recomienda SumatraPDF para impresión silenciosa.

La instalación, prueba, reparación y desinstalación están detalladas en `tools/auto-print-drive/README.md`. Sus credenciales OAuth, tokens, descargas, configuración local, registros y estado de impresión están excluidos del repositorio.

## Stack

- HTML5, CSS3 y JavaScript vanilla.
- Tema compartido en `assets/rio-theme.css`.
- Datos operativos locales en CSV y JSON.
- Google Apps Script para endpoints, persistencia e integración con Drive.
- Canva Connect API para exportar cartelería.
- Python y PowerShell para procesamiento de datos, automatizaciones e instalación en Windows.
- GitHub Pages como destino de publicación estática.
- GitHub Actions para tareas programadas.

## Estructura

```text
Rio-tools/
  index.html
  README.md
  assets/
    rio-theme.css
    rio-access.js
    rio-report-problem.js
  apps/
    incidentes/
    sistemas/
    envios/
    banco-medios/
    ventas-clientes/
    pedido-carteleria/
    ...
  data/
    equivalencia.csv
    equivalencia2.csv
    ASISTENCIA_RIO - PADRON.csv
  tools/
    canva-sync/
    auto-print-drive/
  .github/workflows/
```

## Ejecución local

Desde la raíz del repositorio:

```powershell
python -m http.server 8087 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8087/`. Es importante usar un servidor HTTP y no abrir los HTML directamente, porque varias aplicaciones cargan CSV, JSON y otros recursos mediante `fetch`.

Accesos directos útiles:

```text
http://127.0.0.1:8087/apps/incidentes/
http://127.0.0.1:8087/apps/sistemas/
http://127.0.0.1:8087/apps/pedido-carteleria/
```

## Datos locales y archivos generados

No se versionan:

- `tmp/`, `output/`, `outputs/` y logs;
- entornos, cachés y bytecode de Python;
- CSV y JSON generados de Ventas por Cliente;
- descargas, PDFs por página y previews de Canva;
- credenciales, tokens, descargas y estado de la impresión automática.

Los archivos eliminados del repositorio en esas rutas son artefactos regenerables, no módulos funcionales.

## Seguridad

- No versionar tokens, credenciales OAuth, secrets ni archivos `.env`.
- Publicar los Apps Script con el nivel de acceso mínimo necesario.
- No incluir contraseñas ni datos sensibles en incidentes o adjuntos.
- Mantener las herramientas administrativas detrás del control de acceso de supervisión.
- Tratar los datos comerciales, el padrón y los assets de Canva como contenido operativo interno.

## Estado del proyecto

Proyecto de uso interno y evolución continua. La arquitectura mantiene cada aplicación aislada, comparte únicamente los recursos transversales necesarios y permite agregar automatizaciones sin requerir un backend tradicional para toda la suite.
