# Stock para proveedores

Disponible en Depósito con Supervisión activa. Reutiliza la API de Equiparación de Stock. Suma algebraicamente todas las entradas de `branches` de la fuente, sin una lista fija de locales ni recorte de negativos. No incorpora sistemas o bases que esa API no entregue. La pantalla identifica sucursales y fecha del reporte.

Consolida proveedor + código + color + talle. Artículo es `code` y se mantiene como texto para preservar ceros iniciales. Orden natural ascendente para código y talle; color alfabético. Los talles con letras siguen orden alfanumérico, no una curva comercial.

Selección múltiple, grupos GrupoBK y Anderessa precargados, grupos personalizados guardados en este navegador. La coincidencia de proveedores ignora tildes, mayúsculas y puntuación; los integrantes ausentes se muestran explícitamente. El filtro inicial exporta solo stock neto mayor a cero; se puede desactivar para incluir cero y negativos.

Excel real `.xlsx`, una hoja por proveedor, cinco columnas, nombres de hojas válidos y únicos, filtros y anchos configurados. La vista previa muestra hasta 200 variantes; la descarga incluye todas las filtradas. SheetJS se sirve localmente desde `assets/vendor` con su licencia. No escribe stock ni ejecuta movimientos.

Verificación: `node --test tools/test-stock-proveedores.cjs tools/test-rio-context.cjs`.

Carga manual principal: .xls o .xlsx con Nombre, Artículo, Color descripción, Talle y Cantidad. Las descripciones del archivo se preservan completas. Se consolida la cantidad por variante y se rechazan hojas sin columnas requeridas o cantidades inválidas. Cada archivo reemplaza el reporte anterior, sin mezclarse con la API. Fecha inferida del nombre del archivo cuando está presente. La consulta API queda disponible mediante un botón explícito.

Comparativos: acepta Nombre Proveedor, Artículo, Descripción Colores (original), Talle, Stock Actual y Cant. Vend. Conserva ventas netas, incluidos negativos. Antes de exportar se elige solo stock o stock y ventas. El período se declara y confirma por el usuario porque el comparativo no contiene fechas individuales. Último mes cerrado, 30 días incluidos hoy, y mes actual hasta hoy se calculan con fecha de Buenos Aires. No se recalculan períodos desde cantidades agregadas. La API automática no permite incluir ventas hasta conocer su período.
