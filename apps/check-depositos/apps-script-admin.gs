/*********************************************************
 * CHECK DEPOSITOS - RIO
 * Apps Script independiente para Administracion
 *
 * No reemplaza ni modifica la API de carga de depositos.
 * Lee la misma planilla y expone acciones administrativas:
 * - GET  ?accion=listar_depositos
 * - POST { accion:"confirmar_deposito", id, rowNumber }
 * - POST { accion:"actualizar_deposito", id, rowNumber, monto, cuenta }
 *********************************************************/

const SPREADSHEET_ID = "1wG31SpvkNftOmwpT0k6b3MwlkHxjKcC00gQuetTSMNg";
const SHEET_NAME = "DEPOSITOS";
const TIMEZONE = "America/Argentina/Buenos_Aires";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);

    if (accion === "ping") {
      return jsonOut({
        ok: true,
        app: "check-depositos",
        ts: new Date().toISOString()
      });
    }

    if (accion === "listar_depositos") {
      return getDepositos_(e);
    }

    return jsonOut({
      ok: true,
      app: "check-depositos",
      msg: "API check depositos activa"
    });

  } catch (err) {
    Logger.log("ERROR doGet check-depositos: " + (err.stack || err.message || err));
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

    if (accion === "confirmar_deposito") {
      return confirmarDeposito_(data);
    }

    if (accion === "actualizar_deposito") {
      return actualizarDeposito_(data);
    }

    return jsonOut({
      ok: false,
      error: "Accion no reconocida"
    });

  } catch (err) {
    Logger.log("ERROR doPost check-depositos: " + (err.stack || err.message || err));
    return jsonOut({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function getDepositos_(e) {
  const sh = getSheet_();
  asegurarCabeceras_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    return jsonOut({
      ok: true,
      data: [],
      total: 0
    });
  }

  const totalRows = lastRow - 1;
  const values = sh.getRange(2, 1, totalRows, 8).getValues();
  const displayValues = sh.getRange(2, 1, totalRows, 8).getDisplayValues();

  let richLinks = [];
  try {
    richLinks = sh.getRange(2, 6, totalRows, 1).getRichTextValues();
  } catch (_) {
    richLinks = Array.from({ length: totalRows }, function() { return [null]; });
  }

  const estadoFiltro = cleanStr(e && e.parameter && e.parameter.estado).toUpperCase();
  const localFiltro = cleanStr(e && e.parameter && e.parameter.local).toUpperCase();
  const cuentaFiltro = cleanStr(e && e.parameter && e.parameter.cuenta);
  const out = [];

  for (let i = 0; i < values.length; i++) {
    try {
      const row = values[i];
      const rowDisplay = displayValues[i];
      const id = cleanStr(rowDisplay[0]);

      if (!id) continue;

      const fecha = parseFechaFlexible_(row[1], rowDisplay[1]);
      const fechaTexto = fecha && !isNaN(fecha.getTime())
        ? Utilities.formatDate(fecha, TIMEZONE, "dd-MM-yyyy HH:mm:ss")
        : cleanStr(rowDisplay[1]);

      const local = cleanStr(rowDisplay[2]).toUpperCase();
      const monto = String(rowDisplay[3] || "");
      const cuenta = cleanStr(rowDisplay[4]);
      const observacion = cleanStr(rowDisplay[6]);
      const estado = normalizarEstado(rowDisplay[7]);

      if (estadoFiltro && estado !== estadoFiltro) continue;
      if (localFiltro && local !== localFiltro) continue;
      if (cuentaFiltro && cuenta !== cuentaFiltro) continue;

      let linkUrl = "";
      try {
        const rich = richLinks[i] && richLinks[i][0] ? richLinks[i][0] : null;
        linkUrl = rich && typeof rich.getLinkUrl === "function" ? (rich.getLinkUrl() || "") : "";
      } catch (_) {
        linkUrl = "";
      }

      out.push({
        rowNumber: i + 2,
        id: id,
        fecha: fechaTexto,
        local: local,
        monto: monto,
        cuenta: cuenta,
        link: linkUrl,
        observacion: observacion,
        estado: estado
      });

    } catch (rowErr) {
      Logger.log("Error leyendo deposito fila " + (i + 2) + ": " + (rowErr.message || rowErr));
    }
  }

  out.sort(function(a, b) {
    const da = parseFechaFlexible_(null, a.fecha);
    const db = parseFechaFlexible_(null, b.fecha);
    const ta = da && !isNaN(da.getTime()) ? da.getTime() : 0;
    const tb = db && !isNaN(db.getTime()) ? db.getTime() : 0;
    return tb - ta;
  });

  return jsonOut({
    ok: true,
    data: out,
    total: out.length
  });
}

function confirmarDeposito_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sh = getSheet_();
    asegurarCabeceras_(sh);

    const id = cleanStr(data.id);
    let rowNumber = Number(data.rowNumber || 0);

    if (!rowNumber && id) {
      rowNumber = buscarFilaPorId_(sh, id);
    }

    if (!rowNumber || rowNumber < 2 || rowNumber > sh.getLastRow()) {
      return jsonOut({
        ok: false,
        error: "No se encontro el deposito para confirmar"
      });
    }

    const idEnFila = cleanStr(sh.getRange(rowNumber, 1).getDisplayValue());
    if (id && idEnFila && idEnFila !== id) {
      return jsonOut({
        ok: false,
        error: "La fila encontrada no coincide con el ID enviado"
      });
    }

    sh.getRange(rowNumber, 8).setValue("CONFIRMADO");

    return jsonOut({
      ok: true,
      id: id || idEnFila,
      rowNumber: rowNumber,
      estado: "CONFIRMADO"
    });

  } finally {
    lock.releaseLock();
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
    let rowNumber = Number(data.rowNumber || 0);

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

function parseFechaFlexible_(rawValue, displayValue) {
  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
    return rawValue;
  }

  const txt = cleanStr(displayValue || rawValue);
  if (!txt) return null;

  let m = txt.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6])
    );
  }

  m = txt.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6])
    );
  }

  const intento = new Date(txt);
  if (!isNaN(intento.getTime())) return intento;

  return null;
}

function normalizarEstado(value) {
  const estado = cleanStr(value).toUpperCase();
  return estado === "CONFIRMADO" ? "CONFIRMADO" : "PENDIENTE";
}

function cleanStr(v) {
  return String(v == null ? "" : v).trim();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
