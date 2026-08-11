# Margenes automaticos

La web conserva la carga manual y, cuando `api-config.js` tiene una URL, carga automaticamente el ultimo JSON generado desde Gmail.

## Configuracion de Google Apps Script

1. Crear un proyecto en [script.google.com](https://script.google.com/) usando la misma cuenta que recibe el correo.
2. Copiar el contenido de `apps-script.gs` en el editor.
3. En **Configuracion del proyecto**, fijar la zona horaria en `America/Argentina/Buenos_Aires`.
4. Ejecutar una vez `instalarMargenes` y aceptar permisos de Gmail, Drive y triggers.
5. Ir a **Implementar > Nueva implementacion > Aplicacion web**.
6. Elegir **Ejecutar como: yo** y permitir acceso a quien corresponda para la web interna.
7. Copiar la URL terminada en `/exec` dentro de `api-config.js`.

El trigger se ejecuta diariamente cerca de las 22:30. Busca el ultimo correo del mes en curso, procesa su CSV acumulativo y reemplaza `margenes_reporte_actual.json` en la carpeta de Drive `Rio - Margenes automaticos`.

Antes de guardar el JSON se consolidan los datos: el reporte de locales contiene una fila por local y el de proveedor una fila por combinacion `Discontinuidad + Grupo + Nombre`. Cantidad, costo, venta y ganancia se suman; el porcentaje se calcula nuevamente como `ganancia total / costo total`.

En el reporte de proveedores se elimina el codigo inicial de `Discontinuidad`, `Grupo` y `Nombre`, tomando el primer espacio como separador. Los proveedores se ordenan por venta total descendente, sus detalles quedan juntos y cada bloque termina con `Subtotal 2:`. El porcentaje se muestra en el subtotal y se calcula como `ganancia total del proveedor / costo total del proveedor`.

## Consolidador de locales

- Avellaneda 3249: `AV2`, `PRUAV2`
- Nazca: `AV1`, `PRUAV1`
- Web: `WEB`, `PRUWEB`
- Lamarca: `LAMARCA`/`LAMAR`, `PRULAMAR`
- Corrientes: `CORRIENT`/`CORRIEN`, `PRUCORRI`
- Castelli: `CASTELLI`/`CASTE`, `PRUCASTE`
- Pueyrredon: `PUEY`, `PRUPUEY`
- Quilmes: `QUILMES`/`QUILM`, `PRUQUILM`
- Sarmiento: `ONCE`, `PRUONCE`

## Diagnostico

- `URL/exec?accion=ping`: confirma que la API responde.
- `URL/exec?accion=actualizar`: fuerza una lectura de Gmail.
- `URL/exec?accion=reporte`: devuelve el JSON que consume la web.

Si la API no esta configurada o falla, la pantalla sigue permitiendo cargar Excel/CSV manualmente.
