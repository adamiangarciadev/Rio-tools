# RIO Tools Suite

Suite modular para digitalizar procesos internos de retail, deposito, ecommerce y administracion.

RIO Tools centraliza herramientas operativas que normalmente viven separadas en planillas, mensajes, archivos sueltos y controles manuales. La plataforma funciona como una web app estatica con modulos independientes conectados a datos CSV, Google Apps Script y recursos de Google Drive.

## Identidad del producto

- Interfaz oscura unificada con la hoja compartida `assets/rio-theme.css`.
- Dashboard principal en `index.html` con todas las herramientas visibles.
- Navegacion relativa lista para uso local, GitHub Pages o empaquetado futuro.
- Estructura modular preparada para evolucionar hacia una app Android.

## Areas cubiertas

| Area | Modulos |
| --- | --- |
| Operaciones | Entrada de Mercaderia, Mercaderia en Transito, Etiquetas, Asistencia, Control de Remitos, RIO ShipNow Interno |
| Ecommerce | Categorizador, Pedidos Web, Pedidos Web Locales, Banco de Medios |
| Deposito | Picking Salida, Pedido Semanal |
| Administracion | Archivos Administrativos, Confirmacion de Depositos, Supervisores, Control de Supervision, Sistemas, Apercibimientos, Pedido de Carteleria |

## Stack

- HTML5, CSS3 y JavaScript vanilla.
- CSV locales para equivalencias, padrones y promociones.
- Google Apps Script como capa de integracion para planillas, Drive y endpoints operativos.
- Librerias externas por CDN en modulos puntuales: XLSX, PapaParse, jsPDF y QRCode.

## Estructura

```text
Rio-tools/
  index.html
  assets/
    rio-theme.css
  apps/
    entrada-mercaderia/
    mercaderia-transito/
    picking-salida/
    pedido-semanal/
    asistencia/
    pedidos-web/
    pedidos-web-locales/
    rio-shipnow-interno/
    supervisores-control/
    ...
  data/
    equivalencia.csv
    equivalencia2.csv
    ASISTENCIA_RIO - PADRON.csv
```

## Proximos pasos recomendados

1. Auditar permisos y validaciones de cada Google Apps Script publicado.
2. Consolidar versiones historicas de archivos `app_.js`, `app__.js` y carpetas de respaldo.
3. Preparar manifiesto PWA para instalacion como app.
4. Empaquetar la suite en Android con Trusted Web Activity o Capacitor.

Proyecto preparado para presentacion comercial y evolucion a producto interno instalable.
