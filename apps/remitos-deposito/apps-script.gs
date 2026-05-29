/*********************************************************
 * REMITOS DEPOSITO - RIO
 *
 * Backend JSON en Google Drive para remitos manuales.
 *
 * Configuracion:
 * 1. Crear una carpeta en Drive para el backup.
 * 2. Pegar el ID de carpeta en JSON_FOLDER_ID.
 * 3. Publicar como Web App con acceso para usuarios autorizados.
 * 4. Copiar la URL publicada en apps/remitos-deposito/api-config.js.
 *
 * Acciones:
 * - GET  ?accion=ping
 * - GET  ?accion=store
 * - POST { accion:"guardar_cliente", cliente:{...} }
 * - POST { accion:"guardar_remito", remito:{...} }
 *********************************************************/

const JSON_FOLDER_ID = "PEGAR_ID_CARPETA_DRIVE";
const STORE_FILE_NAME = "remitos_deposito_store.json";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);

    if (accion === "ping") {
      return jsonOut({
        ok: true,
        app: "remitos-deposito-json",
        ts: new Date().toISOString()
      });
    }

    if (accion === "store") {
      return jsonOut({
        ok: true,
        store: readStore_()
      });
    }

    return jsonOut({
      ok: true,
      app: "remitos-deposito-json",
      msg: "API remitos deposito activa"
    });
  } catch (err) {
    Logger.log("ERROR remitos-deposito doGet: " + (err.stack || err.message || err));
    return jsonOut({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const accion = cleanStr(data.accion);

    if (accion === "guardar_cliente") {
      return guardarCliente_(data.cliente);
    }

    if (accion === "guardar_remito") {
      return guardarRemito_(data.remito);
    }

    return jsonOut({ ok: false, error: "Accion no reconocida" });
  } catch (err) {
    Logger.log("ERROR remitos-deposito doPost: " + (err.stack || err.message || err));
    return jsonOut({ ok: false, error: err.message || String(err) });
  } finally {
    lock.releaseLock();
  }
}

function guardarCliente_(cliente) {
  const store = readStore_();
  const clean = normalizeClient_(cliente || {});
  if (!clean.codigo) return jsonOut({ ok: false, error: "Falta codigo de cliente" });
  if (!clean.nombre) return jsonOut({ ok: false, error: "Falta nombre de cliente" });

  const previous = store.clients[clean.codigo] || {};
  store.clients[clean.codigo] = Object.assign({}, previous, clean, {
    actualizadoEn: new Date().toISOString()
  });
  store.updatedAt = new Date().toISOString();
  saveStore_(store);

  return jsonOut({
    ok: true,
    cliente: store.clients[clean.codigo],
    store: store
  });
}

function guardarRemito_(remito) {
  const store = readStore_();
  const clean = normalizeRemito_(remito || {}, store);
  if (!clean.clienteCodigo) return jsonOut({ ok: false, error: "Falta codigo de cliente" });
  if (!clean.items.length) return jsonOut({ ok: false, error: "El remito no tiene articulos" });

  if (!store.clients[clean.clienteCodigo]) {
    store.clients[clean.clienteCodigo] = {
      codigo: clean.clienteCodigo,
      nombre: clean.clienteNombre || clean.clienteCodigo,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString()
    };
  }

  store.remitos.push(clean);
  store.updatedAt = new Date().toISOString();
  saveStore_(store);

  return jsonOut({
    ok: true,
    remito: clean,
    store: store
  });
}

function normalizeClient_(cliente) {
  return {
    codigo: cleanStr(cliente.codigo).toUpperCase(),
    nombre: cleanStr(cliente.nombre),
    direccion: cleanStr(cliente.direccion),
    telefono: cleanStr(cliente.telefono),
    creadoEn: cleanStr(cliente.creadoEn) || new Date().toISOString()
  };
}

function normalizeRemito_(remito, store) {
  const clienteCodigo = cleanStr(remito.clienteCodigo).toUpperCase();
  const items = Array.isArray(remito.items) ? remito.items : [];
  const cleanItems = items.map(function(item) {
    const cantidad = toNumber_(item.cantidad);
    const precio = toNumber_(item.precio);
    return {
      articulo: cleanStr(item.articulo),
      descripcion: cleanStr(item.descripcion),
      cantidad: cantidad,
      precio: precio,
      monto: round2_(cantidad * precio)
    };
  }).filter(function(item) {
    return item.articulo || item.descripcion || item.cantidad || item.precio;
  });

  return {
    id: cleanStr(remito.id) || clienteCodigo + "-" + new Date().getTime(),
    numero: cleanStr(remito.numero) || buildNextNumber_(clienteCodigo, store),
    clienteCodigo: clienteCodigo,
    clienteNombre: cleanStr(remito.clienteNombre),
    fecha: cleanStr(remito.fecha) || Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "yyyy-MM-dd"),
    bultos: toNumber_(remito.bultos),
    observaciones: cleanStr(remito.observaciones),
    items: cleanItems,
    totalCantidad: round2_(cleanItems.reduce(function(sum, item) { return sum + item.cantidad; }, 0)),
    total: round2_(cleanItems.reduce(function(sum, item) { return sum + item.monto; }, 0)),
    creadoEn: cleanStr(remito.creadoEn) || new Date().toISOString()
  };
}

function buildNextNumber_(clienteCodigo, store) {
  const maxSeq = (store.remitos || []).reduce(function(max, remito) {
    if (cleanStr(remito.clienteCodigo).toUpperCase() !== clienteCodigo) return max;
    const match = cleanStr(remito.numero).match(/-(\d+)$/);
    const seq = match ? Number(match[1]) : 0;
    return Math.max(max, seq);
  }, 0);
  return clienteCodigo + "-" + String(maxSeq + 1).padStart(4, "0");
}

function readStore_() {
  assertConfigured_();
  const folder = DriveApp.getFolderById(JSON_FOLDER_ID);
  const files = folder.getFilesByName(STORE_FILE_NAME);

  if (!files.hasNext()) {
    const initial = {
      version: 1,
      updatedAt: new Date().toISOString(),
      clients: {},
      remitos: []
    };
    saveJsonFile_(folder, STORE_FILE_NAME, initial);
    return initial;
  }

  const file = files.next();
  const text = file.getBlob().getDataAsString("UTF-8");
  const parsed = text ? JSON.parse(text) : {};

  return {
    version: 1,
    updatedAt: cleanStr(parsed.updatedAt),
    clients: parsed.clients && typeof parsed.clients === "object" ? parsed.clients : {},
    remitos: Array.isArray(parsed.remitos) ? parsed.remitos : []
  };
}

function saveStore_(store) {
  assertConfigured_();
  const folder = DriveApp.getFolderById(JSON_FOLDER_ID);
  saveJsonFile_(folder, STORE_FILE_NAME, store);
}

function saveJsonFile_(folder, name, data) {
  const content = JSON.stringify(data);
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    files.next().setContent(content);
    return;
  }
  folder.createFile(name, content, MimeType.PLAIN_TEXT);
}

function assertConfigured_() {
  if (!JSON_FOLDER_ID || JSON_FOLDER_ID.indexOf("PEGAR_") === 0) {
    throw new Error("Falta configurar JSON_FOLDER_ID.");
  }
}

function toNumber_(value) {
  let text = cleanStr(value);
  if (text.indexOf(",") >= 0 && text.indexOf(".") >= 0) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(",", ".");
  }
  const number = Number(text);
  return isNaN(number) ? 0 : number;
}

function round2_(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function cleanStr(value) {
  return String(value == null ? "" : value).trim();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
