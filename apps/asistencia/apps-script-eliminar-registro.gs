/*********************************************************
 * ASISTENCIA_RIO - parche para eliminar registros
 *
 * Este archivo esta preparado para el Apps Script completo
 * que empieza con:
 * "ASISTENCIA_RIO - Web App UNICO (con adjunto a Drive)"
 *********************************************************/

/*
 * 1) En leerEventosHoy_(), dentro del out.push({...}), agregar:
 *
 *   rowNumber: r + 1,
 *
 * Ejemplo:
 *
 *   out.push({
 *     rowNumber: r + 1,
 *     fecha_operativa: fechaISO,
 *     sucursal: suc,
 *     ...
 *   });
 */

/*
 * 2) En doPost(e), reemplazar este bloque:
 *
 *   var data = JSON.parse(raw);
 *   if (String(data.accion || "") !== "registrar") {
 *     return jsonErr_("Accion POST no reconocida");
 *   }
 *
 * por este:
 *
 *   var data = JSON.parse(raw);
 *   var accion = String(data.accion || "").trim().toLowerCase();
 *   if (accion === "eliminar_registro") {
 *     return eliminarRegistroAsistencia_(data);
 *   }
 *   if (accion !== "registrar") {
 *     return jsonErr_("Accion POST no reconocida");
 *   }
 */

function eliminarRegistroAsistencia_(data) {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_EVENTOS);
  if (!sh) return jsonErr_("No existe la pestana EVENTOS");

  ensureHeadersEventos_(sh);

  var rowNumber = Number(data.rowNumber || data.row_number || data.fila || 0);
  if (rowNumber >= 2 && rowNumber <= sh.getLastRow()) {
    var rowValues = sh.getRange(rowNumber, 1, 1, sh.getLastColumn()).getValues()[0];
    if (!filaCoincideConRegistro_(sh, rowValues, data)) {
      return jsonErr_("La fila indicada no coincide con el registro actual. Refresca la lista e intenta otra vez.");
    }

    mandarComprobanteAPapelera_(sh, rowValues);
    sh.deleteRow(rowNumber);
    return jsonOk_({ ok: true, deletedRow: rowNumber });
  }

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return jsonErr_("No hay registros para eliminar.");

  var values = sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    if (filaCoincideConRegistro_(sh, values[r], data)) {
      mandarComprobanteAPapelera_(sh, values[r]);
      sh.deleteRow(r + 1);
      return jsonOk_({ ok: true, deletedRow: r + 1 });
    }
  }

  return jsonErr_("No se encontro un registro que coincida para eliminar.");
}

function filaCoincideConRegistro_(sh, row, data) {
  var headers = getHeadersEventos_(sh);

  var fecha = getByHeader_(row, headers, "fecha_operativa");
  var sucursal = getByHeader_(row, headers, "sucursal");
  var vendedorId = getByHeader_(row, headers, "vendedor_id");
  var tipoEvento = getByHeader_(row, headers, "tipo_evento");
  var hora = getByHeader_(row, headers, "hora_declarada");
  var obs = getByHeader_(row, headers, "observacion");

  return asISODate_(fecha) === String(data.fecha_operativa || data.fecha || "").trim()
    && normalizeSucursal_(sucursal) === normalizeSucursal_(data.sucursal || data.local)
    && String(vendedorId || "").trim() === String(data.vendedor_id || data.id || "").trim()
    && String(tipoEvento || "").trim().toUpperCase() === String(data.tipo_evento || data.tipo || "").trim().toUpperCase()
    && formatHora_(hora) === String(data.hora_declarada || data.hora || "").trim()
    && String(obs || "").trim() === String(data.observacion || data.obs || "").trim();
}

function mandarComprobanteAPapelera_(sh, row) {
  try {
    var headers = getHeadersEventos_(sh);
    var fileId = String(getByHeader_(row, headers, "comprobante_file_id") || "").trim();
    if (!fileId) return;
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // El borrado del registro no debe fallar si el archivo ya no existe o no hay permisos.
  }
}

function getHeadersEventos_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var out = {};
  for (var i = 0; i < headers.length; i++) {
    out[String(headers[i] || "").trim().toLowerCase()] = i;
  }
  return out;
}

function getByHeader_(row, headers, name) {
  var idx = headers[String(name || "").trim().toLowerCase()];
  return idx == null ? "" : row[idx];
}
