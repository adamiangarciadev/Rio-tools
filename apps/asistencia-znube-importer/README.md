# Importador zNube para ASISTENCIA_RIO

Importa automáticamente los PDF diarios enviados por `znube@zoologic.com.ar`, conserva el dato original y lo cruza con la pestaña `EVENTOS`.

## Resultado

- `ZNUBE_FICHAJES`: fichajes originales extraídos del PDF, sin duplicados.
- `AUDITORIA_ASISTENCIA`: cruce por fecha y legajo con estados `AMBOS`, `SOLO APP` y `SOLO ZNUBE`.
- `ZNUBE_IMPORT_LOG`: historial de correos procesados y errores.
- `PADRON`: incorpora automáticamente los legajos detectados en zNube que todavía no existen, sin modificar registros actuales.
- Etiqueta Gmail `zNube/procesado-asistencia`: evita reprocesar correos.

El cruce conserva por separado `sucursal_app` y `puesto_control_znube`, porque no representan necesariamente lo mismo (por ejemplo, AV2/WEB frente a AVELLANEDA).
Las altas automáticas de PADRON completan código, nombre y rol. `sucursal_base`, `horario_teorico_entrada` y `ESTADO` quedan vacíos para revisión administrativa.

## Instalación

1. Ingresar a la planilla `ASISTENCIA_RIO` con `administracion@lenceriario.com`.
2. Abrir **Extensiones > Apps Script**.
3. No modificar ni reemplazar el `Code.gs` productivo. Crear un archivo nuevo con **+ > Secuencia de comandos**, llamarlo `ZnubeImporter` y pegar allí `ZnubeImporter.gs`.
4. En **Configuración del proyecto**, activar la visualización del archivo de manifiesto y copiar `appsscript.json`.
5. En **Servicios**, confirmar que esté agregado **Drive API**.
6. Ejecutar manualmente `instalarImportadorZnube` y aceptar los permisos.

La instalación crea un disparador cada 15 minutos y ejecuta una primera importación. El script busca los últimos 30 días, por lo que permite recuperar correos recientes ya existentes.

## Operación y recuperación

- Si un correo falla, queda etiquetado `zNube/error-asistencia` y el detalle aparece en `ZNUBE_IMPORT_LOG`.
- Para reintentar, quitar esa etiqueta del hilo y ejecutar `importarFichajesZnube`.
- La clave anti-duplicado es `fecha + legajo + hora + puesto de control`.
- Los PDF se convierten temporalmente a Google Docs mediante OCR y el documento temporal se elimina al terminar.

## Supuestos del reporte

El parser espera filas con este orden: fecha, día de semana, puesto de control, legajo numérico, nombre, hora `HH:mm:ss` y perfil opcional. Si zNube cambia el diseño del reporte, el correo quedará en error sin insertar datos parciales silenciosamente.
