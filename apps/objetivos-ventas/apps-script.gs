const APP = Object.freeze({
  folderName: "RIO - Objetivos de ventas",
  dataFileName: "ventas-dashboard.json",
  sender: "znube@zoologic.com.ar",
  subject: "Cubo zNube",
  timezone: "America/Argentina/Buenos_Aires",
  sessionHours: 6,
  dayWeights: { weekday: 1, saturday: 1.30, holiday: 0.75 },
  holidays: ["2026-08-17"],
  admin: { email: "sistemas@rio.com.ar", password: "sistemas2026" },
  stores: [
    { id: "avellaneda-2900", csvName: "Avellaneda 2900", name: "Avellaneda 2900", email: "avellaneda2900@rio.com.ar", password: "avellaneda29002026", monthlyGoal: 120000000, weekdayWeights: [0, 0.927, 0.813, 0.967, 1.064, 1.229, 2.117] },
    { id: "avellaneda-3249", csvName: "Avellaneda 3249", name: "Avellaneda 3249", email: "avellaneda3249@rio.com.ar", password: "avellaneda32492026", monthlyGoal: 115000000, weekdayWeights: [0, 0.958, 0.819, 0.941, 0.876, 1.406, 2.134] },
    { id: "castelli", csvName: "Castelli", name: "Castelli", email: "castelli@rio.com.ar", password: "castelli2026", monthlyGoal: 40000000, weekdayWeights: [0, 0.829, 1.004, 0.913, 1.077, 1.178, 1.388] },
    { id: "corrientes", csvName: "Corrientes", name: "Corrientes", email: "corrientes@rio.com.ar", password: "corrientes2026", monthlyGoal: 65000000, weekdayWeights: [0, 0.980, 0.889, 0.967, 0.945, 1.219, 1.590] },
    { id: "lamarca", csvName: "Lamarca", name: "Lamarca", email: "lamarca@rio.com.ar", password: "lamarca2026", monthlyGoal: 60000000, weekdayWeights: [0, 1.015, 0.805, 1.023, 0.958, 1.198, 2.313] },
    { id: "pueyrredon", csvName: "PUEYRREDON", name: "Pueyrredón", email: "pueyrredon@rio.com.ar", password: "pueyrredon2026", monthlyGoal: 80000000, weekdayWeights: [0, 1.007, 0.922, 0.947, 0.950, 1.173, 1.545] },
    { id: "quilmes", csvName: "Quilmes", name: "Quilmes", email: "quilmes@rio.com.ar", password: "quilmes2026", monthlyGoal: 55000000, weekdayWeights: [0, 0.871, 0.885, 0.957, 1.106, 1.181, 1.772] },
    { id: "sarmiento", csvName: "Sarmiento", name: "Sarmiento", email: "sarmiento@rio.com.ar", password: "sarmiento2026", monthlyGoal: 72000000, weekdayWeights: [0, 0.865, 0.889, 0.961, 1.087, 1.199, 1.379] },
    { id: "web", csvName: "Web", name: "Web", email: "web@rio.com.ar", password: "web2026", monthlyGoal: 73000000, weekdayWeights: [0, 0.848, 0.980, 1.056, 1.075, 1.041, 1.236] }
  ]
});

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  try {
    let result;
    if (params.action === "login") result = login(params.email, params.passwordHash);
    else if (params.action === "dashboard") result = getDashboard(params.token);
    else if (params.action === "adminDashboard") result = getAdminDashboard(params.token);
    else if (params.action === "updateGoals") result = updateGoals(params.token, params.goals);
    else if (params.action === "logout") result = logout(params.token);
    else result = { status: "ok", service: "RIO Objetivos de venta" };
    return jsonp_(params.callback, { ok: true, data: result });
  } catch (error) {
    return jsonp_(params.callback, { ok: false, error: error.message || String(error) });
  }
}

function login(email, passwordHash) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (APP.admin.email.toLowerCase() === normalizedEmail && safeEquals_(sha256_(APP.admin.password), String(passwordHash || "").toLowerCase())) {
    const adminToken = Utilities.getUuid() + Utilities.getUuid();
    CacheService.getScriptCache().put("session:" + adminToken, "admin", APP.sessionHours * 3600);
    return { token: adminToken, role: "admin", dashboard: adminDashboard_() };
  }
  const store = APP.stores.find(function (item) {
    return item.email.toLowerCase() === normalizedEmail && safeEquals_(sha256_(item.password), String(passwordHash || "").toLowerCase());
  });
  if (!store) {
    throw new Error("Mail o contraseña incorrectos.");
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("session:" + token, store.id, APP.sessionHours * 3600);
  return { token: token, role: "store", dashboard: dashboardForStore_(store.id) };
}

function getDashboard(token) {
  const storeId = CacheService.getScriptCache().get("session:" + String(token || ""));
  if (!storeId) throw new Error("La sesión venció. Volvé a ingresar.");
  if (storeId === "admin") throw new Error("Esta sesión corresponde a Sistemas.");
  return dashboardForStore_(storeId);
}

function getAdminDashboard(token) {
  requireAdmin_(token);
  return adminDashboard_();
}

function updateGoals(token, goalsJson) {
  requireAdmin_(token);
  const updates = JSON.parse(String(goalsJson || "{}"));
  const state = readState_();
  if (!state.goals) state.goals = defaultGoals_();
  APP.stores.forEach(function (store) {
    if (!Object.prototype.hasOwnProperty.call(updates, store.id)) return;
    const value = Number(updates[store.id]);
    if (!Number.isFinite(value) || value <= 0 || value > 9999999999) throw new Error("Objetivo inválido para " + store.name + ".");
    state.goals[store.id] = Math.round(value * 100) / 100;
  });
  state.updatedAt = new Date().toISOString();
  writeState_(state);
  return adminDashboard_();
}

function requireAdmin_(token) {
  const role = CacheService.getScriptCache().get("session:" + String(token || ""));
  if (role !== "admin") throw new Error("La sesión de Sistemas venció o no es válida.");
}

function logout(token) {
  CacheService.getScriptCache().remove("session:" + String(token || ""));
  return true;
}

function jsonp_(callback, payload) {
  const callbackName = /^[a-zA-Z_$][0-9a-zA-Z_$\.]*$/.test(String(callback || "")) ? String(callback) : "console.log";
  return ContentService
    .createTextOutput(callbackName + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function (byte) { return (byte + 256).toString(16).slice(-2); })
    .join("");
}

function processSalesEmails() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const monthKey = Utilities.formatDate(now, APP.timezone, "yyyy-MM");
    const state = readState_();
    if (state.month !== monthKey) resetMonth_(state, monthKey);

    const processed = state.processedMessageIds || [];
    const query = "from:(" + APP.sender + ") subject:(" + APP.subject + ") has:attachment newer_than:31d";
    const messages = [];
    GmailApp.search(query, 0, 30).forEach(function (thread) {
      thread.getMessages().forEach(function (message) { messages.push(message); });
    });
    messages.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
    messages.forEach(function (message) {
        if (processed.indexOf(message.getId()) !== -1) return;
        const csvAttachment = message.getAttachments().find(function (attachment) {
          return /\.csv$/i.test(attachment.getName());
        });
        if (!csvAttachment) return;

        const dateKey = Utilities.formatDate(message.getDate(), APP.timezone, "yyyy-MM-dd");
        if (dateKey.slice(0, 7) !== monthKey) return;
        const sales = parseSalesCsv_(csvAttachment.getDataAsString("UTF-8"));
        APP.stores.forEach(function (store) {
          if (Object.prototype.hasOwnProperty.call(sales, normalize_(store.csvName))) {
            upsertSale_(state, store.id, dateKey, sales[normalize_(store.csvName)]);
          }
        });
        processed.push(message.getId());
    });

    state.processedMessageIds = processed.slice(-250);
    state.updatedAt = new Date().toISOString();
    writeState_(state);
    return { ok: true, updatedAt: state.updatedAt, processedMessages: processed.length };
  } finally {
    lock.releaseLock();
  }
}

function recalculateCurrentMonthTargets() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const state = readState_();
    APP.stores.forEach(function (store) {
      let accumulated = 0;
      const goal = goalForStore_(state, store);
      const records = (state.sales[store.id] || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      records.forEach(function (record) {
        const date = parseLocalDate_(record.date);
        record.targetAtStart = weightedTarget_(Math.max(0, goal - accumulated), date, store);
        record.dayType = dayType_(date);
        accumulated += Number(record.amount || 0);
      });
      state.sales[store.id] = records;
    });
    state.updatedAt = new Date().toISOString();
    writeState_(state);
    return { ok: true, message: "Objetivos históricos recalculados con la distribución por local.", updatedAt: state.updatedAt };
  } finally {
    lock.releaseLock();
  }
}

function installNightlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "processSalesEmails") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("processSalesEmails")
    .timeBased()
    .atHour(21)
    .nearMinute(20)
    .everyDays(1)
    .inTimezone(APP.timezone)
    .create();
  return "Trigger diario instalado para aproximadamente las 21:20.";
}

function initializeApp() {
  validateConfiguration_();
  const state = initialState_();
  writeState_(state);
  installNightlyTrigger();
  return { ok: true, folder: APP.folderName, file: APP.dataFileName };
}

function validateConfiguration_() {
  const invalid = APP.stores.filter(function (store) {
    return !store.email || !store.password || !(store.monthlyGoal > 0);
  });
  if (invalid.length) {
    throw new Error("Falta completar mail, contraseña u objetivo mensual: " + invalid.map(function (s) { return s.name; }).join(", "));
  }
}

function dashboardForStore_(storeId) {
  const store = APP.stores.find(function (item) { return item.id === storeId; });
  if (!store) throw new Error("Local no configurado.");
  const state = readState_();
  const monthlyGoal = goalForStore_(state, store);
  const records = (state.sales[storeId] || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
  const accumulated = records.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
  const remaining = Math.max(0, monthlyGoal - accumulated);
  const todayKey = Utilities.formatDate(new Date(), APP.timezone, "yyyy-MM-dd");
  const todayRecord = records.find(function (item) { return item.date === todayKey; });
  const remainingDays = remainingBusinessDays_(new Date());
  const requiredPerDay = weightedTarget_(remaining, new Date(), store);
  const todayTarget = todayRecord && todayRecord.targetAtStart != null ? todayRecord.targetAtStart : requiredPerDay;
  const todayAmount = todayRecord ? todayRecord.amount : 0;

  return {
    store: { id: store.id, name: store.name },
    month: state.month,
    updatedAt: state.updatedAt,
    goal: monthlyGoal,
    accumulated: accumulated,
    remaining: remaining,
    progressPercent: percent_(accumulated, monthlyGoal),
    remainingPercent: Math.max(0, 100 - percent_(accumulated, monthlyGoal)),
    today: {
      date: todayKey,
      amount: todayAmount,
      target: todayTarget,
      achievedPercent: percent_(todayAmount, todayTarget),
      difference: todayAmount - todayTarget
    },
    remainingBusinessDays: remainingDays,
    requiredPerDay: requiredPerDay,
    history: records.map(function (item) {
      return {
        date: item.date,
        amount: item.amount,
        target: item.targetAtStart,
        achievedPercent: percent_(item.amount, item.targetAtStart),
        difference: item.amount - item.targetAtStart
      };
    }).reverse(),
    monthPlan: monthPlan_(state, store, records, monthlyGoal)
  };
}

function adminDashboard_() {
  const state = readState_();
  return {
    role: "admin",
    month: state.month,
    updatedAt: state.updatedAt,
    stores: APP.stores.map(function (store) {
      const goal = goalForStore_(state, store);
      const accumulated = (state.sales[store.id] || []).reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
      return { id: store.id, name: store.name, goal: goal, accumulated: accumulated, progressPercent: percent_(accumulated, goal) };
    })
  };
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

function upsertSale_(state, storeId, dateKey, amount) {
  if (!state.sales[storeId]) state.sales[storeId] = [];
  const records = state.sales[storeId];
  const existing = records.find(function (item) { return item.date === dateKey; });
  if (existing) {
    existing.amount = amount;
    return;
  }
  const store = APP.stores.find(function (item) { return item.id === storeId; });
  const accumulatedBefore = records.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
  const day = parseLocalDate_(dateKey);
  const remainingAtStart = Math.max(0, goalForStore_(state, store) - accumulatedBefore);
  records.push({
    date: dateKey,
    amount: amount,
    targetAtStart: weightedTarget_(remainingAtStart, day, store),
    dayType: dayType_(day)
  });
}

function parseSalesCsv_(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const rows = Utilities.parseCsv(clean);
  const result = {};
  rows.forEach(function (row) {
    const label = String(row[0] || "").trim();
    if (!label || /^(comprobante|monto neto|origen|total general)$/i.test(label)) return;
    const amount = parseArgentineNumber_(row[1]);
    if (Number.isFinite(amount)) result[normalize_(label)] = amount;
  });
  return result;
}

function parseArgentineNumber_(value) {
  const normalized = String(value || "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function normalize_(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
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

function remainingBusinessDays_(fromDate) {
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  let count = 0;
  while (cursor <= last) {
    const weekday = cursor.getDay();
    if (weekday !== 0) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function weightedTarget_(remainingAmount, date, store) {
  const weight = dayWeight_(date, store);
  const totalWeight = remainingWeight_(date, store);
  return totalWeight > 0 ? remainingAmount * weight / totalWeight : remainingAmount;
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

function initialState_() {
  const month = Utilities.formatDate(new Date(), APP.timezone, "yyyy-MM");
  const sales = {};
  APP.stores.forEach(function (store) { sales[store.id] = []; });
  return { version: 1, month: month, updatedAt: null, processedMessageIds: [], goals: defaultGoals_(), sales: sales };
}

function resetMonth_(state, monthKey) {
  state.month = monthKey;
  state.sales = {};
  APP.stores.forEach(function (store) { state.sales[store.id] = []; });
  state.processedMessageIds = [];
  state.goals = defaultGoals_();
}

function readState_() {
  const file = findDataFile_();
  if (!file) return initialState_();
  try {
    const state = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!state.sales) throw new Error("JSON inválido");
    if (!state.goals) state.goals = defaultGoals_();
    return state;
  } catch (error) {
    throw new Error("No se pudo leer " + APP.dataFileName + ": " + error.message);
  }
}

function defaultGoals_() {
  const goals = {};
  APP.stores.forEach(function (store) { goals[store.id] = store.monthlyGoal; });
  return goals;
}

function goalForStore_(state, store) {
  return state.goals && Number(state.goals[store.id]) > 0 ? Number(state.goals[store.id]) : store.monthlyGoal;
}

function writeState_(state) {
  const folder = getOrCreateFolder_();
  const content = JSON.stringify(state, null, 2);
  const file = findDataFile_();
  if (file) file.setContent(content);
  else folder.createFile(APP.dataFileName, content, MimeType.PLAIN_TEXT);
}

function getOrCreateFolder_() {
  const folders = DriveApp.getFoldersByName(APP.folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(APP.folderName);
}

function findDataFile_() {
  const folder = getOrCreateFolder_();
  const files = folder.getFilesByName(APP.dataFileName);
  return files.hasNext() ? files.next() : null;
}
