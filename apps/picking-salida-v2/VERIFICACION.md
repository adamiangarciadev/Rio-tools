# Verificación de Picking Salida V2 — 7 de octubre de 2026

## Evidencia disponible

- **23 pruebas automáticas aprobadas** con Node Test Runner. Comprueban persistencia de borradores, conflicto entre pestañas, pedido cerrado inmutable, repetición de envíos, acceso por equipo y recuperación del motor.
- Cortes simulados antes/después de respaldo, reserva de número, creación de TXT y publicación de fila. Todos recuperan el mismo número y archivo, sin fila duplicada.
- Se impide publicar cuando el TXT no existe o su contenido fue modificado. Un TXT confirmado y retirado por un consumidor requiere conciliación y no se recrea automáticamente.
- Carga lógica simulada: 200 remitos de 25 prendas, repartidos entre 10 identidades, con doble envío de cada operación. Resultado: 200 números, 200 filas y 5.000 prendas. Es una prueba del protocolo, **no una medición de carga concurrente de Google**.
- Navegador local: catálogo completo de 106.450 códigos; dos prendas conservadas al recargar; corte después de crear TXT; recuperación; historial muestra un solo REM1 listo con dos prendas.
- **Integración real Apps Script → Drive → Sheets aprobada** a las 14:16–14:17 de Buenos Aires. Operación `20261007_98bb09a3-6931-45e0-8b5e-0c926452430a`, remito piloto `1`, TXT `1QDnnfSDZEpPHP4CwQYELn3k02Iun_PC0`. Contenido sintético: dos líneas idénticas `ENSAYO!NEGRO!M`. El segundo envío devolvió el mismo remito y archivo.
- El conector de Google verificó una única fila en CUADERNILLO, con PICKING_ID, TXT_ID, UNIDADES=2 y ESTADO=LISTO. Las planillas están en zona horaria de Buenos Aires.
- Dependencias de ejecución: Dexie y Papa Parse. Auditoría npm sin vulnerabilidades reportadas al revisar esta versión.

## Límites de la evidencia

El servicio público fue desplegado y se probó desde la pantalla local con acceso PUESTO 01: REM2, operación 20261007_d7c5f694-55b5-43b5-bc57-f72b3eb64860, dos prendas; TXT 1t0vUmKtQubr5h8Tf6JEoIJBbNek4lVd0 y fila LISTO verificada por el conector. Antes de reemplazar V1 también deben probarse diez cierres simultáneos, permisos revocados, pérdida de conexión y el importador real de TXT.

Google Sheets y Drive no ofrecen una transacción conjunta. La garantía implementada es verificar antes de confirmar y recuperar la misma operación; no impedir caídas de Google, eliminación externa de archivos, borrado del perfil del navegador o falta de espacio.
