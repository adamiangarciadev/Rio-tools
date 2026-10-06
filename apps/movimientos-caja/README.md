# Movimientos de caja

Aplicación estática de Operaciones, basada en `M. Diarios Avellaneda 2900.pdf`. Proyecto Supabase independiente: `xdccttfqcorxpskmpmwn`, São Paulo. El proyecto anterior no fue modificado.

## Uso

Elegir sucursal desde el inicio de RÍO Tools. Cargar fecha, responsable y movimientos; guardar y recuperar desde Historial. Una planilla por sucursal y fecha. Nueva planilla empieza un formulario vacío. Los borradores se conservan por sucursal en el navegador; sólo Guardar confirma persistencia remota.

Depósitos desde caja descuentan efectivo; transferencias externas son informativas y deben estar incluidas en su medio de cobro. El total de envíos Shipnow y Expreso, tanto efectivo como depósito/MP, se descuenta de Venta final. Vales en efectivo descuentan caja; vales en mercadería se suman a la venta. Gastos se consideran pagados desde caja.

Sobrante/faltante: efectivo contado menos esperado. Venta final: efectivo reconstruido + MP + tarjetas + Go Cuotas + vales en mercadería - sobrante + faltante - envíos. El efectivo reconstruido recupera las salidas de caja. No se cargan ni se usan saldo inicial ni otros ingresos de efectivo. Antes de cerrar se debe ingresar el F9 de Dragon en la esquina superior izquierda. Ese valor se muestra como Venta total. La venta en efectivo se deriva del F9 menos MP, tarjetas, Go Cuotas y vales en mercadería. El F9 es obligatorio al guardar e imprimir; se permite guardar e imprimir aunque los medios de pago y vales superen el F9, reflejando la diferencia en el arqueo. Las planillas anteriores sin F9 conservan su cálculo histórico hasta ser editadas. El cruce con venta diaria queda para otra etapa.

## Acceso de esta etapa

Por pedido del usuario, acceso directo sin contraseña. Cualquier persona que pueda abrir la app y seleccionar una sucursal puede consultar y guardar esa sucursal. La selección de local organiza datos, no autentica personas. No existe sesión anónima de Supabase Auth: la API usa la clave pública anónima para pasar la validación JWT del gateway. Las tablas tienen RLS con denegación explícita y sin permisos para anon/authenticated; sólo la Edge Function accede con clave de servidor. La clave de servidor nunca aparece en el navegador. Agregar autenticación por usuario y autorización real antes de requerir privacidad entre locales.

## Base y API

`schema.sql` reproduce el esquema final. `api.ts` está desplegada como `movimientos-caja-api` con verify_jwt=true. CORS acepta GitHub Pages del repositorio y preview local 8765. Validación de importes y recálculo en trigger de PostgreSQL; la API no recibe totales del cliente. Versiones previenen sobrescrituras entre equipos (409); índice único previene duplicados por fecha (23505). No hay endpoint de borrado.

## Verificación

`node --test tools/test-movimientos-caja.cjs`. Verificado guardado, consulta, actualización, total de servidor y conflicto de versión desde navegador; impresión A4 de una planilla completa en una página y diseño móvil a 390 px. Las tablas anchas se desplazan horizontalmente en móvil. Datos de prueba eliminados. Frontend publicado en GitHub Pages, dentro de Operaciones.

## Montos y responsables

Los montos se muestran con puntos para miles y coma para centavos (1.234.567,50); se guardan como números y no tienen controles de incremento. Responsable se elige por legajo o nombre del mismo endpoint y caché de Asistencia (padron_all); sólo se ofrecen legajos activos. Se guarda responsibleCode junto al nombre. La API consulta padron por id y reemplaza el nombre por el oficial antes de guardar. Si el padrón está caído se muestra la caché reciente, pero el guardado requiere validación online.

## Vales, conceptos y mayúsculas

Los vales se seleccionan del padrón activo de Asistencia y guardan staffCode con el nombre oficial. La API valida responsable y vales con padron_all en una sola consulta. Gastos usa los 19 conceptos de rules.js; VIATICO, PAGO A, DESAYUNO y ALMUERZO requieren person y componen el detalle impreso. Los textos humanos se convierten a mayúsculas en pantalla, borrador y API; códigos, enums internos e importes conservan su formato técnico. Las planillas antiguas mantienen el detalle histórico, pero al editar gastos o vales se debe seleccionar concepto/legajo.

## Vista de carga

Navegación por tres pasos con todas las secciones accesibles: datos, movimientos y revisión. Secciones vacías con ayuda y contador de registros; en móvil las filas se convierten en tarjetas con etiquetas. Barra inferior con venta final y acciones de guardar/imprimir, sincronizada con los botones originales. Los elementos de UX se ocultan al imprimir y los estilos de pantalla no modifican la planilla A4. Verificación visual a 1280 y 390 px, sin desborde horizontal, cálculos y campos probados, error de responsable visible desde la acción inferior.

## Caja física AV2 + WEB
WEB guarda sólo sus movimientos y no cuenta el efectivo físico. AV2 incorpora la versión WEB de la misma fecha; puede ingresar F9 LOCAL o F9 TOTAL LOCAL + WEB. Los cobros y movimientos cargados en AV2 siempre son sólo LOCAL. Se cuenta una vez el efectivo físico total en AV2. El resumen separa LOCAL / WEB / TOTAL y muestra el arqueo compartido; no atribuye el faltante a una unidad. La impresión incluye el detalle WEB incorporado.
Si WEB cambia, AV2 conserva la versión incorporada y debe actualizarla explícitamente antes de guardar/imprimir. Supabase comprueba y bloquea la referencia WEB durante el guardado. Históricos anteriores siguen independientes salvo incorporación explícita. El acceso WEB fue habilitado en rio-context. shared-schema.sql contiene el incremento aplicado al proyecto independiente.

## Impresión por sucursal
WEB sólo guarda: no tiene acciones de impresión y el guardado no llama a window.print. AV2 guarda e imprime tras un guardado exitoso sin cambios pendientes; conserva además Imprimir independiente. La impresión usa la estructura anterior de la planilla (logo, datos, gastos, vales, retiros, depósitos y dos paneles inferiores), sin el dashboard LOCAL / WEB / TOTAL. Integra filas LOCAL y WEB con su origen identificado. En el encabezado figuran F9 TOTAL AVELLANEDA LOCAL y F9 TOTAL WEB, independientemente del modo de F9 elegido; las tarjetas también se separan. Verificado con exportación de navegador de una página para un cierre breve y simulación de respuestas de guardado para ambos perfiles; sin altas de prueba en Supabase en esta revisión.
