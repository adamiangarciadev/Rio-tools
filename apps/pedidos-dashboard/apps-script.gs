/*********************************************************
 * DASHBOARD PEDIDOS - RIO
 * Apps Script independiente y solo lectura.
 *
 * Fuente:
 * https://docs.google.com/spreadsheets/d/1nzP_vqgJ8ZP_MZZtLBWj8mynYXb2MylwJXSv8hwz9UU
 *
 * Acciones:
 * - GET ?accion=listar_log
 * - GET ?accion=ping
 *********************************************************/

const SPREADSHEET_ID = "1nzP_vqgJ8ZP_MZZtLBWj8mynYXb2MylwJXSv8hwz9UU";
const SHEET_NAME = "Pedidos_LOG";
const TIMEZONE = "America/Argentina/Buenos_Aires";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);

    if (accion === "ping") {
      return jsonOut({
        ok: true,
        app: "pedidos-dashboard",
        ts: new Date().toISOString()
      });
    }

    if (accion === "listar_log") {
      return listarLog_(e);
    }

    return jsonOut({
      ok: true,
      app: "pedidos-dashboard",
      msg: "API pedidos dashboard activa"
    });

  } catch (err) {
    Logger.log("ERROR pedidos-dashboard: " + (err.stack || err.message || err));
    return jsonOut({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function listarLog_(e) {
  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  const lastCol = Math.max(10, sh.getLastColumn());

  if (lastRow < 2) {
    return jsonOut({
      ok: true,
      data: [],
      total: 0
    });
  }

  const maxRows = Number(e && e.parameter && e.parameter.maxRows) || 8000;
  const totalRows = Math.min(lastRow - 1, maxRows);
  const startRow = Math.max(2, lastRow - totalRows + 1);
  const values = sh.getRange(startRow, 1, totalRows, lastCol).getValues();
  const displayValues = sh.getRange(startRow, 1, totalRows, lastCol).getDisplayValues();
  const out = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowDisplay = displayValues[i];
    const fecha = parseFecha_(row[0], rowDisplay[0]);
    const fechaTexto = fecha
      ? Utilities.formatDate(fecha, TIMEZONE, "dd/MM/yyyy HH:mm:ss")
      : cleanStr(rowDisplay[0]);

    const idPedido = cleanStr(rowDisplay[3]);
    const sucursal = cleanStr(rowDisplay[4]);
    const estadoActual = cleanStr(rowDisplay[6]);

    if (!fechaTexto && !idPedido && !sucursal && !estadoActual) continue;

    out.push({
      rowNumber: startRow + i,
      fecha: fechaTexto,
      modificadoPor: cleanStr(rowDisplay[1]),
      origen: cleanStr(rowDisplay[2]),
      idPedido: idPedido,
      sucursal: sucursal,
      estadoPrevio: cleanStr(rowDisplay[5]),
      estadoActual: estadoActual,
      tipoEnvio: cleanStr(rowDisplay[7]),
      web: cleanStr(rowDisplay[8]),
      comoSeModifico: cleanStr(rowDisplay[9])
    });
  }

  out.sort(function(a, b) {
    const da = parseFecha_(null, a.fecha);
    const db = parseFecha_(null, b.fecha);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    return tb - ta;
  });

  return jsonOut({
    ok: true,
    data: out,
    total: out.length,
    sourceRows: lastRow - 1
  });
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    throw new Error("No existe la hoja " + SHEET_NAME);
  }
  return sh;
}

function parseFecha_(rawValue, displayValue) {
  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
    return rawValue;
  }

  const text = cleanStr(displayValue || rawValue);
  if (!text) return null;

  let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    );
  }

  m = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    );
  }

  const intento = new Date(text);
  return isNaN(intento.getTime()) ? null : intento;
}

function cleanStr(value) {
  return String(value == null ? "" : value).trim();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
