/**
 * RIO · Stock y ventas zNube
 * Lee automáticamente el CSV recibido por Gmail, lo normaliza y guarda
 * un JSON diario en Google Drive. También expone el último JSON como Web App.
 */

const CONFIG = {
  gmailQuery: 'from:znube@zoologic.com.ar subject:"Cubo zNube - stock vs ventas mail" has:attachment newer_than:10d',
  folderName: 'RIO - Histórico stock y ventas',
  timezone: 'America/Argentina/Buenos_Aires',
  processEveryMinutes: 30,
  maxThreads: 20,
};

const PROPERTY_KEYS = {
  lastMessageId: 'STOCK_VENTAS_LAST_MESSAGE_ID',
  latestFileId: 'STOCK_VENTAS_LATEST_FILE_ID',
  latestMetadata: 'STOCK_VENTAS_LATEST_METADATA',
  folderId: 'STOCK_VENTAS_FOLDER_ID',
};

/** Ejecutar una sola vez. Autoriza Gmail/Drive y crea el control automático. */
function instalar() {
  desinstalarTrigger_();
  ScriptApp.newTrigger('procesarCorreoStockVentas')
    .timeBased()
    .everyMinutes(CONFIG.processEveryMinutes)
    .create();

  const folder = getOrCreateFolder_();
  const result = procesarCorreoStockVentas();
  console.log(JSON.stringify({ installed: true, folderId: folder.getId(), firstRun: result }));
  return { installed: true, folderId: folder.getId(), firstRun: result };
}

/** Busca el correo más reciente todavía no procesado. */
function procesarCorreoStockVentas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: false, skipped: true, reason: 'already-running' };

  try {
    const props = PropertiesService.getScriptProperties();
    const lastMessageId = props.getProperty(PROPERTY_KEYS.lastMessageId);
    const candidate = findNewestCsvMessage_();

    if (!candidate) return { ok: true, processed: false, reason: 'email-not-found' };
    if (candidate.message.getId() === lastMessageId) {
      return { ok: true, processed: false, reason: 'already-processed', messageId: lastMessageId };
    }

    const csvText = candidate.attachment.getDataAsString('UTF-8').replace(/^\uFEFF/, '');
    const payload = normalizeZnubeCsv_(csvText, candidate.attachment.getName(), candidate.message);
    const saved = saveDailyJson_(payload);

    props.setProperties({
      [PROPERTY_KEYS.lastMessageId]: candidate.message.getId(),
      [PROPERTY_KEYS.latestFileId]: saved.fileId,
      [PROPERTY_KEYS.latestMetadata]: JSON.stringify(saved.metadata),
    });

    return { ok: true, processed: true, fileId: saved.fileId, metadata: saved.metadata };
  } catch (error) {
    console.error(error.stack || error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/** Fuerza el reprocesamiento del último correo, útil para pruebas. */
function reprocesarUltimoCorreo() {
  PropertiesService.getScriptProperties().deleteProperty(PROPERTY_KEYS.lastMessageId);
  return procesarCorreoStockVentas();
}

/** Endpoint público: latest, status o una fecha YYYY-MM-DD. */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.mode === 'status') return jsonOutput_(getStatus_());

    const file = params.date ? getDailyFile_(params.date) : getLatestFile_();
    if (!file) return jsonOutput_({ ok: false, error: 'No hay un reporte disponible.' });
    return ContentService.createTextOutput(file.getBlob().getDataAsString('UTF-8'))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return jsonOutput_({ ok: false, error: String(error.message || error) });
  }
}

function findNewestCsvMessage_() {
  const threads = GmailApp.search(CONFIG.gmailQuery, 0, CONFIG.maxThreads);
  const candidates = [];

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      message.getAttachments({ includeInlineImages: false, includeAttachments: true }).forEach(function (attachment) {
        if (/\.csv$/i.test(attachment.getName())) candidates.push({ message: message, attachment: attachment });
      });
    });
  });

  candidates.sort(function (a, b) { return b.message.getDate().getTime() - a.message.getDate().getTime(); });
  return candidates[0] || null;
}

function normalizeZnubeCsv_(csvText, sourceFile, message) {
  const rows = Utilities.parseCsv(csvText);
  if (rows.length < 5 || rows[3][8] !== 'Artículo - Código') {
    throw new Error('El adjunto no tiene el formato esperado del Cubo zNube.');
  }

  const branchColumns = [];
  for (let column = 13; column <= 29; column += 2) {
    if (rows[2][column]) branchColumns.push({ name: rows[2][column], column: column });
  }

  const carry = new Array(13).fill('');
  const records = [];

  rows.slice(4).forEach(function (sourceRow) {
    const row = sourceRow.concat(new Array(Math.max(0, 33 - sourceRow.length)).fill(''));
    for (let column = 0; column <= 12; column += 1) {
      if (row[column]) {
        carry[column] = row[column];
        for (let child = column + 1; child <= 12; child += 1) carry[child] = '';
      }
    }

    if (!carry[8] || !carry[12]) return;
    const branches = {};
    branchColumns.forEach(function (branch) {
      branches[branch.name] = [toNumber_(row[branch.column]), toNumber_(row[branch.column + 1])];
    });

    records.push({
      supplier: carry[0], unit: carry[3], classification: carry[6], line: carry[7],
      code: carry[8], group: carry[9], article: carry[10], color: carry[11], size: carry[12],
      stock: toNumber_(row[31]), sales: toNumber_(row[32]), branches: branches,
    });
  });

  const reportDate = dateFromFileName_(sourceFile) || Utilities.formatDate(message.getDate(), CONFIG.timezone, 'yyyy-MM-dd');
  return {
    schemaVersion: 1,
    reportDate: reportDate,
    receivedAt: message.getDate().toISOString(),
    sourceFile: sourceFile,
    sourceMessageId: message.getId(),
    branches: branchColumns.map(function (branch) { return branch.name; }),
    records: records,
  };
}

function saveDailyJson_(payload) {
  const folder = getOrCreateFolder_();
  const fileName = payload.reportDate + '.json';
  const existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  // createFile(name, content) admite el JSON completo; evitamos setContent,
  // cuyo límite es menor para archivos de este tamaño.
  const file = folder.createFile(fileName, JSON.stringify(payload));
  const metadata = {
    reportDate: payload.reportDate,
    receivedAt: payload.receivedAt,
    sourceFile: payload.sourceFile,
    records: payload.records.length,
    fileId: file.getId(),
    updatedAt: new Date().toISOString(),
  };
  updateIndex_(folder, metadata);
  return { fileId: file.getId(), metadata: metadata };
}

function updateIndex_(folder, metadata) {
  const name = 'index.json';
  const files = folder.getFilesByName(name);
  let file = files.hasNext() ? files.next() : null;
  let index = { schemaVersion: 1, reports: [] };
  if (file) {
    try { index = JSON.parse(file.getBlob().getDataAsString('UTF-8')); } catch (ignore) {}
  }

  index.reports = (index.reports || []).filter(function (item) { return item.reportDate !== metadata.reportDate; });
  index.reports.push(metadata);
  index.reports.sort(function (a, b) { return b.reportDate.localeCompare(a.reportDate); });
  index.latest = metadata;
  index.updatedAt = new Date().toISOString();

  if (file) file.setContent(JSON.stringify(index));
  else folder.createFile(name, JSON.stringify(index));
}

function getLatestFile_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.latestFileId);
  if (id) {
    try { return DriveApp.getFileById(id); } catch (ignore) {}
  }
  const status = getStatus_();
  return status.latest && status.latest.fileId ? DriveApp.getFileById(status.latest.fileId) : null;
}

function getDailyFile_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La fecha debe usar el formato YYYY-MM-DD.');
  const files = getOrCreateFolder_().getFilesByName(date + '.json');
  return files.hasNext() ? files.next() : null;
}

function getStatus_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(PROPERTY_KEYS.latestMetadata);
  return { ok: true, latest: raw ? JSON.parse(raw) : null, folderId: props.getProperty(PROPERTY_KEYS.folderId) };
}

function getOrCreateFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(PROPERTY_KEYS.folderId);
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (ignore) {}
  }

  const folders = DriveApp.getFoldersByName(CONFIG.folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.folderName);
  props.setProperty(PROPERTY_KEYS.folderId, folder.getId());
  return folder;
}

function dateFromFileName_(name) {
  const match = String(name || '').match(/(\d{4})(\d{2})(\d{2})/);
  return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
}

function toNumber_(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function desinstalarTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'procesarCorreoStockVentas') ScriptApp.deleteTrigger(trigger);
  });
}

