# RIO Tools Suite

RIO Tools Suite es una plataforma web modular para centralizar procesos internos de retail, deposito, ecommerce y administracion. Reune herramientas operativas que normalmente quedan dispersas entre planillas, mensajes, archivos sueltos y controles manuales.

El proyecto esta construido como una web app estatica, con modulos independientes en HTML, CSS y JavaScript vanilla. Puede ejecutarse localmente, publicarse en GitHub Pages y evolucionar hacia integraciones mas profundas con Google Apps Script, Google Drive, Canva y otros servicios internos.

## Objetivo

- Reducir trabajo manual repetitivo en locales, deposito y administracion.
- Unificar accesos operativos en un panel simple y consistente.
- Mantener cada herramienta aislada para facilitar mejoras sin romper otros flujos.
- Permitir despliegue liviano sin backend tradicional.
- Preparar la suite para automatizaciones, dashboards y uso mobile futuro.

## Modulos Principales

| Area | Modulos |
| --- | --- |
| Operaciones | Entrada de Mercaderia, Mercaderia en Transito, Control de Remitos, Envios |
| Ecommerce | Categorizador, Pedidos Web, Pedidos Web Locales, Banco de Medios |
| Deposito | Picking Salida, Pedido Semanal, Generador de Etiquetas, Remitos Deposito |
| Administracion | Asistencia Personal, Depositos a Confirmar, Archivos Administrativos, Control de Asistencia, Margenes, Dashboard Asistencia, Check Depositos, Ventas por Cliente, Control de Supervision, Sistemas, Apercibimientos |
| Comunicacion visual | Pedido de Carteleria, catalogo de carteles con previews, busqueda por texto y descarga en PDF imprimible |

Algunos modulos administrativos se muestran solo despues de desbloquear el acceso de supervision desde el dashboard principal.

## Pedido de Carteleria

El modulo `apps/pedido-carteleria/` mantiene un catalogo visual generado desde proyectos de Canva.

Incluye:

- previews locales por pagina;
- descarga de cada cartel como PDF individual;
- descarga de PDFs completos por proyecto;
- extraccion de texto desde PDF para busqueda;
- manifiesto `designs.json` usado por la interfaz;
- scripts de sincronizacion en `tools/canva-sync/`;
- workflow de GitHub Actions para actualizar assets periodicamente.

La automatizacion esta pensada para refrescar el catalogo desde Canva cada 2 horas mediante `.github/workflows/update-carteles.yml`.

## Stack

- HTML5, CSS3 y JavaScript vanilla.
- CSS compartido en `assets/rio-theme.css`.
- Datos locales en CSV y JSON.
- Google Apps Script para integraciones con planillas, Drive y endpoints operativos.
- Canva Connect API para exportar carteleria.
- Python para procesamiento de PDFs, separacion por paginas y extraccion de texto.
- GitHub Pages como destino de publicacion estatica.
- GitHub Actions para automatizaciones programadas.

## Estructura del Proyecto

```text
Rio-tools/
  index.html
  README.md
  assets/
    rio-theme.css
    rio-access.js
  apps/
    entrada-mercaderia/
    mercaderia-transito/
    picking-salida/
    pedido-semanal/
    asistencia/
    pedidos-web/
    pedidos-web-locales/
    banco-medios/
    pedido-carteleria/
    supervisores-control/
    ...
  data/
    equivalencia.csv
    equivalencia2.csv
    ASISTENCIA_RIO - PADRON.csv
  tools/
    canva-sync/
  .github/
    workflows/
      update-carteles.yml
```

## Ejecucion Local

Para usar la suite localmente, servir la carpeta del proyecto con un servidor HTTP simple:

```powershell
python -m http.server 8087 --bind 127.0.0.1
```

Luego abrir:

```text
http://127.0.0.1:8087/
```

El modulo de carteleria queda disponible en:

```text
http://127.0.0.1:8087/apps/pedido-carteleria/
```

## Automatizacion de Canva

Los archivos sensibles de Canva no deben subirse al repositorio.

Mantener fuera de Git:

```text
tools/canva-sync/.env
tools/canva-sync/.canva-token.json
tools/canva-sync/canva-designs.json
tools/canva-sync/canva-project-rows.json
tools/canva-sync/canva-page-rows.json
```

Para GitHub Actions, configurar estos secrets en el repositorio:

```text
CANVA_CLIENT_ID
CANVA_CLIENT_SECRET
CANVA_TOKEN_JSON
```

El workflow `update-carteles.yml` usa esos secrets para exportar los proyectos de Canva, regenerar PDFs/previews, actualizar `designs.json` y commitear los assets generados.

## Seguridad

- No versionar tokens, secrets ni archivos `.env`.
- Revisar permisos de Google Apps Script antes de publicar endpoints.
- Evitar exponer paneles administrativos sin control de acceso.
- Tratar los assets exportados desde Canva como contenido operativo interno.

## Roadmap Sugerido

1. Consolidar archivos historicos o duplicados como `app_.js`, `app__.js` y respaldos antiguos.
2. Documentar cada modulo con objetivo, entradas, salidas y dependencias.
3. Agregar manifiesto PWA para instalacion en dispositivos moviles.
4. Estandarizar integraciones con Google Apps Script.
5. Mejorar auditoria de cambios y logs de automatizaciones.
6. Evaluar empaquetado mobile con Trusted Web Activity o Capacitor.

## Estado

Proyecto en uso interno y evolucion continua. La arquitectura prioriza simplicidad operativa, despliegue rapido y mejoras incrementales por modulo.
