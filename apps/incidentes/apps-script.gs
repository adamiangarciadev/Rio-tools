/**
 * RIO Tools · Backend de incidentes en JSON
 *
 * Guarda la base completa en un archivo JSON de Google Drive.
 * Los adjuntos se guardan en una carpeta separada de Drive.
 *
 * Puesta en marcha:
 * 1. Crear un proyecto de Apps Script y pegar este archivo.
 * 2. Ejecutar configurar() una vez y autorizar permisos.
 * 3. Implementar > Nueva implementación > Aplicación web.
 *    Ejecutar como: yo. Acceso: cualquier usuario con el enlace.
 * 4. Copiar la URL /exec en apps/incidentes/api-config.js.
 */

const CONFIG = {
  rootFolderId: "1CZVilVHfAibuL5nvAELaC0Mr5o8wqIze",
  databaseProperty: "INCIDENTES_JSON_FILE_ID",
  folderProperty: "INCIDENTES_FOLDER_ID",
  databaseName: "rio-incidentes.json",
  attachmentsFolderName: "RIO · Adjuntos de incidentes",
  validStatuses: ["Abierto", "En proceso", "Resuelto", "Cerrado"]
};

function configurar() {
  const props = PropertiesService.getScriptProperties();
  const root = DriveApp.getFolderById(CONFIG.rootFolderId);
  let databaseId = props.getProperty(CONFIG.databaseProperty);
  let folderId = props.getProperty(CONFIG.folderProperty);

  if (!databaseId || !fileExists_(databaseId)) {
    const file = root.createFile(Utilities.newBlob(JSON.stringify(emptyDatabase_(), null, 2), MimeType.PLAIN_TEXT, CONFIG.databaseName));
    databaseId = file.getId();
    props.setProperty(CONFIG.databaseProperty, databaseId);
  } else {
    DriveApp.getFileById(databaseId).moveTo(root);
  }

  if (!folderId || !folderExists_(folderId)) {
    const folder = root.createFolder(CONFIG.attachmentsFolderName);
    folderId = folder.getId();
    props.setProperty(CONFIG.folderProperty, folderId);
  } else {
    DriveApp.getFolderById(folderId).moveTo(root);
  }

  return {
    databaseId: databaseId,
    databaseUrl: DriveApp.getFileById(databaseId).getUrl(),
    folderId: folderId,
    folderUrl: DriveApp.getFolderById(folderId).getUrl(),
    rootFolderId: CONFIG.rootFolderId,
    rootFolderUrl: root.getUrl()
  };
}

function doGet(e) {
  try {
    ensureConfigured_();
    const action = clean_(e && e.parameter && e.parameter.action) || "listar";
    if (action === "listar") return json_({ ok: true, tickets: readDatabase_().tickets });
    if (action === "obtener") {
      const id = clean_(e && e.parameter && e.parameter.id);
      const ticket = readDatabase_().tickets.find(function (item) { return item.id === id; });
      return ticket ? json_({ ok: true, ticket: ticket }) : json_({ ok: false, error: "Incidente no encontrado" });
    }
    return json_({ ok: false, error: "Acción no reconocida" });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    ensureConfigured_();
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (data.action === "crear") return json_({ ok: true, ticket: createTicket_(data) });
    if (data.action === "actualizar") return json_({ ok: true, ticket: updateTicket_(data) });
    return json_({ ok: false, error: "Acción no reconocida" });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function createTicket_(data) {
  ["branch", "reporterCode", "area", "priority", "title", "description"].forEach(function (key) {
    if (!clean_(data[key])) throw new Error("Falta completar: " + key);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const database = readDatabase_();
    const sequence = Math.max(1, Number(database.nextSequence) || 1);
    const id = "INC-" + String(sequence).padStart(5, "0");
    const now = new Date().toISOString();
    const ticket = {
      id: id,
      createdAt: now,
      updatedAt: now,
      status: "Abierto",
      priority: clean_(data.priority),
      branch: clean_(data.branch).toUpperCase(),
      reporterCode: clean_(data.reporterCode),
      area: clean_(data.area),
      title: clean_(data.title).slice(0, 100),
      description: clean_(data.description).slice(0, 2000),
      attachments: saveAttachments_(id, data.attachments || []),
      assigneeCode: "",
      assignee: "",
      history: []
    };
    database.nextSequence = sequence + 1;
    database.tickets.unshift(ticket);
    writeDatabase_(database);
    return ticket;
  } finally {
    lock.releaseLock();
  }
}

function updateTicket_(data) {
  const id = clean_(data.id);
  const status = clean_(data.status);
  const assigneeCode = clean_(data.assigneeCode).replace(/\D/g, "").slice(0, 20);
  const assignee = clean_(data.assignee).slice(0, 80);
  const note = clean_(data.note).slice(0, 1000);
  if (!id || CONFIG.validStatuses.indexOf(status) < 0) throw new Error("ID o estado inválido");
  if (!assigneeCode || !assignee) throw new Error("Responsable inválido");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const database = readDatabase_();
    const index = database.tickets.findIndex(function (item) { return item.id === id; });
    if (index < 0) throw new Error("No se encontró el incidente " + id);
    const now = new Date().toISOString();
    const ticket = database.tickets[index];
    ticket.status = status;
    ticket.assigneeCode = assigneeCode;
    ticket.assignee = assignee;
    ticket.updatedAt = now;
    if (!Array.isArray(ticket.history)) ticket.history = [];
    ticket.history.push({ at: now, status: status, assigneeCode: assigneeCode, assignee: assignee, note: note });
    database.tickets[index] = ticket;
    writeDatabase_(database);
    return ticket;
  } finally {
    lock.releaseLock();
  }
}

function readDatabase_() {
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.databaseProperty);
  const content = DriveApp.getFileById(id).getBlob().getDataAsString("UTF-8");
  let parsed;
  try { parsed = JSON.parse(content); } catch (_) { throw new Error("El archivo de incidentes contiene JSON inválido"); }
  if (!parsed || typeof parsed !== "object") parsed = emptyDatabase_();
  if (!Array.isArray(parsed.tickets)) parsed.tickets = [];
  if (!Number(parsed.nextSequence)) parsed.nextSequence = inferNextSequence_(parsed.tickets);
  return parsed;
}

function writeDatabase_(database) {
  database.updatedAt = new Date().toISOString();
  DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty(CONFIG.databaseProperty))
    .setContent(JSON.stringify(database, null, 2));
}

function emptyDatabase_() {
  return { version: 1, nextSequence: 1, updatedAt: new Date().toISOString(), tickets: [] };
}

function inferNextSequence_(tickets) {
  const highest = tickets.reduce(function (max, ticket) {
    const value = Number(String(ticket.id || "").replace(/\D/g, "")) || 0;
    return Math.max(max, value);
  }, 0);
  return highest + 1;
}

function saveAttachments_(ticketId, items) {
  if (!Array.isArray(items) || !items.length) return [];
  if (items.length > 6) throw new Error("Máximo 6 adjuntos");
  const root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty(CONFIG.folderProperty));
  const folder = root.createFolder(ticketId);
  return items.map(function (item) {
    const match = String(item.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Adjunto inválido: " + clean_(item.name));
    const bytes = Utilities.base64Decode(match[2]);
    if (bytes.length > 10 * 1024 * 1024) throw new Error("El archivo supera 10 MB: " + clean_(item.name));
    const safeName = clean_(item.name).replace(/[\\/:*?"<>|]/g, "_");
    const file = folder.createFile(Utilities.newBlob(bytes, match[1], safeName));
    return { name: safeName, type: match[1], size: bytes.length, url: file.getUrl(), id: file.getId() };
  });
}

function ensureConfigured_() {
  const props = PropertiesService.getScriptProperties();
  const databaseId = props.getProperty(CONFIG.databaseProperty);
  const folderId = props.getProperty(CONFIG.folderProperty);
  if (!databaseId || !folderId || !fileExists_(databaseId) || !folderExists_(folderId)) configurar();
}

function fileExists_(id) { try { DriveApp.getFileById(id).getName(); return true; } catch (_) { return false; } }
function folderExists_(id) { try { DriveApp.getFolderById(id).getName(); return true; } catch (_) { return false; } }
function clean_(value) { return String(value == null ? "" : value).trim(); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
