// Apps Script independiente: únicamente lee la base privada de Objetivos de ventas.
// Usar apps-script.gs (generado) como Code.gs, no pegar este archivo por separado.
function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  let payload;
  try {
    if (params.action !== "supervisionDashboard") throw new Error("Consulta no disponible.");
    payload = { ok: true, data: getSupervisionDashboard(params.passwordHash) };
  } catch (error) {
    payload = { ok: false, error: error.message || "No se pudo consultar la base de objetivos." };
  }
  const content = JSON.stringify(payload);
  if (!params.callback) return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
  if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(String(params.callback))) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Callback inválido." })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(params.callback + "(" + content + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getSupervisionDashboard(passwordHash) {
  const hash = String(passwordHash || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) || !safeEquals_(SUPERVISION_PASSWORD_HASH, hash)) {
    throw new Error("El acceso de Supervisores no es válido. Ingresá desde RÍO Tools.");
  }
  const state = readState_();
  const knownIds = APP.stores.map(function (store) { return store.id; });
  if (Object.keys(state.sales).some(function (id) { return knownIds.indexOf(id) === -1; })) {
    throw new Error("La base tiene locales nuevos. Actualizá la configuración del control de objetivos.");
  }
  return {
    role: "supervision",
    month: state.month,
    today: Utilities.formatDate(new Date(), APP.timezone, "yyyy-MM-dd"),
    updatedAt: state.updatedAt || null,
    stores: APP.stores.map(function (store) {
      const goal = goalForStore_(state, store);
      return { id: store.id, name: store.name, goal: goal, monthPlan: monthPlan_(state, store, state.sales[store.id] || [], goal) };
    })
  };
}

function readState_() {
  // No crea archivos, no modifica el mes, no importa mails y no guarda datos.
  const file = DriveApp.getFileById(APP.dataFileId);
  let state;
  try { state = JSON.parse(file.getBlob().getDataAsString("UTF-8")); }
  catch (error) { throw new Error("No se pudo leer el JSON de objetivos de ventas."); }
  if (!state || !/^\d{4}-(0[1-9]|1[0-2])$/.test(state.month) || !state.sales || typeof state.sales !== "object" || Array.isArray(state.sales)) {
    throw new Error("El JSON de objetivos no tiene un formato válido.");
  }
  Object.keys(state.sales).forEach(function (id) {
    const records = state.sales[id];
    const dates = {};
    if (!Array.isArray(records)) throw new Error("Las ventas del local no tienen un formato válido.");
    records.forEach(function (record) {
      if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || record.date.slice(0, 7) !== state.month || dates[record.date] || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0 || record.targetAtStart == null || !Number.isFinite(Number(record.targetAtStart)) || Number(record.targetAtStart) < 0) {
        throw new Error("Hay ventas u objetivos históricos incompletos en el JSON. Revisalos desde Objetivos de ventas.");
      }
      dates[record.date] = true;
    });
  });
  return state;
}
