# RIO Tools · Seguimiento interno Shipnow

Incluye:
- `index.html`: herramienta web para GitHub Pages.
- `styles.css`: estética RIO Tools.
- `app.js`: lógica frontend, PDF, QR, panel operativo y dashboard.
- `apps-script.gs`: backend Google Apps Script para Google Sheets.

## Instalación rápida

1. Crear una carpeta nueva dentro de `Rio-tools`, por ejemplo:
   `shipnow-interno/`

2. Subir estos archivos:
   - `index.html`
   - `styles.css`
   - `app.js`

3. Crear una Google Sheet nueva.

4. Abrir `Extensiones > Apps Script` y pegar `apps-script.gs`.

5. Implementar como Aplicación Web:
   - Ejecutar como: vos.
   - Acceso: cualquiera con el enlace.

6. Copiar la URL que termina en `/exec`.

7. En `app.js`, reemplazar:
   `const API_URL = 'PEGAR_URL_APPS_SCRIPT_EXEC';`
   por la URL real.

## Circuito operativo

Local carga pedido → genera tracking + PDF con QR → se mueve al hub asignado → Avellaneda / Web recibe → se despacha por Shipnow o Transporte.

## Hubs configurados

SARMIENTO:
- CASTELLI
- CORRIENTES
- PUEYRREDON
- QUILMES
- SARMIENTO

AVELLANEDA:
- LAMARCA
- NAZCA
- AVELLANEDA

## Footer y botón volver

La herramienta ya incluye:
- Botón superior izquierdo para volver a `https://adamiangarciadev.github.io/Rio-tools/`
- Footer estándar RIO Tools.
- Google Analytics `G-CDPZFHV1BV`.
