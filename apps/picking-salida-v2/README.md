# Picking Salida V2

Circuito independiente de V1: captura → borrador IndexedDB → pedido inmutable → respaldo Drive → reserva atómica de número → TXT verificado → cuadernillo → confirmación.

Objetivo: 10 operadores, 200 remitos diarios y 5.000 prendas totales/día. El ensayo automático reproduce ese volumen; no reemplaza medir latencia, concurrencia y cuotas en Google real.

## Ejecutar el ensayo local

En esta carpeta, con Node 22 o superior:

```powershell
npm ci
npm test
npm run check
npm run dev
```

Abrir http://127.0.0.1:8770/apps/picking-salida-v2/?demo=1. Solo escucha en esta computadora. La demo usa el mismo motor de estados con un adaptador local y una base de borradores separada. No escribe en Google. Estado del servicio permite cortar después de crear el TXT y ejecutar la recuperación. Los datos de ensayo quedan en `local-data/demo.json`, excluido de Git.

## Recursos nuevos ya creados

- [Carpeta V2](https://drive.google.com/drive/folders/1Q5k0J89semidbtDvnoNXLL9-OLi27Q5w)
- [Cuadernillo](https://docs.google.com/spreadsheets/d/1po-vnBSdLFGVmGVbzaCsCHLMS-rIxjCsp6NW3fU656o/edit)
- [Control privado](https://docs.google.com/spreadsheets/d/121ZB1cW4h1BYcWlmN0bCOwdaJ6nsNPOOu2yzNzILzhs/edit)
- [Coordinador Apps Script](https://script.google.com/home/projects/1aPLGPUhjI66xPG45cJJINFef9Ur4Ulz8pGMEwtvPbR_7cblp-T-uaXAt/edit)

`deployment/resources.json` contiene las 36 rutas de piloto. Estos recursos no están conectados a las carpetas observadas por los importadores de V1. Numeración independiente desde 1: no mezclar ambas series en producción.

## Instalación de Google

1. `npm run vendor` genera `deployment/Code.gs`, `Install.gs` y `appsscript.json` y conserva copias locales de Dexie y Papa Parse con sus licencias.
2. En el proyecto nuevo, cargar esos archivos. El manifiesto habilita Drive v3 y Sheets v4.
3. Ejecutar **installPreparedPickingV2**, autorizar Google y verificar ejecución completada. Usa las planillas ya creadas; no ejecutar `setupPickingV2`, que es un instalador alternativo para otra instancia.
4. El instalador crea `PICKING_CONFIG` y el activador cada 5 minutos. Si una instalación quedó configurada pero sin activador, ejecutar `installPickingRecovery`; nunca resetear el contador.
5. Ejecutar `smokeTestPickingV2` solamente en piloto. Conserva un único remito sintético, aunque se ejecute de nuevo. Exige TXT, contenido y publicación correctos.
6. Desplegar como aplicación web ejecutada por el propietario, accesible sin cuenta Google. Cada pedido operativo exige una credencial aleatoria de equipo validada por el servidor; una URL pública no permite escribir por sí sola. Actualizar `config.js` con la URL `/exec`.

## Acceso directo sin correos de operadores

El operador no usa correo ni contraseña. Sistemas habilita una vez cada navegador/puesto y la app conserva su credencial local. Cada solicitud identifica al equipo; el responsable se elige como en V1. Ese nombre es declarado, no una identidad personal verificada.

Ejecutar `preparePickingStations` en el editor privado: genera 10 puestos de operador y un supervisor, todos para DEPOSITO. Los códigos privados aparecen en el registro de ejecución, vencen en 24 horas y se usan una sola vez en “Habilitar equipo”. No publicarlos en Git, planillas operativas ni mensajes compartidos. El navegador recibe un token aleatorio de 64 caracteres hexadecimales, y el servidor conserva solamente su huella SHA-256.

Si se borra el perfil del navegador, hace falta habilitarlo otra vez. `reissuePickingStation` permite renovar un puesto seleccionado en el editor privado e invalida su acceso anterior. En PICKING_STATIONS se puede deshabilitar un puesto inmediatamente y limitar sus orígenes. Cada puesto ve sus operaciones; el supervisor ve todas. Elegir otro responsable en pantalla no concede privilegios. Las credenciales pertenecen al equipo: quien use ese perfil comparte su acceso.

No se requiere Cloudflare, clientes OAuth ni cuentas de Google para operadores. La cuenta de Sistemas administra Apps Script y Drive. No hay servicios pagos ni base SQL; siguen aplicando las cuotas gratuitas y el espacio disponible de Google.

## Reglas que protegen el guardado

- Dos lecturas del mismo código son dos prendas. Un mismo ID de evento no puede aparecer dos veces.
- Códigos, ceros iniciales y orden se conservan. TXT UTF-8: un código por línea, sin separador final. Nombre `DDMMAA DESTINO RESPONSABLE NB REMnumero.txt`.
- Límite de 10.000 lecturas por picking, con bloqueo explícito; no se descartan las primeras.
- Las dos equivalencias deben estar cargadas para cerrar. Las lecturas sin equivalencia requieren revisión explícita.
- Se conserva el borrador después de recargar. Las pestañas concurrentes usan revisión optimista para evitar sobrescrituras.
- Número y operación se reservan en un único lote de Sheets, protegido por ScriptLock.
- Cada archivo usa un ID preasignado. Reintentar consulta y verifica ese ID.
- Solo se publica la fila después de verificar nombre, carpeta y contenido del TXT.
- Una reserva de ejecución dura 8 minutos. Tras un corte, el activador retoma la misma operación; los reintentos tienen espera creciente y máximo 8 intentos antes de atención manual.
- Un archivo confirmado que fue movido, consumido o eliminado no se recrea automáticamente. La recuperación manual debe conciliar el incidente.
- La confirmación se verifica contra ID, cantidad y huella del pedido. HTML o JSON incompleto nunca significan éxito.

## Operación y mantenimiento

El operador escanea, revisa, finaliza y puede empezar otro picking. “En este equipo” todavía no es respaldo central. “Contenido respaldado” permite recuperación del servidor. “Listo para despachar” confirma el circuito.

Un administrador puede reintentar operaciones con incidentes una vez corregida la causa. Solo puede anular recepciones que aún no tengan contenido aceptado ni número. Las salidas emitidas requieren conciliación documentada. No borrar filas técnicas, editar el contador ni corregir TXT manualmente.

El historial central muestra las últimas 500 operaciones del mes; las anteriores siguen en el registro mensual. Los borradores permanecen en el equipo, con exportación/importación JSON. No borrar datos del navegador antes de enviarlos o exportarlos. La persistencia del navegador no sobrevive necesariamente a pérdida del disco o borrado del perfil.

Para publicar una versión nueva, incrementar el nombre de caché de `sw.js` y la versión de `config.js`. El service worker espera que se cierren las pestañas anteriores: no cambia el código durante un picking abierto.

Antes de producción: probar 10 cierres simultáneos en Google, pérdida de respuesta, permisos revocados, consumo externo de TXT, cuentas reales y reanudación después de cerrar navegador. Acordar la serie de remitos y conectar los consumidores a las nuevas carpetas. Mantener V1 disponible hasta aprobar el piloto. No hay software con garantía de cero fallos; este diseño evita confirmaciones falsas y deja fallos recuperables y visibles.
