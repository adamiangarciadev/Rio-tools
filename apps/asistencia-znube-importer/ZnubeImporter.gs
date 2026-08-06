const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1IQ7azWM1GO7wMwuD9KIu0z-dchH5yixEYJBGXVfA7XI',
  SOURCE_SHEET: 'EVENTOS',
  PADRON_SHEET: 'PADRON',
  ZNUBE_SHEET: 'ZNUBE_FICHAJES',
  AUDIT_SHEET: 'AUDITORIA_ASISTENCIA',
  LOG_SHEET: 'ZNUBE_IMPORT_LOG',
  PROCESSED_LABEL: 'zNube/procesado-asistencia',
  ERROR_LABEL: 'zNube/error-asistencia',
  MAIL_QUERY: 'from:znube@zoologic.com.ar subject:"Reporte zNube - FICHAJES" -subject:"TOTALES POR EMPLEADO" has:attachment newer_than:30d',
  TIME_ZONE: 'America/Buenos_Aires',
  PROFILE_WORDS: ['VENDEDORA', 'VENDEDOR', 'CADETE', 'CAJERO/A', 'ENCARGADO/A', 'WEB'],
});

/** Ejecutar una sola vez desde administracion@lenceriario.com. */
function instalarImportadorZnube() {
  asegurarHojas_();
  const handler = 'importarFichajesZnube';
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(15).create();
  importarFichajesZnube();
}

/** Busca correos no procesados, importa sus PDF y reconstruye la auditoria. */
function importarFichajesZnube() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    asegurarHojas_();
    const processedLabel = obtenerOCrearEtiqueta_(CONFIG.PROCESSED_LABEL);
    const errorLabel = obtenerOCrearEtiqueta_(CONFIG.ERROR_LABEL);
    const query = `${CONFIG.MAIL_QUERY} -label:${CONFIG.PROCESSED_LABEL} -label:${CONFIG.ERROR_LABEL}`;
    const threads = GmailApp.search(query, 0, 50);
    let importedAny = false;

    threads.forEach(thread => {
      thread.getMessages().forEach(message => {
        if (!esCorreoObjetivo_(message)) return;
        try {
          const rows = importarMensaje_(message);
          registrarLog_(message, 'OK', rows, '');
          thread.addLabel(processedLabel);
          importedAny = importedAny || rows > 0;
        } catch (error) {
          registrarLog_(message, 'ERROR', 0, error.stack || error.message || String(error));
          thread.addLabel(errorLabel);
        }
      });
    });

    if (importedAny) reconstruirAuditoria_();
  } finally {
    lock.releaseLock();
  }
}

/** Permite probar manualmente un correo ya recibido por su ID de Gmail. */
function probarMensajeZnube(messageId) {
  const message = GmailApp.getMessageById(messageId);
  const rows = importarMensaje_(message);
  reconstruirAuditoria_();
  return rows;
}

/** Quita la marca de error y vuelve a procesar los reportes de fichajes. */
function reintentarErroresZnube() {
  const errorLabel = GmailApp.getUserLabelByName(CONFIG.ERROR_LABEL);
  if (errorLabel) {
    errorLabel.getThreads().forEach(thread => thread.removeLabel(errorLabel));
  }
  importarFichajesZnube();
}

/** Sincroniza PADRON usando fichajes zNube que ya fueron importados. */
function sincronizarPadronZnubeExistente() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.ZNUBE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const records = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getDisplayValues();
  return sincronizarPadronDesdeZnube_(records);
}

function importarMensaje_(message) {
  const attachments = message.getAttachments({includeInlineImages: false, includeAttachments: true})
    .filter(att => /pdf/i.test(att.getContentType()) || /\.pdf$/i.test(att.getName() || ''));
  if (!attachments.length) throw new Error('El correo no contiene un PDF.');

  let total = 0;
  attachments.forEach(attachment => {
    const text = extraerTextoPdfConOcr_(attachment);
    const records = parsearReporteZnube_(text, message, attachment);
    if (!records.length) throw new Error(`No se reconocieron fichajes en ${attachment.getName()}.`);
    sincronizarPadronDesdeZnube_(records);
    total += anexarSinDuplicados_(records);
  });
  return total;
}

function extraerTextoPdfConOcr_(attachment) {
  let docFile;
  try {
    docFile = Drive.Files.create(
      {name: `tmp_znube_${Date.now()}`, mimeType: MimeType.GOOGLE_DOCS},
      attachment.copyBlob().setContentType(MimeType.PDF),
      {ocrLanguage: 'es', fields: 'id'}
    );
    return DocumentApp.openById(docFile.id).getBody().getText();
  } finally {
    if (docFile && docFile.id) Drive.Files.remove(docFile.id);
  }
}

function parsearReporteZnube_(text, message, attachment) {
  const normalized = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const records = [];
  // El OCR puede entregar cada celda en una linea distinta. Se aplana todo el
  // documento y se reconoce: fecha + dia + puesto + "codigo nombre" + hora.
  const profilePattern = CONFIG.PROFILE_WORDS
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const rowPattern = new RegExp(
    '(\\d{2}\\/\\d{2}\\/\\d{4})\\s*,\\s*[^\\s]+\\s+' +
    '(.+?)\\s+(\\d+)\\s+(.+?)\\s+' +
    '(\\d{1,2}:\\d{2}:\\d{2})(?:\\s+(' + profilePattern + '))?',
    'gi'
  );
  let match;
  while ((match = rowPattern.exec(normalized)) !== null) {
    let [, dateText, controlPoint, employeeId, name, punchTime, profile = ''] = match;
    // Descarta texto de encabezado que el OCR pudiera anteponer al puesto.
    controlPoint = limpiarPuestoControl_(controlPoint);
    profile = normalizarTexto_(profile);
    const isoDate = fechaIso_(dateText);
    const key = [isoDate, employeeId, punchTime, normalizarTexto_(controlPoint)].join('|');
    records.push([
      isoDate,
      normalizarTexto_(controlPoint),
      String(employeeId),
      limpiarNombre_(name),
      punchTime,
      profile,
      message.getDate(),
      message.getId(),
      attachment.getName(),
      key,
    ]);
  }
  return records;
}

function limpiarPuestoControl_(value) {
  let text = normalizarTexto_(value);
  // Entre paginas el OCR puede insertar titulo, encabezados o pies antes de la
  // siguiente fecha. El puesto real es el ultimo fragmento util.
  text = text
    .replace(/^.*?(?:PERFILES|HORA DE FICHAJE|PUESTO DE CONTROL)\s+/i, '')
    .replace(/^.*?P[ÁA]GINA\s+\d+\s+DE\s+\d+\s+/i, '')
    .trim();
  return text;
}

function anexarSinDuplicados_(records) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.ZNUBE_SHEET);
  const lastRow = sheet.getLastRow();
  const existing = new Set(lastRow > 1
    ? sheet.getRange(2, 10, lastRow - 1, 1).getDisplayValues().flat().filter(Boolean)
    : []);
  const fresh = records.filter(row => !existing.has(row[9]));
  if (!fresh.length) return 0;
  sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, fresh[0].length).setValues(fresh);
  sheet.getRange(sheet.getLastRow() - fresh.length + 1, 7, fresh.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return fresh.length;
}

/** Agrega al PADRON los legajos de zNube que todavia no existen. */
function sincronizarPadronDesdeZnube_(records) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.PADRON_SHEET);
  if (!sheet) throw new Error(`No existe la hoja ${CONFIG.PADRON_SHEET}.`);

  const lastRow = sheet.getLastRow();
  const existingIds = new Set(lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat()
      .map(value => String(value || '').trim())
      .filter(Boolean)
    : []);
  const pendingIds = new Set();
  const newRows = [];

  records.forEach(record => {
    const employeeId = String(record[2] || '').trim();
    if (!employeeId || existingIds.has(employeeId) || pendingIds.has(employeeId)) return;
    pendingIds.add(employeeId);
    newRows.push([
      employeeId,
      limpiarNombre_(record[3]),
      '', // Puesto de control zNube no siempre equivale a sucursal_base.
      rolPadronDesdePerfil_(record[5]),
      '', // horario_teorico_entrada: requiere definicion administrativa.
      '', // ESTADO: se deja sin completar para no inventar una categoria.
    ]);
  });

  if (!newRows.length) return 0;
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, newRows.length, 6).setValues(newRows);
  return newRows.length;
}

function rolPadronDesdePerfil_(profile) {
  const value = normalizarTexto_(profile);
  const roles = {
    'VENDEDORA': 'VENDEDOR',
    'VENDEDOR': 'VENDEDOR',
    'CAJERO/A': 'CAJERO',
    'ENCARGADO/A': 'ENCARGADO',
    'CADETE': 'CADETE',
    'WEB': 'WEB',
  };
  return roles[value] || value;
}

function reconstruirAuditoria_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const appSheet = ss.getSheetByName(CONFIG.SOURCE_SHEET);
  const znubeSheet = ss.getSheetByName(CONFIG.ZNUBE_SHEET);
  const auditSheet = ss.getSheetByName(CONFIG.AUDIT_SHEET);
  const appRows = appSheet.getLastRow() > 1
    ? appSheet.getRange(2, 1, appSheet.getLastRow() - 1, 10).getDisplayValues()
    : [];
  const znubeRows = znubeSheet.getLastRow() > 1
    ? znubeSheet.getRange(2, 1, znubeSheet.getLastRow() - 1, 10).getDisplayValues()
    : [];

  const byPersonDay = new Map();
  appRows.forEach(row => {
    const [date, branch, id, name, eventType, declaredTime, loadedAt, , note] = row;
    if (!date || !id || normalizarTexto_(eventType) !== 'ENTRADA') return;
    const key = `${normalizarFecha_(date)}|${String(id).trim()}`;
    const item = byPersonDay.get(key) || crearAuditoriaBase_(normalizarFecha_(date), id);
    const candidate = {branch, name, declaredTime, loadedAt, note};
    if (!item.app || String(loadedAt) < String(item.app.loadedAt)) item.app = candidate;
    byPersonDay.set(key, item);
  });

  znubeRows.forEach(row => {
    const [date, controlPoint, id, name, punchTime, profile] = row;
    if (!date || !id) return;
    const key = `${normalizarFecha_(date)}|${String(id).trim()}`;
    const item = byPersonDay.get(key) || crearAuditoriaBase_(normalizarFecha_(date), id);
    const candidate = {controlPoint, name, punchTime, profile};
    if (!item.znube || punchTime < item.znube.punchTime) item.znube = candidate;
    byPersonDay.set(key, item);
  });

  const rows = Array.from(byPersonDay.values()).map(item => {
    const app = item.app || {};
    const znube = item.znube || {};
    const status = item.app && item.znube ? 'AMBOS' : item.app ? 'SOLO APP' : 'SOLO ZNUBE';
    return [
      item.date, item.id, app.name || znube.name || '', status,
      app.branch || '', znube.controlPoint || '', app.declaredTime || '',
      app.loadedAt || '', znube.punchTime || '', znube.profile || '', app.note || '',
    ];
  }).sort((a, b) => String(b[0]).localeCompare(String(a[0])) || Number(a[1]) - Number(b[1]));

  if (auditSheet.getLastRow() > 1) {
    auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, auditSheet.getMaxColumns()).clearContent();
  }
  if (rows.length) auditSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  auditSheet.setFrozenRows(1);
  auditSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
  auditSheet.autoResizeColumns(1, 11);
}

function asegurarHojas_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  asegurarHoja_(ss, CONFIG.ZNUBE_SHEET, [
    'fecha', 'puesto_control', 'vendedor_id', 'vendedor_nombre', 'hora_fichaje',
    'perfil', 'fecha_email', 'gmail_message_id', 'archivo_pdf', 'clave_unica',
  ]);
  asegurarHoja_(ss, CONFIG.AUDIT_SHEET, [
    'fecha', 'vendedor_id', 'vendedor_nombre', 'estado_cruce', 'sucursal_app',
    'puesto_control_znube', 'hora_declarada_app', 'timestamp_carga_app',
    'hora_fichaje_znube', 'perfil_znube', 'observacion_app',
  ]);
  asegurarHoja_(ss, CONFIG.LOG_SHEET, [
    'procesado_el', 'fecha_email', 'gmail_message_id', 'asunto', 'estado', 'filas_nuevas', 'detalle',
  ]);
}

function asegurarHoja_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function registrarLog_(message, status, rows, detail) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.LOG_SHEET);
  sheet.appendRow([new Date(), message.getDate(), message.getId(), message.getSubject(), status, rows, String(detail || '').slice(0, 4000)]);
}

function esCorreoObjetivo_(message) {
  return /znube@zoologic\.com\.ar/i.test(message.getFrom()) &&
    /Reporte zNube - FICHAJES/i.test(message.getSubject()) &&
    !/TOTALES POR EMPLEADO/i.test(message.getSubject());
}

function obtenerOCrearEtiqueta_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function crearAuditoriaBase_(date, id) {
  return {date, id: String(id).trim(), app: null, znube: null};
}

function fechaIso_(ddmmyyyy) {
  const [day, month, year] = ddmmyyyy.split('/');
  return `${year}-${month}-${day}`;
}

function normalizarFecha_(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return fechaIso_(text);
  const date = new Date(value);
  return isNaN(date.getTime()) ? text : Utilities.formatDate(date, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
}

function normalizarTexto_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function limpiarNombre_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}
