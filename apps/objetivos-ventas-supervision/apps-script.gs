// Generado con node tools/build-objetivos-supervision.cjs.
// Proyecto NUEVO de Apps Script; no reemplaza Objetivos de ventas.

const APP = Object.freeze({
  "dataFileId": "15bLGvWxs2p1VZ1VNZyCAaK9nGPQkyBLD",
  "timezone": "America/Argentina/Buenos_Aires",
  "dayWeights": {
    "weekday": 1,
    "saturday": 1.3,
    "holiday": 0.75
  },
  "holidays": [
    "2026-08-17"
  ],
  "stores": [
    {
      "id": "avellaneda-2900",
      "name": "Avellaneda 2900",
      "monthlyGoal": 120000000,
      "weekdayWeights": [
        0,
        0.927,
        0.813,
        0.967,
        1.064,
        1.229,
        2.117
      ]
    },
    {
      "id": "avellaneda-3249",
      "name": "Avellaneda 3249",
      "monthlyGoal": 115000000,
      "weekdayWeights": [
        0,
        0.958,
        0.819,
        0.941,
        0.876,
        1.406,
        2.134
      ]
    },
    {
      "id": "castelli",
      "name": "Castelli",
      "monthlyGoal": 40000000,
      "weekdayWeights": [
        0,
        0.829,
        1.004,
        0.913,
        1.077,
        1.178,
        1.388
      ]
    },
    {
      "id": "corrientes",
      "name": "Corrientes",
      "monthlyGoal": 65000000,
      "weekdayWeights": [
        0,
        0.98,
        0.889,
        0.967,
        0.945,
        1.219,
        1.59
      ]
    },
    {
      "id": "lamarca",
      "name": "Lamarca",
      "monthlyGoal": 60000000,
      "weekdayWeights": [
        0,
        1.015,
        0.805,
        1.023,
        0.958,
        1.198,
        2.313
      ]
    },
    {
      "id": "pueyrredon",
      "name": "Pueyrredón",
      "monthlyGoal": 80000000,
      "weekdayWeights": [
        0,
        1.007,
        0.922,
        0.947,
        0.95,
        1.173,
        1.545
      ]
    },
    {
      "id": "quilmes",
      "name": "Quilmes",
      "monthlyGoal": 55000000,
      "weekdayWeights": [
        0,
        0.871,
        0.885,
        0.957,
        1.106,
        1.181,
        1.772
      ]
    },
    {
      "id": "sarmiento",
      "name": "Sarmiento",
      "monthlyGoal": 72000000,
      "weekdayWeights": [
        0,
        0.865,
        0.889,
        0.961,
        1.087,
        1.199,
        1.379
      ]
    },
    {
      "id": "web",
      "name": "Web",
      "monthlyGoal": 73000000,
      "weekdayWeights": [
        0,
        0.848,
        0.98,
        1.056,
        1.075,
        1.041,
        1.236
      ]
    }
  ]
});
const SUPERVISION_PASSWORD_HASH = "dbb91e7e659e7def6dcb38f9a69003505ae742317d02e57ae7ad12bfb5570f98";

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


function monthPlan_(state, store, records, monthlyGoal) {
  const parts = state.month.split("-").map(Number);
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  const todayKey = Utilities.formatDate(new Date(), APP.timezone, "yyyy-MM-dd");
  const accumulated = records.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
  const remaining = Math.max(0, monthlyGoal - accumulated);
  const byDate = {};
  records.forEach(function (item) { byDate[item.date] = item; });
  const allocationStart = parseLocalDate_(todayKey);
  if (byDate[todayKey]) allocationStart.setDate(allocationStart.getDate() + 1);
  const allocationStartKey = Utilities.formatDate(allocationStart, APP.timezone, "yyyy-MM-dd");
  const currentWeight = state.month === todayKey.slice(0, 7) ? remainingWeight_(allocationStart, store) : 0;

  const plan = [];
  for (let dayNumber = 1; dayNumber <= lastDay; dayNumber += 1) {
    const date = new Date(parts[0], parts[1] - 1, dayNumber, 12, 0, 0);
    const dateKey = Utilities.formatDate(date, APP.timezone, "yyyy-MM-dd");
    const record = byDate[dateKey];
    let target = 0;
    if (record && record.targetAtStart != null) target = Number(record.targetAtStart);
    else if (dateKey >= allocationStartKey && currentWeight > 0) target = remaining * dayWeight_(date, store) / currentWeight;
    const amount = record ? Number(record.amount || 0) : null;
    plan.push({
      date: dateKey,
      dayType: dayType_(date),
      target: target,
      amount: amount,
      achievedPercent: amount == null ? null : percent_(amount, target),
      difference: amount == null ? null : amount - target
    });
  }
  return plan;
}

function remainingWeight_(fromDate, store) {
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12, 0, 0);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12, 0, 0);
  let total = 0;
  while (cursor <= last) {
    total += dayWeight_(cursor, store);
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function dayWeight_(date, store) {
  if (date.getDay() === 0) return 0;
  const dateKey = Utilities.formatDate(date, APP.timezone, "yyyy-MM-dd");
  if (APP.holidays.indexOf(dateKey) !== -1) return APP.dayWeights.holiday;
  if (store && Array.isArray(store.weekdayWeights)) return Number(store.weekdayWeights[date.getDay()] || 0);
  if (date.getDay() === 6) return APP.dayWeights.saturday;
  return APP.dayWeights.weekday;
}

function dayType_(date) {
  const dateKey = Utilities.formatDate(date, APP.timezone, "yyyy-MM-dd");
  if (APP.holidays.indexOf(dateKey) !== -1) return "holiday";
  if (date.getDay() === 6) return "saturday";
  if (date.getDay() === 0) return "closed";
  return "weekday";
}

function parseLocalDate_(dateKey) {
  const parts = dateKey.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function percent_(value, total) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function safeEquals_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function goalForStore_(state, store) {
  return state.goals && Number(state.goals[store.id]) > 0 ? Number(state.goals[store.id]) : store.monthlyGoal;
}
