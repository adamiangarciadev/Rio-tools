# Objetivos de venta por local

Web estática de solo lectura publicada con GitHub Pages. Google Apps Script funciona como API: cada noche procesa el CSV adjunto del mail de zNube, guarda el acumulado mensual en un JSON privado de Google Drive y entrega únicamente los datos del local autenticado.

La vista de cada local incluye el calendario mensual completo con objetivo, venta, cumplimiento y diferencia para todos los días. El panel separado `apps/objetivos-ventas-sistemas/` permite editar los objetivos mensuales sin modificar código.

## Configuración necesaria

1. Crear un proyecto nuevo en [Google Apps Script](https://script.google.com/) desde la cuenta que recibe los mails.
2. Copiar `apps-script.gs` en el archivo `Code.gs` del proyecto. Apps Script no necesita archivos HTML.
3. Los objetivos de agosto de 2026, los mails de cada local y sus contraseñas iniciales ya están cargados en `APP.stores`.
4. Las contraseñas usan el nombre normalizado del local seguido de `2026`, sin espacios ni acentos (por ejemplo `avellaneda29002026`).
5. En Configuración del proyecto, fijar la zona horaria `America/Argentina/Buenos_Aires`.
6. Ejecutar manualmente `initializeApp` una vez y aceptar permisos de Gmail, Drive y activadores.
7. Ejecutar `processSalesEmails` para probar la importación con el mail ya recibido.
8. Ejecutar una vez `recalculateCurrentMonthTargets` para aplicar a los días ya cargados la distribución histórica específica de cada local.
9. Implementar > Nueva implementación > Aplicación web. Ejecutar como propietario y permitir acceso a cualquiera que tenga el enlace.
10. Copiar la URL terminada en `/exec` dentro de `API_URL` en `app.js`. La URL actual ya está configurada.
11. Publicar el repositorio mediante GitHub Pages; la entrada web es `apps/objetivos-ventas/index.html`.

## Acceso de Sistemas

- URL: `apps/objetivos-ventas-sistemas/`
- Usuario inicial: `sistemas@rio.com.ar`
- Contraseña inicial: `sistemas2026`

Los cambios realizados desde Sistemas se guardan en el objeto `goals` de `ventas-dashboard.json` y recalculan inmediatamente los objetivos futuros de cada local. Los objetivos históricos de días ya informados permanecen congelados.

La función `initializeApp` crea en Mi unidad la carpeta `RIO - Objetivos de ventas`, el archivo privado `ventas-dashboard.json` y un activador diario cercano a las 21:20.

## Criterios usados

- Se toma el campo `Monto neto Total` por `Origen - Grupo`.
- Si el mismo mail ya fue procesado, no se vuelve a sumar.
- Si llega una corrección para la misma fecha, se reemplaza el monto del día.
- El objetivo diario se redistribuye con pesos propios para cada local y día de la semana, calculados con ventas entre enero de 2025 y agosto de 2026. El modelo combina 65% del comportamiento reciente de 2026 y 35% del histórico completo, normalizando el crecimiento mensual antes de comparar días.
- Todos los sábados quedan por encima del mejor día hábil de su local. Los feriados usan peso `0.75` y los domingos permanecen cerrados.
- Para agosto de 2026 está marcado el feriado nacional del lunes 17. Los próximos feriados se agregan en `APP.holidays` con formato `AAAA-MM-DD`.
- El objetivo histórico de cada día queda congelado para que el porcentaje diario no cambie retroactivamente.
- Al cambiar de mes, el acumulado mensual se reinicia automáticamente.

## Seguridad

Los mails y las contraseñas viven únicamente en Apps Script. La web envía un hash SHA-256 de la contraseña, el JSON queda privado en Drive y nunca se descarga completo al navegador. La sesión expira a las 6 horas.
