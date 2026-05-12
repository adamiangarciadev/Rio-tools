/* app.js — Entrada de mercadería RIO
   - Carga equivalencia.csv + equivalencia2.csv desde ../../data/
   - Carga padrón real desde ../../data/ASISTENCIA_RIO - PADRON.csv
   - Usa vendedor_id como código de responsable
   - Guarda metadata y escaneos en localStorage
   - Genera TXT con nombre:
     YYMMDD REM<remito> <sucursal> RESP<codigo>.txt
   - DESCARGA el TXT en la PC
   - ENVÍA una copia al Apps Script para backup en Google Drive
*/

;(() => {
  "use strict";

  // =========================================================
  // CONFIG
  // =========================================================
  const SUCURSALES = [
    "AV2",
    "NAZCA",
    "LAMARCA",
    "CORRIENTES",
    "CO2",
    "CASTELLI",
    "QUILMES",
    "SARMIENTO",
    "DEPOSITO",
    "PUEYRREDON",
    "WEB"
  ].sort((a, b) => a.localeCompare(b, "es"));

  const CSV_FILES = [
    "../../data/equivalencia.csv",
    "../../data/equivalencia2.csv"
  ];

  const PADRON_SOURCES = [
    "../../data/ASISTENCIA_RIO - PADRON.csv",
    "../../data/ASISTENCIA RIO - PADRON.csv",
    "../../data/ASISTENCIA_RIO_PADRON.csv",
    "../../data/padron.csv"
  ];

  // Carpeta raíz de backup en Drive
  const BACKUP_ROOT_FOLDER_ID = "1HoQBiMRvflZuyLtCaJyRBWio1C5i6ofH";

  const LS_META = "entrada_mercaderia_meta_v4";
  const LS_SCANS = "entrada_mercaderia_scans_v4";

  const AUTOCOMMIT_IDLE_MS = 80;
  const MIN_LEN_FOR_COMMIT = 3;
  const MAX_SCANS = 5000;

  // Apps Script por sucursal
  const SCRIPT_URLS = {
    SARMIENTO: "https://script.google.com/macros/s/AKfycbzpGGyA_acQYDzZldHnameD5Xwo8hGW6-eaFjAlDZfljsuU5tqkeCb8Nizk_e2CitDU/exec",
    AV2: "https://script.google.com/macros/s/AKfycbwPNl9zyKtgun43MijeiFL3BtGTyM79_a4pocTYlYOr9Q5KllWra6s2HjbGIr11XFGy9w/exec",
    PUEYRREDON: "https://script.google.com/macros/s/AKfycbxKRHA79kv30UEjOU_eeehr8evuVPhqDFfSaanJgeJPgUSEZao5eLqsTyO73CdLvgZE/exec"
  };

  // =========================================================
  // ESTADO
  // =========================================================
  let rows = [];
  let byCode = new Map();
  let scans = [];
  let audioCtx = null;
  let scanTimer = null;

  let responsables = [];
  let responsablesByCode = new Map();

  // =========================================================
  // DOM
  // =========================================================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  const el = {
    readyPill: $("#readyPill"),
    pillText: $("#pillText"),

    respOrigenSelect: $("#respOrigenSelect"),
    remitoOrigenInput: $("#remitoOrigenInput"),
    respEntradaSelect: $("#respEntradaSelect"),
    sucursalEntradaSelect: $("#sucursalEntradaSelect"),
    bultosInput: $("#bultosInput"),

    scanInput: $("#scanInput"),
    scanCount: $("#scanCount"),
    noti: $("#noti"),
    lastScans: $("#lastScans"),

    saveBtn: $("#saveBtn"),
    resetBtn: $("#resetBtn"),
  };

  // =========================================================
  // INIT
  // =========================================================
  document.addEventListener("DOMContentLoaded", async () => {
    bindUI();
    fillOptionsFromArray(el.sucursalEntradaSelect, SUCURSALES);

    await loadPadronResponsables();
    restoreMeta();
    restoreScans();

    await loadAllCSVs(CSV_FILES);

    renderLast();
    keepFocus();
  });

  // =========================================================
  // UI
  // =========================================================
  function bindUI() {
    if (el.scanInput) {
      el.scanInput.addEventListener("keydown", (e) => {
        ensureAudio();

        if (e.key === "Enter") {
          e.preventDefault();
          const code = (el.scanInput.value || "").trim();
          processScan(code);
          el.scanInput.value = "";
          el.scanInput.focus();
          clearTimeout(scanTimer);
          scanTimer = null;
          return;
        }

        scheduleAutoCommit();
      });

      el.scanInput.addEventListener("input", () => {
        ensureAudio();
        scheduleAutoCommit();
      });
    }

    if (el.saveBtn) {
      el.saveBtn.addEventListener("click", guardarTXT);
    }

    if (el.resetBtn) {
      el.resetBtn.addEventListener("click", resetScans);
    }

    [
      el.respOrigenSelect,
      el.respEntradaSelect,
      el.sucursalEntradaSelect
    ].forEach(node => node?.addEventListener("change", saveMeta));

    const digitsOnly = (e) => {
      const v = (e.target.value || "").replace(/\D+/g, "");
      if (v !== e.target.value) e.target.value = v;
      saveMeta();
    };

    el.bultosInput?.addEventListener("input", digitsOnly);
    el.remitoOrigenInput?.addEventListener("input", digitsOnly);
  }

  function restoreMeta() {
    const saved = readLocal(LS_META) || {};

    if (saved.respOrigenCode && responsablesByCode.has(saved.respOrigenCode)) {
      el.respOrigenSelect.value = saved.respOrigenCode;
    }

    if (saved.respEntradaCode && responsablesByCode.has(saved.respEntradaCode)) {
      el.respEntradaSelect.value = saved.respEntradaCode;
    }

    if (saved.sucursalEntrada && SUCURSALES.includes(saved.sucursalEntrada)) {
      el.sucursalEntradaSelect.value = saved.sucursalEntrada;
    }

    if (typeof saved.bultos === "string") {
      el.bultosInput.value = saved.bultos;
    }

    if (typeof saved.remitoOrigen === "string") {
      el.remitoOrigenInput.value = saved.remitoOrigen;
    }
  }

  function saveMeta() {
    writeLocal(LS_META, {
      respOrigenCode: el.respOrigenSelect?.value || "",
      remitoOrigen: el.remitoOrigenInput?.value || "",
      respEntradaCode: el.respEntradaSelect?.value || "",
      sucursalEntrada: el.sucursalEntradaSelect?.value || "",
      bultos: el.bultosInput?.value || ""
    });
  }

  function restoreScans() {
    const saved = readLocal(LS_SCANS);
    if (Array.isArray(saved)) {
      scans = saved.slice(0, MAX_SCANS);
    }
  }

  function saveScans() {
    writeLocal(LS_SCANS, scans);
  }

  // =========================================================
  // PADRÓN
  // =========================================================
  async function loadPadronResponsables() {
    responsables = [];
    responsablesByCode.clear();

    for (const src of PADRON_SOURCES) {
      try {
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) continue;

        const data = parseCSV(await res.text());
        const parsed = normalizePadronData(data);

        if (parsed.length) {
          responsables = parsed.sort((a, b) => a.label.localeCompare(b.label, "es"));

          responsables.forEach(r => {
            responsablesByCode.set(r.code, r);
          });

          fillResponsablesSelects();
          note(`Padrón cargado: ${basename(src)} (${responsables.length})`);
          showPill("ok", "Listo para recibir");
          return;
        }
      } catch (_) {}
    }

    fillResponsablesSelects();
    showPill("warn", "Sin padrón");
    note("No se encontró el padrón en ../../data/");
  }

  function fillResponsablesSelects() {
    const list = responsables.filter(r => r.code && r.name);
    fillResponsablesSelect(el.respOrigenSelect, list);
    fillResponsablesSelect(el.respEntradaSelect, list);
  }

  function fillResponsablesSelect(select, list) {
    if (!select) return;

    const prev = select.value || "";
    select.innerHTML = "";

    if (!list.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Sin padrón cargado";
      select.appendChild(opt);
      return;
    }

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Seleccionar...";
    select.appendChild(empty);

    list.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.code;
      opt.textContent = item.sucursal
        ? `${item.code} - ${item.name} - ${item.sucursal}`
        : `${item.code} - ${item.name}`;
      select.appendChild(opt);
    });

    if (prev && list.some(x => x.code === prev)) {
      select.value = prev;
    }
  }

  function normalizePadronData(data) {
    const arr = Array.isArray(data) ? data : [];
    const out = [];

    for (const row of arr) {
      const obj = normalizePadronRow(row);
      if (!obj.code || !obj.name) continue;
      out.push(obj);
    }

    const dedup = new Map();
    out.forEach(r => {
      if (!dedup.has(r.code)) dedup.set(r.code, r);
    });

    return Array.from(dedup.values());
  }

  function normalizePadronRow(row) {
    const keys = Object.keys(row || {});

    const codeKey = findKey(keys, [
      "vendedor_id",
      "codigo",
      "código",
      "cod",
      "id",
      "legajo"
    ]);

    const nameKey = findKey(keys, [
      "apellido_nombre",
      "nombre",
      "responsable",
      "persona",
      "empleado"
    ]);

    const sucKey = findKey(keys, [
      "sucursal_base",
      "sucursal",
      "local",
      "origen"
    ]);

    const roleKey = findKey(keys, [
      "rol",
      "puesto",
      "cargo"
    ]);

    const code = String(codeKey ? row[codeKey] : "").trim();
    const name = String(nameKey ? row[nameKey] : "").trim();
    const sucursal = normalizeSucursal(String(sucKey ? row[sucKey] : "").trim());
    const rol = String(roleKey ? row[roleKey] : "").trim();

    const labelBase = name ? `${code} - ${name}` : code;
    const label = rol ? `${labelBase} (${rol})` : labelBase;

    return { code, name, sucursal, rol, label };
  }

  function normalizeSucursal(value) {
    const s = norm(value);

    if (!s) return "";

    if (s === "avellaneda" || s === "av 2" || s === "av2") return "AV2";
    if (s === "nazca" || s === "av1") return "NAZCA";
    if (s === "corrientes" || s === "co1") return "CORRIENTES";
    if (s === "co2") return "CO2";
    if (s === "pueyrredon" || s === "pueyrredón") return "PUEYRREDON";
    if (s === "deposito" || s === "depósito") return "DEPOSITO";
    if (s === "sarmiento") return "SARMIENTO";
    if (s === "lamarca") return "LAMARCA";
    if (s === "castelli") return "CASTELLI";
    if (s === "quilmes") return "QUILMES";
    if (s === "web") return "WEB";

    return String(value || "").trim().toUpperCase();
  }

  // =========================================================
  // CSV EQUIVALENCIAS
  // =========================================================
  async function loadAllCSVs(list) {
    byCode.clear();
    rows = [];

    const jobs = list.map(async (name) => {
      try {
        const res = await fetch(name, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));

        const text = await res.text();
        const data = parseCSV(text);

        addToIndex(data, true);
        rows = rows.concat(data);

        return { name, ok: true, rows: data.length };
      } catch (e) {
        return { name, ok: false, err: e?.message || "error" };
      }
    });

    const results = await Promise.all(jobs);
    const okCount = results.filter(r => r.ok).length;

    if (okCount === 0) {
      showPill("danger", "No se encontró ningún CSV");
      note("No se cargaron CSV. Revisá ../../data/equivalencia.csv y equivalencia2.csv");
    } else if (okCount === list.length) {
      showPill("ok", `Listo (${okCount}/${list.length} CSV)`);
      note(results.map(r => `OK ${basename(r.name)} (${r.rows})`).join(" · "));
    } else {
      const misses = results.filter(r => !r.ok).map(r => basename(r.name)).join(", ");
      showPill("warn", `Listo con ${okCount}/${list.length} CSV`);
      note(`Faltó: ${misses}`);
    }
  }

  function addToIndex(data, noOverride) {
    if (!data.length) return;

    const keys = Object.keys(data[0] || {});
    const codeKey = guessCodeColumn(keys);

    data.forEach(r => {
      const raw = r[codeKey];
      const k = normalizeBarcode(raw);
      if (!k) return;
      if (noOverride && byCode.has(k)) return;
      byCode.set(k, r);
    });
  }

  function guessCodeColumn(keys) {
    const patterns = [
      "codigo_barras", "codigo barras", "código barras", "barra",
      "barcode", "ean", "lectura", "scan", "codigo", "código",
      "equivalencia", "equiv", "sku", "cod"
    ];

    return keys.find(k => patterns.some(p => norm(k).includes(norm(p)))) || keys[0];
  }

  function getOutputCode(row, fallback) {
    if (!row) return String(fallback ?? "");

    const keys = Object.keys(row);
    const prefArt = findKey(keys, ["articulo", "artículo"]);
    if (prefArt) return String(row[prefArt] ?? "").trim();

    const pref = findKey(keys, ["codigo", "código", "sku", "cod"]);
    return String((pref ? row[pref] : fallback) ?? "").trim();
  }

  // =========================================================
  // ESCANEO
  // =========================================================
  function scheduleAutoCommit() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => autoCommit(), AUTOCOMMIT_IDLE_MS);
  }

  function autoCommit() {
    const code = (el.scanInput.value || "").trim();
    if (code.length >= MIN_LEN_FOR_COMMIT) {
      processScan(code);
      el.scanInput.value = "";
      el.scanInput.focus();
    }
    scanTimer = null;
  }

  function processScan(code) {
    const clean = String(code || "").trim();
    if (!clean) {
      flash("err");
      return;
    }

    const k = normalizeBarcode(clean);
    const hit = byCode.has(k);

    scans.unshift({
      code: clean,
      ok: hit,
      time: new Date().toISOString()
    });

    if (scans.length > MAX_SCANS) {
      scans = scans.slice(0, MAX_SCANS);
    }

    saveScans();

    if (!hit) {
      flash("err");
      beepError();
      note(`No encontrado: ${clean}`);
    } else {
      flash("ok");
      note(`OK: ${clean}`);
    }

    renderLast();
  }

  function renderLast() {
    if (!el.lastScans) return;

    const total = scans.length;
    if (el.scanCount) el.scanCount.textContent = `${total} escaneados`;

    const recent = scans.slice(0, 10)
      .map(s => `<span class="${s.ok ? "ok" : "err"}">${s.ok ? "✓" : "✗"} ${escapeHtml(s.code)}</span>`)
      .join(" · ");

    el.lastScans.innerHTML = recent || "";
  }

  function resetScans() {
    scans = [];
    saveScans();
    renderLast();
    note("Escaneos reiniciados.");
  }

  // =========================================================
  // GUARDAR TXT
  // =========================================================
  async function guardarTXT() {
    if (!scans.length) {
      note("No hay escaneos para guardar.");
      flash("err");
      return;
    }

    const respOrigen = getSelectedResponsable(el.respOrigenSelect);
    const respEntrada = getSelectedResponsable(el.respEntradaSelect);
    const sucursalEntrada = (el.sucursalEntradaSelect?.value || "").trim();
    const remito = (el.remitoOrigenInput?.value || "").trim();
    const bultos = (el.bultosInput?.value || "").trim();

    if (!respOrigen.code) {
      note("Falta seleccionar Responsable de Origen.");
      flash("err");
      return;
    }

    if (!respEntrada.code) {
      note("Falta seleccionar Responsable de Entrada.");
      flash("err");
      return;
    }

    if (!sucursalEntrada) {
      note("Falta seleccionar Sucursal de Entrada.");
      flash("err");
      return;
    }

    if (!remito) {
      note("Falta ingresar el número de remito.");
      flash("err");
      return;
    }

    const lines = scans.map(s => {
      const row = byCode.get(normalizeBarcode(s.code));
      return getOutputCode(row, s.code);
    });

    const content = lines.join("\n");
    const fileName = resolveFilename();
    const folderName = sucursalEntrada.toUpperCase();

    // 1) Descarga local en la PC
    downloadTXT(fileName, content);

    // 2) Envío al backend para copia en Drive
    await enviarArchivoAGoogleDrive({
      content,
      fileName,
      folderName,
      meta: {
        accion: "guardar_txt_entrada",
        backupRootFolderId: BACKUP_ROOT_FOLDER_ID,
        sucursalEntrada: sucursalEntrada.toUpperCase(),
        remitoOrigen: remito,
        bultos,
        responsableOrigenCodigo: respOrigen.code,
        responsableOrigenNombre: respOrigen.name,
        responsableOrigenSucursal: respOrigen.sucursal,
        responsableEntradaCodigo: respEntrada.code,
        responsableEntradaNombre: respEntrada.name,
        responsableEntradaSucursal: respEntrada.sucursal,
        totalEscaneados: scans.length,
        fechaGeneracionIso: new Date().toISOString()
      }
    });

    note(`TXT descargado y enviado a Drive: ${fileName}`);
  }

  function resolveFilename() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fecha = `${yy}${mm}${dd}`;

    const remito = (el.remitoOrigenInput?.value || "").trim();
    const sucursal = safeName((el.sucursalEntradaSelect?.value || "").toUpperCase());
    const respEntrada = getSelectedResponsable(el.respEntradaSelect);

    const base = `${fecha} REM${remito} ${sucursal} RESP${respEntrada.code || "SINCOD"}`.trim();
    return ensureTxt(sanitize(base));
  }

  function downloadTXT(fileName, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function getSelectedResponsable(select) {
    const code = String(select?.value || "").trim();
    const data = responsablesByCode.get(code) || null;

    return {
      code,
      name: data?.name || "",
      sucursal: data?.sucursal || "",
      rol: data?.rol || ""
    };
  }

  // =========================================================
  // ENVÍO A APPS SCRIPT
  // =========================================================
  function getScriptUrlForSucursal(sucursal) {
    const s = String(sucursal || "").toUpperCase().trim();
    return SCRIPT_URLS[s] || "";
  }

  async function enviarArchivoAGoogleDrive({ content, fileName, folderName, meta = {} }) {
    const sucursal = el.sucursalEntradaSelect?.value || "";
    const scriptUrl = getScriptUrlForSucursal(sucursal);

    if (!scriptUrl) {
      console.warn("No hay SCRIPT_URL configurada para la sucursal de entrada:", sucursal);
      note("TXT descargado, pero no hay script configurado para esta sucursal.");
      return;
    }

    const payload = {
      content,
      fileName,
      folderName,
      mimeType: "text/plain",
      ...meta
    };

    try {
      const resp = await fetch(scriptUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      let data = null;
      try {
        data = await resp.json();
      } catch (_) {}

      if (!resp.ok) {
        console.error("Error Apps Script:", data || resp.statusText);
        note("TXT descargado, pero falló el envío a Drive.");
        return;
      }

      console.log("Archivo enviado:", data || payload);
    } catch (err) {
      console.error("Error al enviar a Apps Script:", err);
      note("TXT descargado, pero hubo error enviando a Drive.");
    }
  }

  // =========================================================
  // UX / AUDIO
  // =========================================================
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        audioCtx = null;
      }
    }
  }

  function beepError() {
    if (!audioCtx) return;

    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = "square";
    o.frequency.value = 220;
    g.gain.value = 0.0001;

    o.connect(g).connect(audioCtx.destination);
    o.start();

    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);

    o.stop(audioCtx.currentTime + 0.25);

    if (navigator.vibrate) navigator.vibrate(80);
  }

  function keepFocus() {
    if (!el.scanInput) return;

    el.scanInput.focus();

    document.addEventListener("click", (e) => {
      const isInteractive = e.target.closest('input,select,textarea,button,a,label,[role="button"]');
      if (!isInteractive) {
        setTimeout(() => el.scanInput.focus(), 0);
      }
    });
  }

  function flash(kind) {
    if (!el.scanInput) return;

    el.scanInput.classList.remove("ok", "err");
    void el.scanInput.offsetWidth;
    el.scanInput.classList.add(kind);

    setTimeout(() => el.scanInput.classList.remove(kind), 220);
  }

  function note(msg) {
    if (el.noti) el.noti.textContent = msg;
  }

  function showPill(state, text) {
    if (!el.readyPill) return;

    el.readyPill.classList.remove("hidden", "ok", "warn", "danger");
    el.readyPill.classList.add(state || "ok");

    if (el.pillText) {
      el.pillText.textContent = text || "Estado";
    }
  }

  // =========================================================
  // HELPERS
  // =========================================================
  function fillOptionsFromArray(select, list) {
    if (!select) return;
    select.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Seleccionar...";
    select.appendChild(empty);

    list.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      select.appendChild(o);
    });
  }

  function writeLocal(k, obj) {
    try {
      localStorage.setItem(k, JSON.stringify(obj));
    } catch (_) {}
  }

  function readLocal(k) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  }

  function ensureTxt(name) {
    return name.toLowerCase().endsWith(".txt") ? name : `${name}.txt`;
  }

  function sanitize(s) {
    return String(s || "").replace(/[\\/:*?"<>|]+/g, "_");
  }

  function safeName(s) {
    return String(s || "").normalize("NFC");
  }

  function basename(path) {
    return String(path || "").split("/").pop();
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findKey(keys, pats) {
    return keys.find(k => pats.some(p => norm(k).includes(norm(p))));
  }

  function normalizeBarcode(value) {
    return String(value ?? "").trim().toUpperCase();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]
    ));
  }

  // =========================================================
  // CSV ROBUSTO
  // =========================================================
  function parseCSV(text) {
    const lines = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(l => l.length > 0);

    if (!lines.length) return [];

    const sep = detectDelimiter(lines[0], lines[1]);
    const rawHeaders = splitCSVLine(lines[0], sep);

    const seen = {};
    const headers = rawHeaders.map(h => {
      let k = String(h || "").trim();
      if (!k) k = "COL";

      if (seen[k]) {
        let n = 2;
        while (seen[`${k}_${n}`]) n++;
        k = `${k}_${n}`;
      }

      seen[k] = true;
      return k;
    });

    const out = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i], sep);
      const obj = {};
      headers.forEach((h, idx) => obj[h] = (cells[idx] ?? "").trim());
      out.push(obj);
    }

    return out;
  }

  function detectDelimiter(l1, l2 = "") {
    const cands = [",", ";", "|", "\t"];

    const score = (line, ch) => {
      let q = false;
      let n = 0;

      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const nxt = line[i + 1];

        if (c === '"') {
          if (q && nxt === '"') i++;
          else q = !q;
        } else if (!q && c === ch) {
          n++;
        }
      }

      return n;
    };

    const totals = cands.map(ch => score(l1, ch) + score(l2, ch));

    let best = 0;
    let bestIdx = 0;

    totals.forEach((n, idx) => {
      if (n > best) {
        best = n;
        bestIdx = idx;
      }
    });

    return best > 0 ? cands[bestIdx] : ";";
  }

  function splitCSVLine(line, sep) {
    const out = [];
    let cur = "";
    let q = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const n = line[i + 1];

      if (c === '"') {
        if (q && n === '"') {
          cur += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (c === sep && !q) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }

    out.push(cur);
    return out;
  }
})();
