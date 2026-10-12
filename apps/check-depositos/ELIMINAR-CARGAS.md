# Eliminar cargas duplicadas o incorrectas

El boton `Eliminar carga` permite seleccionar un registro concreto y confirmar local, fecha, cuenta, monto y estado. No detecta ni elimina duplicados automaticamente.

La accion `eliminar_deposito` marca esa fila con `ESTADO = ELIMINADO`. Conserva sus datos y el comprobante en Drive. No borra filas ni desplaza sus numeros. El listado, los contadores y la imagen de pendientes excluyen los registros eliminados.

El backend exige ID, numero de fila y los valores que vio el usuario. Si cambiaron, rechaza la operacion y solicita actualizar el listado. Confirmar o editar una fila eliminada tambien se rechaza.

## Activacion

1. Actualizar el proyecto administrativo usado por `CHECK_DEPOSITOS_API_URL` con `apps-script-admin.gs`. Listado, confirmacion, edicion y eliminacion usan esa misma API. La configuracion antigua de edicion ya no se usa en Check Depositos.
2. Publicar una nueva version de la implementacion existente, manteniendo su URL. No reemplazar la API que usan los locales para cargar depositos.
3. Publicar `app.js`, `index.html` y `styles.css` de Check Depositos una vez actualizado el backend.
4. Verificar con una carga de prueba que cancelar conserve el registro, eliminar quite solo la fila elegida y actualizar no la vuelva a mostrar.

No se modificaron registros reales durante las pruebas. Se verifico con datos simulados y una planilla en memoria.

El backend acepta el esquema original de ocho columnas y el esquema con DNI de nueve columnas. Valida sus cabeceras sin escribirlas ni insertar columnas. Una cabecera desconocida devuelve un error antes de modificar datos. No instalar migraciones automaticas en una planilla compartida con otras APIs.

## Recuperacion

En la planilla `DEPOSITOS`, cambiar el estado de la fila eliminada a `PENDIENTE` o a su estado anterior. Actualizar Check Depositos. El archivo adjunto permanece disponible.

## Prueba del backend

Desde la raiz del repositorio: `node tools/test-check-depositos-delete.cjs`.
