# Control de cajas locales
Aplicación de consulta en Administración. El mes actual se selecciona usando America/Argentina/Buenos_Aires. El primer día del mes incluye el último día del mes anterior, identificado en cada ficha. Se puede navegar por mes y filtrar una sucursal.

Las fichas muestran fecha, responsable, efectivo contado y venta sin envíos (Shipnow y Expreso). Avellaneda compartida muestra la venta LOCAL y el efectivo físico total; WEB tiene venta propia pero ningún efectivo físico independiente, evitando duplicar el cajón.

La lista pide sólo metadatos y totales a admin_list. admin_get consulta la planilla completa al abrir su ficha. No hay operaciones de edición ni guardado en esta aplicación. La consulta completa incluye movimientos, cuentas, firmas, legajos, observaciones, importes y la versión WEB incorporada en Avellaneda. Si el cierre WEB del listado tiene otra versión, se advierte que el detalle de Avellaneda usa su snapshot guardado.

Acceso: misma sesión de Administración de la suite. RioContext restringe menú y URL directa a ese perfil con acceso vigente. La API exige branch=ADMINISTRACION para las acciones de consulta administrativa. Se conserva el esquema de acceso existente de la primera etapa: la selección de perfil y la clave de supervisión del frontend no constituyen autenticación de servidor ni autorización privada real. RLS sigue denegando acceso directo y el service role sólo está en la función. Se requiere autenticación real si más adelante los cierres deben ser privados por persona.

Verificación: pruebas de rangos mensuales (incluyendo enero, cambio de año y febrero bisiesto), separación de LOCAL/WEB y acceso de perfiles. Consultas reales de listado y detalle sin altas ni cambios a registros. Vista de escritorio y móvil a 390 px. Las tablas completas se desplazan dentro del diálogo.
