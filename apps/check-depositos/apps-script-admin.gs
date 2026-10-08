/*********************************************************
 * CHECK DEPOSITOS - RIO
 * API administrativa: listar, confirmar, editar y eliminar.
 * Valida el esquema existente; nunca migra ni inserta columnas.
 *********************************************************/
const SPREADSHEET_ID = "1wG31SpvkNftOmwpT0k6b3MwlkHxjKcC00gQuetTSMNg";
const SHEET_NAME = "DEPOSITOS";
const TIMEZONE = "America/Argentina/Buenos_Aires";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);
    if (accion === "listar_depositos") return getDepositos_(e);
    return jsonOut({ ok: true, app: "check-depositos", version: "schema-preserved-v3", ts: new Date().toISOString() });
  } catch (err) { return jsonOut({ ok: false, error: err.message || String(err) }); }
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (data.accion === "confirmar_deposito") return confirmarDeposito_(data);
    if (data.accion === "actualizar_deposito") return actualizarDeposito_(data);
    if (data.accion === "eliminar_deposito") return eliminarDeposito_(data);
    return jsonOut({ ok: false, error: "Accion no reconocida" });
  } catch (err) { return jsonOut({ ok: false, error: err.message || String(err) }); }
}

function esquema_(sh) {
  const legacy = ["ID", "FECHA", "LOCAL", "MONTO", "CUENTA", "LINK", "OBSERVACION", "ESTADO"];
  const withDni = ["ID", "FECHA", "LOCAL", "DNI CLIENTE", "MONTO", "CUENTA", "LINK", "OBSERVACION", "ESTADO"];
  const headers = sh.getRange(1, 1, 1, 9).getDisplayValues()[0].map(cleanStr);
  const expected = headers[3] === "DNI CLIENTE" ? withDni : legacy;
  if (!expected.every(function(name, i) { return headers[i] === name; })) {
    throw new Error("Las columnas de DEPOSITOS no coinciden con el esquema esperado. No se modifico la planilla.");
  }
  const out = { width: expected.length };
  expected.forEach(function(name, i) { out[name] = i; });
  return out;
}

function getDepositos_(e) {
  const sh = getSheet_();
  const schema = esquema_(sh);
  const count = sh.getLastRow() - 1;
  if (count < 1) return jsonOut({ ok: true, data: [], total: 0 });
  const values = sh.getRange(2, 1, count, schema.width).getValues();
  const displayed = sh.getRange(2, 1, count, schema.width).getDisplayValues();
  const links = sh.getRange(2, schema.LINK + 1, count, 1).getRichTextValues();
  const filters = e && e.parameter || {};
  const out = [];
  displayed.forEach(function(row, i) {
    const id = cleanStr(row[schema.ID]);
    const rawEstado = cleanStr(row[schema.ESTADO]).toUpperCase();
    if (!id || rawEstado === "ELIMINADO") return;
    const fecha = parseFechaFlexible_(values[i][schema.FECHA], row[schema.FECHA]);
    const rich = links[i] && links[i][0];
    const item = {
      rowNumber: i + 2, id: id,
      fecha: fecha ? Utilities.formatDate(fecha, TIMEZONE, "dd-MM-yyyy HH:mm:ss") : cleanStr(row[schema.FECHA]),
      local: cleanStr(row[schema.LOCAL]).toUpperCase(),
      dniCliente: schema["DNI CLIENTE"] === undefined ? "" : cleanStr(row[schema["DNI CLIENTE"]]),
      monto: cleanStr(row[schema.MONTO]), cuenta: cleanStr(row[schema.CUENTA]),
      link: rich && rich.getLinkUrl() || (/^https?:\/\//i.test(cleanStr(row[schema.LINK])) ? cleanStr(row[schema.LINK]) : ""),
      observacion: cleanStr(row[schema.OBSERVACION]), estado: normalizarEstado(rawEstado)
    };
    if (!item.monto || !item.cuenta) throw new Error("Hay cargas sin monto o cuenta. Se detuvo el listado para no mostrar datos incorrectos.");
    if (filters.estado && item.estado !== cleanStr(filters.estado).toUpperCase()) return;
    if (filters.local && item.local !== cleanStr(filters.local).toUpperCase()) return;
    if (filters.cuenta && item.cuenta !== cleanStr(filters.cuenta)) return;
    out.push(item);
  });
  out.sort(function(a, b) {
    return (parseFechaFlexible_(null, b.fecha) || new Date(0)).getTime() - (parseFechaFlexible_(null, a.fecha) || new Date(0)).getTime();
  });
  return jsonOut({ ok: true, data: out, total: out.length });
}

function modificarDeposito_(data, action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_();
    const schema = esquema_(sh);
    const id = cleanStr(data.id);
    let rowNumber = Number(data.rowNumber);
    if (!rowNumber && id && action !== "eliminar_deposito") {
      const ids = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues();
      const matches = [];
      ids.forEach(function(row, i) { if (cleanStr(row[0]) === id) matches.push(i + 2); });
      if (matches.length === 1) rowNumber = matches[0];
    }
    if (!id || !Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sh.getLastRow()) {
      return jsonOut({ ok: false, error: "No se encontro la carga. Actualiza el listado." });
    }
    const row = sh.getRange(rowNumber, 1, 1, schema.width).getDisplayValues()[0];
    if (cleanStr(row[schema.ID]) !== id) return jsonOut({ ok: false, error: "La fila no coincide con el ID. Actualiza el listado." });
    const estado = cleanStr(row[schema.ESTADO]).toUpperCase();
    if (estado === "ELIMINADO") {
      if (action === "eliminar_deposito") return jsonOut({ ok: true, id: id, rowNumber: rowNumber, estado: "ELIMINADO" });
      return jsonOut({ ok: false, error: "Esta carga fue eliminada. Actualiza el listado." });
    }
    if (action === "eliminar_deposito") {
      const expected = data.expected || {};
      const dni = schema["DNI CLIENTE"] === undefined ? "" : cleanStr(row[schema["DNI CLIENTE"]]);
      if (cleanStr(row[schema.LOCAL]).toUpperCase() !== cleanStr(expected.local).toUpperCase() ||
          dni !== cleanStr(expected.dniCliente) ||
          cleanStr(row[schema.MONTO]) !== cleanStr(expected.monto) ||
          cleanStr(row[schema.CUENTA]) !== cleanStr(expected.cuenta) ||
          normalizarEstado(estado) !== cleanStr(expected.estado)) {
        return jsonOut({ ok: false, error: "La carga cambio. Actualiza antes de eliminar." });
      }
      sh.getRange(rowNumber, schema.ESTADO + 1).setValue("ELIMINADO");
      return jsonOut({ ok: true, id: id, rowNumber: rowNumber, estado: "ELIMINADO" });
    }
    if (action === "confirmar_deposito") {
      sh.getRange(rowNumber, schema.ESTADO + 1).setValue("CONFIRMADO");
      return jsonOut({ ok: true, id: id, rowNumber: rowNumber, estado: "CONFIRMADO" });
    }
    const monto = cleanStr(data.monto);
    const cuenta = cleanStr(data.cuenta);
    if (!monto || !cuenta) return jsonOut({ ok: false, error: "Falta monto o cuenta" });
    sh.getRange(rowNumber, schema.MONTO + 1).setValue(monto);
    sh.getRange(rowNumber, schema.CUENTA + 1).setValue(cuenta);
    return jsonOut({ ok: true, id: id, rowNumber: rowNumber, monto: monto, cuenta: cuenta });
  } finally { lock.releaseLock(); }
}
function confirmarDeposito_(data) { return modificarDeposito_(data, "confirmar_deposito"); }
function actualizarDeposito_(data) { return modificarDeposito_(data, "actualizar_deposito"); }
function eliminarDeposito_(data) { return modificarDeposito_(data, "eliminar_deposito"); }

function getSheet_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("No existe la hoja " + SHEET_NAME);
  return sh;
}
function parseFechaFlexible_(raw, text) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const value = cleanStr(text || raw);
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const date = match ? new Date(Number(match[3]), Number(match[2])-1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)) : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
function normalizarEstado(value) { return cleanStr(value).toUpperCase() === "CONFIRMADO" ? "CONFIRMADO" : "PENDIENTE"; }
function cleanStr(value) { return String(value == null ? "" : value).trim(); }
function jsonOut(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
