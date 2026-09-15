# Equiparación de Stock

Migrada desde Rio-tools.zip. Disponible en la suite solo con perfil DEPOSITO y sesión de Supervisión activa. El mismo control se aplica al catálogo, portada, búsqueda y entrada directa; la aplicación no consulta la API si no cumple ambas condiciones. Se utiliza el mecanismo de sesión del navegador existente de la suite, no autenticación nueva del servidor.

Conserva exactamente normalize, targets y compute de la aplicación original. La prioridad de mínimo 5 en Avellaneda + Web puede tomar unidades de los locales con reserva de línea; no se cambió esa regla.

La API configurada entrega los reportes diarios. No hay fallback a datos de muestra ni dependencia de la aplicación Stock & Ventas. Una falla de carga deshabilita la exportación y limpia el resultado. Mostrar más incorpora 20 variantes adicionales; la exportación incluye todos los resultados filtrados, excepto los movimientos desmarcados, no solo los visibles. Solo genera propuestas y CSV: no ejecuta movimientos ni escribe en el stock remoto.

Verificación: `node --test tools/test-revision-stock.cjs tools/test-rio-context.cjs`.
