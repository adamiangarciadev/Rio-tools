const CONTACT_APP = {
  folderId: "1b_Apvk4cRyW1Nzg6N5jJuL9vijKSJDH7",
  stateFileName: "clientes_contactar_estado.json",
  passwordHash: "053f327ecdc9c92e2ea2487b498240654b4085e74576439468a5a8d5954916b7",
  botApiKeyHash: "268f729b13809c8ceddfff970d9a21359660591be159936a4be75384e507c903",
  sessionHours: 6,
  terminalStatuses: ["no_responde", "ya_no_vende", "bloqueado", "no_contactar"],
  allowedStatuses: ["pendiente", "contactado", "no_responde", "ya_no_vende", "bloqueado", "no_contactar"]
};

function doGet() { return jsonOutput_({ ok: true, app: "clientes-contactar", now: new Date().toISOString() }); }
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "login") return jsonOutput_(login_(body));
    if (body.action === "getState") { requireSession_(body.token); return jsonOutput_({ ok: true, state: readState_() }); }
    if (body.action === "updateClient") { requireSession_(body.token); return jsonOutput_({ ok: true, state: updateClient_(body) }); }
    if (body.action === "botPull") { requireBot_(body.apiKey); return jsonOutput_({ ok: true, state: readState_() }); }
    if (body.action === "botSync") { requireBot_(body.apiKey); return jsonOutput_({ ok: true, state: syncBot_(body.payload || {}) }); }
    throw new Error("Accion no valida.");
  } catch (error) { return jsonOutput_({ ok: false, error: String(error && error.message || error) }); }
}

function login_(body) {
  if (!safeEquals_(String(body.passwordHash || "").toLowerCase(), CONTACT_APP.passwordHash)) throw new Error("Clave incorrecta.");
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("session:" + token, "1", CONTACT_APP.sessionHours * 3600);
  return { ok: true, token: token, expiresIn: CONTACT_APP.sessionHours * 3600 };
}
function requireSession_(token) { if (!token || !CacheService.getScriptCache().get("session:" + token)) throw new Error("La sesion vencio. Volve a ingresar."); }
function requireBot_(apiKey) { if (!safeEquals_(sha256_(String(apiKey || "")), CONTACT_APP.botApiKeyHash)) throw new Error("Bot no autorizado."); }

function updateClient_(body) {
  return withStateLock_(function(state) {
    const id = String(body.clienteId || "");
    const status = String(body.status || "");
    if (!id || !state.clients[id]) throw new Error("Cliente inexistente.");
    if (CONTACT_APP.allowedStatuses.indexOf(status) < 0) throw new Error("Estado no valido.");
    const now = new Date().toISOString();
    const client = state.clients[id];
    const oldStatus = client.status || "pendiente";
    client.status = status; client.note = String(body.note || "").slice(0, 1000); client.statusUpdatedAt = now;
    appendEvent_(state, { at: now, type: "status_changed", source: "web", clienteId: id, oldStatus: oldStatus, status: status, note: client.note });
    return state;
  });
}

function syncBot_(payload) {
  return withStateLock_(function(state) {
    const incomingClients = payload.clients || {};
    Object.keys(incomingClients).forEach(function(id) {
      const incoming = incomingClients[id] || {}, current = state.clients[id] || {};
      const manualNewer = current.statusUpdatedAt && String(current.statusUpdatedAt) > String(incoming.statusUpdatedAt || "");
      state.clients[id] = Object.assign({}, current, incoming, manualNewer ? { status: current.status, note: current.note, statusUpdatedAt: current.statusUpdatedAt } : {});
    });
    (payload.events || []).forEach(function(event) { if (!state.events.some(function(item) { return item.id === event.id; })) state.events.push(event); });
    if (payload.dailyRun && !state.dailyRuns.some(function(run) { return run.date === payload.dailyRun.date; })) state.dailyRuns.push(payload.dailyRun);
    state.dailyRuns = state.dailyRuns.slice(-400); state.events = state.events.slice(-50000);
    return state;
  });
}

function readState_() {
  const file = stateFile_();
  if (!file) return emptyState_();
  try { return JSON.parse(file.getBlob().getDataAsString("UTF-8")); } catch (error) { throw new Error("No se pudo leer el JSON de seguimiento: " + error.message); }
}
function withStateLock_(callback) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { const state = readState_(); const result = callback(state) || state; result.updatedAt = new Date().toISOString(); writeState_(result); return result; } finally { lock.releaseLock(); }
}
function writeState_(state) {
  const folder = DriveApp.getFolderById(CONTACT_APP.folderId); const content = JSON.stringify(state, null, 2); const file = stateFile_();
  if (file) file.setContent(content); else folder.createFile(CONTACT_APP.stateFileName, content, MimeType.PLAIN_TEXT);
}
function stateFile_() { const files = DriveApp.getFolderById(CONTACT_APP.folderId).getFilesByName(CONTACT_APP.stateFileName); return files.hasNext() ? files.next() : null; }
function emptyState_() { return { version: 1, updatedAt: new Date().toISOString(), config: { minInactiveDays: 40, maxInactiveMonths: 6, qualifyingLists: ["LISTA1", "WEBMAY"] }, clients: {}, dailyRuns: [], events: [] }; }
function appendEvent_(state, event) { state.events.push(Object.assign({ id: Utilities.getUuid() }, event)); }
function jsonOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function sha256_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(b){ const n=(b+256)%256; return (n<16?"0":"")+n.toString(16); }).join(""); }
function safeEquals_(a,b) { a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }

function probarConfiguracionClientesContactar() {
  const folder = DriveApp.getFolderById(CONTACT_APP.folderId);
  Logger.log("Carpeta: " + folder.getName());
  const state = withStateLock_(function(value) { return value; });
  Logger.log("Estado listo. Clientes: " + Object.keys(state.clients).length);
}
