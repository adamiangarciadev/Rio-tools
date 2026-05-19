/*********************************************************
 * VENTAS POR CLIENTE - RIO
 * Apps Script para supervision comercial
 *
 * Enfoque actual:
 * - Subir CSVs a una carpeta de Drive.
 * - Si un CSV es grande, dividirlo en partes chicas con la misma cabecera.
 * - Apps Script importa pocos archivos por ejecucion.
 * - La base se guarda como JSON agregado, no como Google Sheets.
 *
 * Acciones:
 * - GET ?accion=ping
 * - GET ?accion=importar_csvs
 * - GET ?accion=dashboard
 * - GET ?accion=cliente&cliente=CODIGO
 * - GET ?accion=exportar_datos&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal=WEB&listaPrecio=LISTA&soloLista=1
 * - GET ?accion=exportar_seleccion&clientes=COD1,COD2&listaPrecio=LISTA&soloLista=1
 *
 * Funciones manuales:
 * - importarCsvsManual()
 * - instalarTriggerDiario()
 * - resetearBaseJsonManual()
 *********************************************************/

const CSV_FOLDER_ID = "17ab1YTuLL9Ov-wtsmaCw1I0crZ--gYya";
const TIMEZONE = "America/Argentina/Buenos_Aires";
const IMPORT_LOCK_WAIT_MS = 5000;
const MAX_FILES_PER_RUN = 3;
const MAX_RUN_MS = 280000;

const STORE_FILE_NAME = "ventas_clientes_store.json";
const REPORT_FILE_NAME = "ventas_clientes_report.json";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);

    if (accion === "ping") {
      return jsonOut({ ok: true, app: "ventas-clientes-json", ts: new Date().toISOString() });
    }

    if (accion === "importar_csvs") {
      return importarCsvs_();
    }

    if (accion === "dashboard") {
      return getDashboard_();
    }

    if (accion === "cliente") {
      return getCliente_(e);
    }

    if (accion === "exportar_datos") {
      return exportarDatos_(e);
    }

    if (accion === "exportar_seleccion") {
      return exportarSeleccion_(e);
    }

    return jsonOut({ ok: true, app: "ventas-clientes-json", msg: "API ventas por cliente activa" });
  } catch (err) {
    Logger.log("ERROR ventas-clientes doGet: " + (err.stack || err.message || err));
    return jsonOut({ ok: false, error: err.message || String(err) });
  }
}

function importarCsvs_() {
  assertConfigured_();

  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(IMPORT_LOCK_WAIT_MS);
  if (!locked) {
    return jsonOut({
      ok: false,
      error: "Ya hay una importacion en curso. Espera unos minutos y volve a ejecutar importarCsvsManual."
    });
  }

  try {
    const started = Date.now();
    const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
    const store = readStore_(folder);
    const files = folder.getFiles();
    const nowIso = new Date().toISOString();

    let archivosImportados = 0;
    let filasImportadas = 0;
    let filasDescartadas = 0;
    let archivosProcesados = 0;
    let pendientes = 0;

    while (files.hasNext()) {
      const file = files.next();
      const fileId = file.getId();
      const fileName = file.getName();
      const lower = fileName.toLowerCase();

      if (!lower.endsWith(".csv")) continue;
      if (store.importedFiles[fileId]) continue;

      if (archivosProcesados >= MAX_FILES_PER_RUN || Date.now() - started > MAX_RUN_MS) {
        pendientes++;
        continue;
      }

      archivosProcesados++;

      try {
        const result = mergeCsvFileIntoStore_(store, file, fileId, fileName);
        store.importedFiles[fileId] = {
          id: fileId,
          name: fileName,
          importedAt: nowIso,
          rows: result.rows
        };
        store.log.push({
          fileId: fileId,
          fileName: fileName,
          importedAt: nowIso,
          rows: result.rows,
          status: "OK",
          message: "Importado"
        });
        archivosImportados++;
        filasImportadas += result.rows;
        filasDescartadas += result.discarded || 0;
      } catch (fileErr) {
        store.log.push({
          fileId: fileId,
          fileName: fileName,
          importedAt: nowIso,
          rows: 0,
          status: "ERROR",
          message: fileErr.message || String(fileErr)
        });
      }
    }

    store.version = 3;
    store.updatedAt = nowIso;
    store.log = store.log.slice(-500);
    saveJsonFile_(folder, STORE_FILE_NAME, store);

    const report = buildReport_(store);
    saveJsonFile_(folder, REPORT_FILE_NAME, report);

    return jsonOut({
      ok: true,
      modo: "json-agregado",
      archivosImportados: archivosImportados,
      filasImportadas: filasImportadas,
      filasDescartadas: filasDescartadas,
      archivosProcesados: archivosProcesados,
      archivosPendientes: pendientes,
      totalFilas: store.meta.totalFilas,
      totalArchivos: Object.keys(store.importedFiles).length,
      msg: pendientes ? "Quedaron archivos pendientes. Ejecuta importarCsvsManual otra vez." : "Importacion lista."
    });
  } finally {
    lock.releaseLock();
  }
}

function importarCsvsManual() {
  return importarCsvs_();
}

function importarCsvsTrigger() {
  importarCsvs_();
}

function instalarTriggerDiario() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "importarCsvsTrigger") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("importarCsvsTrigger")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
}

function resetearBaseJsonManual() {
  assertConfigured_();
  const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
  trashFileIfExists_(folder, STORE_FILE_NAME);
  trashFileIfExists_(folder, REPORT_FILE_NAME);
  return jsonOut({ ok: true, msg: "Base JSON reseteada. Ejecuta importarCsvsManual para reconstruirla." });
}

function getDashboard_() {
  assertConfigured_();
  const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
  const report = readReport_(folder);
  return jsonOut({
    ok: true,
    meta: report.meta || { totalFilas: 0 },
    clientes: report.clientes || [],
    sucursales: report.sucursales || [],
    meses: report.meses || []
  });
}

function getCliente_(e) {
  assertConfigured_();
  const cliente = cleanStr(e && e.parameter && e.parameter.cliente);
  if (!cliente) return jsonOut({ ok: false, error: "Falta cliente" });

  const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
  const store = readStore_(folder);
  const client = store.clients[cliente];

  return jsonOut({
    ok: true,
    cliente: cliente,
    compras: client ? buildClientPurchases_(client) : []
  });
}

function exportarDatos_(e) {
  assertConfigured_();

  const desdeText = cleanStr(e && e.parameter && e.parameter.desde);
  const hastaText = cleanStr(e && e.parameter && e.parameter.hasta);
  const sucursal = cleanStr(e && e.parameter && e.parameter.sucursal).toUpperCase();
  const listaPrecio = cleanStr(e && e.parameter && e.parameter.listaPrecio);
  const soloLista = cleanStr(e && e.parameter && e.parameter.soloLista) === "1";

  if (!desdeText) return jsonOut({ ok: false, error: "Falta fecha desde" });
  if (!hastaText) return jsonOut({ ok: false, error: "Falta fecha hasta" });
  if (!sucursal) return jsonOut({ ok: false, error: "Falta sucursal" });
  if (desdeText > hastaText) return jsonOut({ ok: false, error: "La fecha desde no puede ser mayor a la fecha hasta" });

  const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
  const store = readStore_(folder);
  const maxDate = parseDate_(store.meta.fechaMax);
  const baseMonth = store.meta.fechaMax ? store.meta.fechaMax.slice(0, 7) : "";
  const baseYear = store.meta.fechaMax ? store.meta.fechaMax.slice(0, 4) : "";
  const last3Months = getLastMonths_(baseMonth, 3);

  const clientes = [];
  const compras = [];
  let clientesBase = 0;
  let totalExportado = 0;

  Object.keys(store.clients || {}).forEach(function(clienteId) {
    const client = store.clients[clienteId];
    const allPurchases = buildClientPurchases_(client);
    const inRange = allPurchases.filter(function(item) {
      return item.fecha >= desdeText && item.fecha <= hastaText;
    });
    const passedByBranch = inRange.some(function(item) {
      return cleanStr(item.sucursal).toUpperCase() === sucursal &&
        (!listaPrecio || sameList_(item.listaPrecio, listaPrecio));
    });

    if (!passedByBranch) return;

    clientesBase++;
    const finalized = finalizeClient_(client, maxDate, baseMonth, baseYear, last3Months);
    clientes.push(finalized);

    const exportPurchases = soloLista && listaPrecio
      ? inRange.filter(function(item) { return sameList_(item.listaPrecio, listaPrecio); })
      : inRange;

    exportPurchases.forEach(function(item) {
      totalExportado += Number(item.total || 0);
      compras.push({
        clienteId: finalized.clienteId,
        nombre: finalized.nombre,
        telefono: finalized.telefono,
        telefonoMovil: finalized.telefonoMovil,
        email: finalized.email,
        segmento: finalized.segmento,
        fecha: item.fecha,
        sucursal: item.sucursal,
        listaPrecio: item.listaPrecio,
        total: item.total
      });
    });
  });

  clientes.sort(function(a, b) {
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
  compras.sort(function(a, b) {
    return String(a.clienteId).localeCompare(String(b.clienteId), "es") ||
      String(a.fecha).localeCompare(String(b.fecha)) ||
      String(a.sucursal).localeCompare(String(b.sucursal), "es");
  });

  return jsonOut({
    ok: true,
    filtros: {
      desde: desdeText,
      hasta: hastaText,
      sucursal: sucursal,
      listaPrecio: listaPrecio,
      soloLista: soloLista
    },
    meta: {
      clientesBase: clientesBase,
      comprasExportadas: compras.length,
      totalExportado: round2_(totalExportado)
    },
    clientes: clientes,
    compras: compras
  });
}

function exportarSeleccion_(e) {
  assertConfigured_();

  const rawClientes = cleanStr(e && e.parameter && e.parameter.clientes);
  const listaPrecio = cleanStr(e && e.parameter && e.parameter.listaPrecio);
  const soloLista = cleanStr(e && e.parameter && e.parameter.soloLista) === "1";
  if (!rawClientes) return jsonOut({ ok: false, error: "Faltan clientes" });

  const ids = rawClientes.split(",")
    .map(function(id) { return cleanStr(id); })
    .filter(Boolean);

  if (!ids.length) return jsonOut({ ok: false, error: "Faltan clientes validos" });

  const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
  const store = readStore_(folder);
  const maxDate = parseDate_(store.meta.fechaMax);
  const baseMonth = store.meta.fechaMax ? store.meta.fechaMax.slice(0, 7) : "";
  const baseYear = store.meta.fechaMax ? store.meta.fechaMax.slice(0, 4) : "";
  const last3Months = getLastMonths_(baseMonth, 3);

  const clientes = [];
  const compras = [];
  let totalExportado = 0;

  ids.forEach(function(clienteId) {
    const client = store.clients[clienteId];
    if (!client) return;

    const allPurchases = buildClientPurchases_(client);
    if (listaPrecio && !allPurchases.some(function(item) { return sameList_(item.listaPrecio, listaPrecio); })) return;

    const exportPurchases = soloLista && listaPrecio
      ? allPurchases.filter(function(item) { return sameList_(item.listaPrecio, listaPrecio); })
      : allPurchases;
    if (!exportPurchases.length) return;

    const finalized = finalizeClient_(client, maxDate, baseMonth, baseYear, last3Months);
    clientes.push(finalized);

    exportPurchases.forEach(function(item) {
      totalExportado += Number(item.total || 0);
      compras.push({
        clienteId: finalized.clienteId,
        nombre: finalized.nombre,
        telefono: finalized.telefono,
        telefonoMovil: finalized.telefonoMovil,
        email: finalized.email,
        segmento: finalized.segmento,
        fecha: item.fecha,
        sucursal: item.sucursal,
        listaPrecio: item.listaPrecio,
        total: item.total
      });
    });
  });

  clientes.sort(function(a, b) {
    return ids.indexOf(a.clienteId) - ids.indexOf(b.clienteId);
  });
  compras.sort(function(a, b) {
    return ids.indexOf(a.clienteId) - ids.indexOf(b.clienteId) ||
      String(b.fecha).localeCompare(String(a.fecha)) ||
      Number(b.total || 0) - Number(a.total || 0);
  });

  return jsonOut({
    ok: true,
    meta: {
      clientesSolicitados: ids.length,
      clientesExportados: clientes.length,
      comprasExportadas: compras.length,
      totalExportado: round2_(totalExportado)
    },
    clientes: clientes,
    compras: compras
  });
}

function mergeCsvFileIntoStore_(store, file, fileId, fileName) {
  const text = readCsvText_(file);
  const parsed = Utilities.parseCsv(text, ";");
  if (!parsed || parsed.length < 2) return { rows: 0 };

  const header = parsed[0].map(normalizeHeader_);
  const idx = {
    sucursal: header.indexOf("codigo"),
    clienteId: header.indexOf("cliente"),
    clienteNombre: header.indexOf("cliente descripcion"),
    fecha: header.indexOf("fecha"),
    listaPrecio: header.indexOf("lista de precio"),
    telefono: header.indexOf("telefono"),
    telefonoMovil: header.indexOf("telefono movil"),
    email: header.indexOf("email"),
    total: header.indexOf("total")
  };

  Object.keys(idx).forEach(function(key) {
    if (idx[key] < 0) throw new Error("Falta columna requerida: " + key);
  });

  let rows = 0;
  let discarded = 0;
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (!row || row.length < header.length) continue;

    const sucursal = cleanStr(row[idx.sucursal]).toUpperCase();
    const clienteId = cleanStr(row[idx.clienteId]);
    const clienteNombre = cleanStr(row[idx.clienteNombre]);
    const fecha = parseDate_(row[idx.fecha]);
    const total = parseAmount_(row[idx.total]);

    if (isClienteDescartado_(clienteId, clienteNombre)) {
      discarded++;
      continue;
    }
    if (!sucursal || !clienteId || !fecha || isNaN(fecha.getTime())) continue;

    const sale = {
      sourceFileId: fileId,
      sourceFileName: fileName,
      sucursal: sucursal,
      clienteId: clienteId,
      clienteNombre: clienteNombre,
      fecha: Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM-dd"),
      listaPrecio: cleanStr(row[idx.listaPrecio]),
      telefono: cleanStr(row[idx.telefono]),
      telefonoMovil: cleanStr(row[idx.telefonoMovil]),
      email: cleanStr(row[idx.email]),
      total: total,
      periodo: Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM")
    };

    mergeSaleIntoStore_(store, sale);
    rows++;
  }

  return { rows: rows, discarded: discarded };
}

function mergeSaleIntoStore_(store, sale) {
  if (!store.clients[sale.clienteId]) {
    store.clients[sale.clienteId] = {
      clienteId: sale.clienteId,
      nombre: sale.clienteNombre,
      telefono: sale.telefono,
      telefonoMovil: sale.telefonoMovil,
      email: sale.email,
      totalHistorico: 0,
      monthlyTotals: {},
      dias: {},
      sucursales: {},
      listas: {},
      compras: {}
    };
  }

  const client = store.clients[sale.clienteId];
  client.nombre = client.nombre || sale.clienteNombre;
  client.telefono = client.telefono || sale.telefono;
  client.telefonoMovil = client.telefonoMovil || sale.telefonoMovil;
  client.email = client.email || sale.email;
  client.totalHistorico += sale.total;
  client.monthlyTotals[sale.periodo] = (client.monthlyTotals[sale.periodo] || 0) + sale.total;
  client.dias[sale.fecha] = true;
  client.sucursales[sale.sucursal] = (client.sucursales[sale.sucursal] || 0) + sale.total;
  if (sale.listaPrecio) client.listas[sale.listaPrecio] = true;

  const compraKey = [sale.fecha, sale.sucursal, sale.listaPrecio || "-"].join("|");
  if (!client.compras[compraKey]) {
    client.compras[compraKey] = {
      clienteId: sale.clienteId,
      fecha: sale.fecha,
      sucursal: sale.sucursal,
      listaPrecio: sale.listaPrecio,
      telefono: sale.telefono,
      telefonoMovil: sale.telefonoMovil,
      email: sale.email,
      total: 0
    };
  }
  client.compras[compraKey].total += sale.total;

  store.branchTotals[sale.sucursal] = (store.branchTotals[sale.sucursal] || 0) + sale.total;
  store.monthTotals[sale.periodo] = (store.monthTotals[sale.periodo] || 0) + sale.total;
  store.meta.totalFilas++;

  if (!store.meta.fechaMin || sale.fecha < store.meta.fechaMin) store.meta.fechaMin = sale.fecha;
  if (!store.meta.fechaMax || sale.fecha > store.meta.fechaMax) store.meta.fechaMax = sale.fecha;
}

function buildReport_(store) {
  const maxDate = parseDate_(store.meta.fechaMax);
  const baseMonth = store.meta.fechaMax ? store.meta.fechaMax.slice(0, 7) : "";
  const baseYear = store.meta.fechaMax ? store.meta.fechaMax.slice(0, 4) : "";
  const last3Months = getLastMonths_(baseMonth, 3);

  const clientes = Object.keys(store.clients).map(function(clienteId) {
    return finalizeClient_(store.clients[clienteId], maxDate, baseMonth, baseYear, last3Months);
  }).sort(function(a, b) {
    return b.totalMesBase - a.totalMesBase || b.totalHistorico - a.totalHistorico;
  });

  const sucursales = Object.keys(store.branchTotals).sort().map(function(sucursal) {
    return { sucursal: sucursal, total: round2_(store.branchTotals[sucursal]) };
  }).sort(function(a, b) {
    return b.total - a.total || a.sucursal.localeCompare(b.sucursal);
  });

  const meses = Object.keys(store.monthTotals).sort().reverse().map(function(mes) {
    return { mes: mes, total: round2_(store.monthTotals[mes]) };
  });

  return {
    version: 3,
    updatedAt: store.updatedAt || new Date().toISOString(),
    meta: {
      modo: "json-agregado",
      totalFilas: store.meta.totalFilas || 0,
      totalArchivos: Object.keys(store.importedFiles || {}).length,
      fechaMin: store.meta.fechaMin || "",
      fechaMax: store.meta.fechaMax || "",
      mesBase: baseMonth,
      anioBase: baseYear
    },
    clientes: clientes,
    sucursales: sucursales,
    meses: meses
  };
}

function finalizeClient_(client, maxDate, baseMonth, baseYear, last3Months) {
  const dias = Object.keys(client.dias || {}).sort();
  const sucursales = Object.keys(client.sucursales || {}).sort();
  const listas = Object.keys(client.listas || {}).sort();
  const primera = dias[0] ? parseDate_(dias[0]) : maxDate;
  const ultima = dias[dias.length - 1] ? parseDate_(dias[dias.length - 1]) : maxDate;
  const daysSinceLast = maxDate && ultima ? diffDays_(ultima, maxDate) : 0;
  const activeSpan = primera && ultima ? Math.max(1, diffDays_(primera, ultima) + 1) : 1;
  const frequencyScore = dias.length / activeSpan;
  const avgGap = dias.length > 1 ? activeSpan / (dias.length - 1) : activeSpan;
  const segmento = classifyClient_(client, dias.length, daysSinceLast, avgGap, primera, ultima);

  let sucursalPrincipal = "";
  let sucursalTotal = -Infinity;
  sucursales.forEach(function(sucursal) {
    if (client.sucursales[sucursal] > sucursalTotal) {
      sucursalPrincipal = sucursal;
      sucursalTotal = client.sucursales[sucursal];
    }
  });

  const monthlyTotals = client.monthlyTotals || {};
  const totalUltimos3Meses = last3Months.reduce(function(sum, month) {
    return sum + Number(monthlyTotals[month] || 0);
  }, 0);
  const totalAnioBase = Object.keys(monthlyTotals).reduce(function(sum, month) {
    return month.slice(0, 4) === baseYear ? sum + Number(monthlyTotals[month] || 0) : sum;
  }, 0);

  return {
    clienteId: client.clienteId,
    nombre: client.nombre,
    telefono: client.telefono,
    telefonoMovil: client.telefonoMovil,
    email: client.email,
    totalHistorico: round2_(client.totalHistorico),
    totalMesBase: round2_(monthlyTotals[baseMonth] || 0),
    totalUltimos3Meses: round2_(totalUltimos3Meses),
    totalAnioBase: round2_(totalAnioBase),
    primeraCompra: dias[0] || "",
    ultimaCompra: dias[dias.length - 1] || "",
    diasCompra: dias.length,
    frequencyScore: round4_(frequencyScore),
    frecuenciaTexto: buildFrequencyText_(dias.length, avgGap),
    segmento: segmento,
    sucursales: sucursales,
    listas: listas,
    sucursalPrincipal: sucursalPrincipal,
    sucursalesTexto: sucursales.join(", "),
    listasTexto: listas.join(", ")
  };
}

function buildClientPurchases_(client) {
  return Object.keys(client.compras || {}).map(function(key) {
    const item = client.compras[key];
    return {
      clienteId: item.clienteId,
      sucursal: item.sucursal,
      fecha: item.fecha,
      listaPrecio: item.listaPrecio,
      telefono: item.telefono,
      telefonoMovil: item.telefonoMovil,
      email: item.email,
      total: round2_(item.total)
    };
  }).sort(function(a, b) {
    return String(b.fecha).localeCompare(String(a.fecha)) || b.total - a.total;
  });
}

function classifyClient_(client, diasCompra, daysSinceLast, avgGap, primera, ultima) {
  const total = client.totalHistorico;
  if (daysSinceLast > 120) return "Cliente inactivo";
  if (primera && ultima && diffDays_(primera, ultima) <= 45 && diasCompra <= 2) return "Cliente nuevo";
  if (diasCompra >= 6 && total >= 500000) return "Compra mucho y frecuente";
  if (diasCompra >= 6) return "Compra frecuente";
  if (avgGap > 45 && total >= 500000) return "Compra mucho y espaciado";
  if (avgGap > 45) return "Compra poco y espaciado";
  return "Cliente habitual";
}

function buildFrequencyText_(diasCompra, avgGap) {
  if (diasCompra <= 1) return "Una compra registrada";
  if (avgGap <= 15) return "Muy frecuente";
  if (avgGap <= 35) return "Frecuente";
  if (avgGap <= 60) return "Espaciada";
  return "Muy espaciada";
}

function readStore_(folder) {
  const store = readJsonFile_(folder, STORE_FILE_NAME);
  if (store && store.version === 3) return store;

  return {
    version: 3,
    updatedAt: "",
    importedFiles: {},
    clients: {},
    branchTotals: {},
    monthTotals: {},
    meta: { totalFilas: 0, fechaMin: "", fechaMax: "" },
    log: []
  };
}

function readReport_(folder) {
  const report = readJsonFile_(folder, REPORT_FILE_NAME);
  if (report && report.version === 3) return report;

  const store = readStore_(folder);
  const built = buildReport_(store);
  saveJsonFile_(folder, REPORT_FILE_NAME, built);
  return built;
}

function getLastMonths_(baseMonth, count) {
  if (!baseMonth) return [];
  const parts = baseMonth.split("-");
  const out = [];
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  for (let i = 0; i < count; i++) {
    const item = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(Utilities.formatDate(item, TIMEZONE, "yyyy-MM"));
  }
  return out;
}

function readJsonFile_(folder, name) {
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return null;
  const file = files.next();
  const text = file.getBlob().getDataAsString("UTF-8");
  if (!text) return null;
  return JSON.parse(text);
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

function trashFileIfExists_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

function readCsvText_(file) {
  const blob = file.getBlob();
  try {
    return blob.getDataAsString("Windows-1252");
  } catch (err) {
    return blob.getDataAsString("ISO-8859-1");
  }
}

function parseDate_(value) {
  if (value instanceof Date) return value;
  const text = cleanStr(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const yearRaw = Number(match[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount_(value) {
  const text = cleanStr(value);
  if (!text) return 0;
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return isNaN(n) ? 0 : n;
}

function diffDays_(a, b) {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
    - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  return Math.round(ms / 86400000);
}

function normalizeHeader_(value) {
  return cleanStr(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isClienteDescartado_(clienteId, clienteNombre) {
  const id = normalizeKey_(clienteId);
  const nombre = normalizeKey_(clienteNombre);

  return id === "cf" ||
    id === "0" ||
    nombre === "consumidor final" ||
    nombre === "cliente consumidor final" ||
    nombre === "cf";
}

function normalizeKey_(value) {
  return cleanStr(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sameList_(a, b) {
  return normalizeKey_(a) === normalizeKey_(b);
}

function round2_(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round4_(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function assertConfigured_() {
  if (!CSV_FOLDER_ID || CSV_FOLDER_ID.indexOf("PEGAR_") === 0) {
    throw new Error("Falta configurar CSV_FOLDER_ID.");
  }
}

function cleanStr(value) {
  return String(value == null ? "" : value).trim();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
