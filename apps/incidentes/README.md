# Centro de incidentes

Aplicación independiente para registrar y consultar problemas internos. No está enlazada desde el `index.html` principal.

## Estado actual

- Funciona inmediatamente en modo local (`localStorage`).
- Recuerda la sucursal y también reconoce las claves usadas por otras apps de RIO.
- Permite imágenes, videos, PDF y documentos (máximo 6 archivos, 10 MB por archivo).
- Incluye filtros, métricas, detalle y prioridades.
- El pedido de etiquetas puede realizarse sin baja; cuando se informan códigos para dar de baja genera dos incidentes vinculados.
- Usa una Edge Function de Supabase. Los incidentes se guardan en Postgres y los adjuntos en un bucket privado de Storage.
- La app `sistemas` usa el mismo backend para asignar responsables, cambiar estados y registrar notas de seguimiento.

## Almacenamiento central

1. El esquema reproducible está en `supabase-migration.sql`.
2. La función desplegada está en `supabase-edge-function.ts` con el nombre `incidentes-api`.
3. `api-config.js` apunta a esa función. El navegador nunca recibe la clave `service_role`.

Las tablas expuestas tienen RLS habilitado y no admiten acceso de `anon` ni `authenticated`. La Edge Function es la única puerta de entrada, aplica validaciones, límites de solicitudes y entrega enlaces temporales para los adjuntos privados.
