/*********************************************************
 * MARGENES - RIO
 *
 * Lee el ultimo CSV acumulativo recibido por Gmail durante
 * el mes en curso, consolida las bases por local y guarda un
 * JSON en Drive. Cada correo nuevo reemplaza al anterior.
 *
 * Puesta en marcha:
 * 1. Crear un proyecto de Google Apps Script con esta cuenta.
 * 2. Pegar este archivo y ejecutar instalarMargenes().
 * 3. Implementar como Aplicacion web (ejecutar como: yo;
 *    acceso: cualquier usuario con el enlace).
 * 4. Pegar la URL /exec en api-config.js.
 *
 * Acciones web:
 * - GET ?accion=ping
 * - GET ?accion=reporte
 * - GET ?accion=actualizar  (uso manual/diagnostico)
 *********************************************************/

const MARGENES_TIMEZONE = "America/Argentina/Buenos_Aires";
const MARGENES_SENDER = "znube@zoologic.com.ar";
const MARGENES_SUBJECT = "Cubo zNube - margen de venta diario acumulativo mail";
const MARGENES_JSON_NAME = "margenes_reporte_actual.json";
const MARGENES_FOLDER_NAME = "Rio - Margenes automaticos";
const MARGENES_REPORT_VERSION = 3;

const MARGENES_BRANCHES = {
  AV2: "Avellaneda 3249",
  PRUAV2: "Avellaneda 3249",
  AV1: "Nazca",
  PRUAV1: "Nazca",
  WEB: "Web",
  PRUWEB: "Web",
  LAMAR: "Lamarca",
  LAMARCA: "Lamarca",
  PRULAMAR: "Lamarca",
  CASTE: "Castelli",
  CASTELLI: "Castelli",
  PRUCASTE: "Castelli",
  CORRIEN: "Corrientes",
  CORRIENT: "Corrientes",
  PRUCORRI: "Corrientes",
  PUEY: "Pueyrredon",
  PRUPUEY: "Pueyrredon",
  QUILM: "Quilmes",
  QUILMES: "Quilmes",
  PRUQUILM: "Quilmes",
  ONCE: "Sarmiento",
  PRUONCE: "Sarmiento"
};

function doGet(e) {
  try {
    const accion = cleanMargenes_(e && e.parameter && e.parameter.accion) || "reporte";
    if (accion === "ping") {
      return margenesJson_({ ok: true, app: "margenes", ts: new Date().toISOString() });
    }
    if (accion === "actualizar") return margenesJson_(actualizarMargenes_());
    if (accion === "reporte") return margenesJson_(leerReporteMargenes_());
    return margenesJson_({ ok: false, error: "Accion desconocida." });
  } catch (err) {
    Logger.log(err.stack || err);
    return margenesJson_({ ok: false, error: err.message || String(err) });
  }
}

function instalarMargenes() {
  getMargenesFolder_();
  actualizarMargenes_();

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "actualizarMargenesTrigger") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Apps Script puede ejecutar el trigger con una variacion de +/- 15 minutos.
  ScriptApp.newTrigger("actualizarMargenesTrigger")
    .timeBased()
    .atHour(22)
    .nearMinute(30)
    .everyDays(1)
    .inTimezone(MARGENES_TIMEZONE)
    .create();

  return "Instalacion lista. Se actualizara todos los dias cerca de las 22:30.";
}

function actualizarMargenesManual() {
  return actualizarMargenes_();
}

function actualizarMargenesTrigger() {
  actualizarMargenes_();
}

function actualizarMargenes_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const candidate = buscarUltimoCsvMargenes_();
    if (!candidate) {
      throw new Error("No encontre un CSV de margenes del mes en curso en Gmail.");
    }

    const current = readMargenesFile_();
    if (current && current.meta && current.meta.version === MARGENES_REPORT_VERSION
      && current.meta.messageId === candidate.message.getId()
      && current.meta.attachmentName === candidate.attachment.getName()) {
      return {
        ok: true,
        unchanged: true,
        rows: current.rows.length,
        messageDate: current.meta.messageDate,
        msg: "El ultimo correo ya estaba procesado."
      };
    }

    const csvText = candidate.attachment.getDataAsString("UTF-8").replace(/^\uFEFF/, "");
    const parsed = parseMargenesCsv_(csvText, candidate.attachment.getName());
    const messageDate = candidate.message.getDate();
    const now = new Date();
    const report = {
      ok: true,
      meta: {
        version: MARGENES_REPORT_VERSION,
        period: Utilities.formatDate(messageDate, MARGENES_TIMEZONE, "MMMM yyyy"),
        messageDate: Utilities.formatDate(messageDate, MARGENES_TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
        updatedAt: Utilities.formatDate(now, MARGENES_TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
        messageId: candidate.message.getId(),
        attachmentName: candidate.attachment.getName(),
        sourceRows: parsed.sourceRows,
        bases: parsed.bases
      },
      rows: parsed.rows
    };

    writeMargenesFile_(report);
    return { ok: true, unchanged: false, rows: report.rows.length, meta: report.meta };
  } finally {
    lock.releaseLock();
  }
}

function buscarUltimoCsvMargenes_() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const query = [
    "from:" + MARGENES_SENDER,
    'subject:"' + MARGENES_SUBJECT + '"',
    "has:attachment",
    "filename:csv",
    "after:" + Utilities.formatDate(first, MARGENES_TIMEZONE, "yyyy/MM/dd"),
    "before:" + Utilities.formatDate(next, MARGENES_TIMEZONE, "yyyy/MM/dd")
  ].join(" ");

  const threads = GmailApp.search(query, 0, 50);
  let latest = null;
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      if (message.getDate() < first || message.getDate() >= next) return;
      message.getAttachments({ includeInlineImages: false }).forEach(function(attachment) {
        if (!/\.csv$/i.test(attachment.getName())) return;
        if (!latest || message.getDate() > latest.message.getDate()) {
          latest = { message: message, attachment: attachment };
        }
      });
    });
  });
  return latest;
}

function parseMargenesCsv_(csvText, attachmentName) {
  const matrix = Utilities.parseCsv(csvText, ",");
  if (matrix.length < 5) throw new Error("El CSV no contiene el cubo esperado.");

  const baseHeader = matrix[2] || [];
  const metricHeader = matrix[3] || [];
  const starts = [];
  for (let col = 0; col < baseHeader.length; col++) {
    const base = normalizeMargenes_(baseHeader[col]);
    if (MARGENES_BRANCHES[base]) starts.push({ base: base, start: col });
  }
  if (!starts.length) throw new Error("No encontre las bases de datos en la fila de cabecera.");

  starts.forEach(function(block, index) {
    const end = index + 1 < starts.length ? starts[index + 1].start : Math.min(matrix[0].length, 84);
    block.metrics = detectMargenesMetrics_(metricHeader, block.start, end);
  });

  const rows = [];
  let provider = "";
  let classification = "";
  let group = "";
  let sourceRows = 0;

  for (let rowIndex = 4; rowIndex < matrix.length; rowIndex++) {
    const raw = matrix[rowIndex] || [];
    const rawProviderCell = cleanMargenes_(raw[0]);
    const providerCell = descriptionMargenes_(raw[0]);
    const classificationCell = descriptionMargenes_(raw[4]);
    const groupCell = descriptionMargenes_(raw[9]);
    if (/^total general$/i.test(rawProviderCell)) break;

    if (providerCell) {
      provider = providerCell;
      classification = "";
      group = "";
    }
    if (classificationCell) {
      classification = classificationCell;
      group = "";
    }
    if (groupCell) group = groupCell;
    if (!provider || !group) continue;

    let used = false;
    starts.forEach(function(block) {
      const qty = numberMargenes_(raw[block.metrics.qty]);
      const cost = numberMargenes_(raw[block.metrics.cost]);
      const sales = numberMargenes_(raw[block.metrics.sales]);
      const profit = numberMargenes_(raw[block.metrics.profit]);
      if (!qty && !cost && !sales && !profit) return;
      used = true;
      const common = {
        provider: provider,
        product: group,
        category: group,
        discontinuity: classification,
        qty: qty,
        cost: cost,
        sales: sales,
        profit: profit,
        fileName: attachmentName,
        sheetName: block.base,
        sourceRow: rowIndex + 1,
        isTotal: false
      };
      rows.push(Object.assign({}, common, {
        reportType: "locales",
        branch: MARGENES_BRANCHES[block.base],
        isSubtotal: false
      }));
      rows.push(Object.assign({}, common, {
        reportType: "proveedor",
        branch: "",
        isSubtotal: false
      }));
    });
    if (used) sourceRows++;
  }

  if (!rows.length) throw new Error("El CSV fue leido, pero no produjo filas con importes.");
  return {
    rows: consolidateMargenesRows_(rows),
    sourceRows: sourceRows,
    bases: starts.map(function(x) { return x.base; })
  };
}

function consolidateMargenesRows_(rows) {
  const grouped = {};
  rows.forEach(function(row) {
    const isLocal = row.reportType === "locales";
    const key = isLocal
      ? "L|||" + normalizeMargenes_(row.branch)
      : ["P", row.discontinuity, row.category, row.provider].map(normalizeMargenes_).join("|||");
    if (!grouped[key]) {
      grouped[key] = Object.assign({}, row, {
        qty: 0,
        cost: 0,
        sales: 0,
        profit: 0,
        sourceRow: 0,
        sheetName: isLocal ? "Bases consolidadas" : "Todas las bases"
      });
    }
    grouped[key].qty += row.qty;
    grouped[key].cost += row.cost;
    grouped[key].sales += row.sales;
    grouped[key].profit += row.profit;
  });
  return Object.keys(grouped).map(function(key) { return grouped[key]; });
}

function detectMargenesMetrics_(headers, start, end) {
  const metrics = { qty: -1, cost: -1, sales: -1, profit: -1 };
  for (let col = start; col < end; col++) {
    const value = normalizeMargenes_(headers[col]);
    if (value === "CANTIDAD") metrics.qty = col;
    else if (value === "MONTO C/IMP") metrics.cost = col;
    else if (value.indexOf("MONTO NETO VTAS") === 0) metrics.sales = col;
    else if (value.indexOf("MARGEN VTAS") === 0) metrics.profit = col;
  }
  Object.keys(metrics).forEach(function(key) {
    if (metrics[key] < 0) throw new Error("Falta la metrica " + key + " en el bloque que comienza en " + start + ".");
  });
  return metrics;
}

function leerReporteMargenes_() {
  const report = readMargenesFile_();
  if (!report) return { ok: false, error: "Todavia no hay reporte. Ejecuta instalarMargenes()." };
  return report;
}

function getMargenesFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty("MARGENES_FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (ignored) {}
  }
  const folders = DriveApp.getFoldersByName(MARGENES_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(MARGENES_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty("MARGENES_FOLDER_ID", folder.getId());
  return folder;
}

function readMargenesFile_() {
  const files = getMargenesFolder_().getFilesByName(MARGENES_JSON_NAME);
  if (!files.hasNext()) return null;
  return JSON.parse(files.next().getBlob().getDataAsString("UTF-8"));
}

function writeMargenesFile_(report) {
  const folder = getMargenesFolder_();
  const files = folder.getFilesByName(MARGENES_JSON_NAME);
  while (files.hasNext()) files.next().setTrashed(true);
  folder.createFile(MARGENES_JSON_NAME, JSON.stringify(report), MimeType.PLAIN_TEXT);
}

function numberMargenes_(value) {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  let raw = cleanMargenes_(value).replace(/\$/g, "").replace(/\s/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
  else raw = raw.replace(/,/g, "");
  const number = parseFloat(raw);
  return isFinite(number) ? number : 0;
}

function normalizeMargenes_(value) {
  return cleanMargenes_(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanMargenes_(value) {
  return String(value == null ? "" : value).trim();
}

function descriptionMargenes_(value) {
  const raw = cleanMargenes_(value).replace(/\s+/g, " ");
  const separator = raw.indexOf(" ");
  return separator < 0 ? raw : raw.substring(separator + 1).trim();
}

function margenesJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
