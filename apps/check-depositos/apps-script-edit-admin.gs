/*********************************************************
 * EDITAR DEPOSITOS - RIO
 * Apps Script independiente para Administracion
 *
 * No reemplaza la API de carga ni la API de check/listado.
 * Lee la misma planilla y permite corregir monto/cuenta:
 * - GET  ?accion=ping
 * - POST { accion:"actualizar_deposito", id, rowNumber, monto, cuenta }
 *********************************************************/

const SPREADSHEET_ID = "1wG31SpvkNftOmwpT0k6b3MwlkHxjKcC00gQuetTSMNg";
const SHEET_NAME = "DEPOSITOS";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);

    if (accion === "ping") {
      return jsonOut({
        ok: true,
        app: "editar-depositos",
        ts: new Date().toISOString()
      });
    }

    return jsonOut({
      ok: true,
      app: "editar-depositos",
      msg: "API editar depositos activa"
    });

  } catch (err) {
    Logger.log("ERROR doGet editar-depositos: " + (err.stack || err.message || err));
    return jsonOut({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const accion = cleanStr(data.accion);

    if (accion === "actualizar_deposito" || accion === "editar_deposito") {
      return actualizarDeposito_(data);
    }

    return jsonOut({
      ok: false,
      error: "Accion no reconocida: " + accion
    });

  } catch (err) {
    Logger.log("ERROR doPost editar-depositos: " + (err.stack || err.message || err));
    return jsonOut({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function actualizarDeposito_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sh = getSheet_();
    asegurarCabeceras_(sh);

    const id = cleanStr(data.id);
    const monto = cleanStr(data.monto);
    const cuenta = cleanStr(data.cuenta);
    let rowNumber = Number(data.rowNumber || data.fila || 0);

    if (!monto) {
      return jsonOut({ ok: false, error: "Falta monto" });
    }

    if (!cuenta) {
      return jsonOut({ ok: false, error: "Falta cuenta" });
    }

    if (!rowNumber && id) {
      rowNumber = buscarFilaPorId_(sh, id);
    }

    if (!rowNumber || rowNumber < 2 || rowNumber > sh.getLastRow()) {
      return jsonOut({
        ok: false,
        error: "No se encontro el deposito para actualizar"
      });
    }

    const idEnFila = cleanStr(sh.getRange(rowNumber, 1).getDisplayValue());
    if (id && idEnFila && idEnFila !== id) {
      return jsonOut({
        ok: false,
        error: "La fila encontrada no coincide con el ID enviado"
      });
    }

    sh.getRange(rowNumber, 4).setValue(monto);
    sh.getRange(rowNumber, 5).setValue(cuenta);

    return jsonOut({
      ok: true,
      id: id || idEnFila,
      rowNumber: rowNumber,
      monto: monto,
      cuenta: cuenta
    });

  } finally {
    lock.releaseLock();
  }
}

function buscarFilaPorId_(sh, id) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (cleanStr(ids[i][0]) === id) {
      return i + 2;
    }
  }

  return 0;
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    throw new Error("No existe la hoja " + SHEET_NAME);
  }
  return sh;
}

function asegurarCabeceras_(sh) {
  const headers = ["ID", "FECHA", "LOCAL", "MONTO", "CUENTA", "LINK", "OBSERVACION", "ESTADO"];
  const current = sh.getRange(1, 1, 1, headers.length).getValues()[0];

  const needsHeaders = headers.some(function(h, i) {
    return String(current[i] || "").trim() !== h;
  });

  if (needsHeaders) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function cleanStr(v) {
  return String(v == null ? "" : v).trim();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
