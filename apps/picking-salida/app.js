/* app.js � 2 CSV, match normalizado, UN SOLO TXT con TODOS los c�digos
   Flujo correcto:
   1) La app pide remito al script del cuadernillo
   2) El cuadernillo registra la fila y devuelve remito
   3) La app arma el nombre final del TXT
   4) La app env�a el TXT al script del origen
*/
;(() => {
  "use strict";

  // ====== Config ======
  const RESPONSABLES = ["DAVID","DIEGO","JOEL","MARTIN","MIGUEL","NAHUEL","RODRIGO","RAMON","ROBERTO","SERGIO","PATO","FRANCO"];
  const SUCURSALES  = ["AV2","NAZCA","LAMARCA","CORRIENTES","CASTELLI","QUILMES","SARMIENTO","DEPOSITO","PUEYRREDON"];
  const CSV_FILES   = ["../../data/equivalencia.csv", "../../data/equivalencia2.csv"];

  const LS_META  = "pickeo_meta_v1";
  const LS_SCANS = "pickeo_scans_v1";

  const AUTOCOMMIT_IDLE_MS = 80;
  const MIN_LEN_FOR_COMMIT = 3;

  // ====== Apps Script ======
  const SCRIPT_URL_CUADERNILLO = "https://script.google.com/macros/s/AKfycbyAlP7xFvmRAcYq06a7asCB8gWU_6X6m6Eq0QXx1gW4sWcJURywVxI_sXYrYrigmbDUcA/exec";

  const SCRIPT_URL_SARMIENTO  = "https://script.google.com/macros/s/AKfycbzpGGyA_acQYDzZldHnameD5Xwo8hGW6-eaFjAlDZfljsuU5tqkeCb8Nizk_e2CitDU/exec";
  const SCRIPT_URL_AV2        = "https://script.google.com/macros/s/AKfycbwPNl9zyKtgun43MijeiFL3BtGTyM79_a4pocTYlYOr9Q5KllWra6s2HjbGIr11XFGy9w/exec";
  const SCRIPT_URL_PUEYRREDON = "https://script.google.com/macros/s/AKfycbxKRHA79kv30UEjOU_eeehr8evuVPhqDFfSaanJgeJPgUSEZao5eLqsTyO73CdLvgZE/exec";
  const SCRIPT_URL_DEPOSITO   = "https://script.google.com/macros/s/AKfycbxidW-8kYw_w6Wsym4UU6euKDBLbZV-n2NapYarZvtx3tifPWPv22Ck4-y4F27xRqjx/exec";

  // ====== Estado ======
  let rows = [];
  let byCode = new Map();
  let scans = [];
  let scanSeq = 0;
  let audioCtx = null;
  let scanTimer = null;
  let currentRemito = "";
  let isSaving = false;

  // ====== Elementos ======
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const el = {
    readyPill: $("#readyPill"),
    pillText:  $("#pillText"),

    respSelect:    $("#respSelect"),
    origenSelect:  $("#origenSelect"),
    destinoSelect: $("#destinoSelect"),
    bultosInput:   $("#bultosInput"),
    remitoInput:   $("#remitoInput"),

    scanInput:  $("#scanInput"),
    scanCount:  $("#scanCount"),
    noti:       $("#noti"),
    lastScans:  $("#lastScans"),

    pickList:   $("#pickList"),
    artCounter: $("#artCounter"),

    downloadBtn: $("#downloadBtn"),
    resetBtn:    $("#resetBtn"),
  };

  document.addEventListener("DOMContentLoaded", () => {
    setupSelectors();
    bindUI();
    loadScans();
    loadAllCSVs(CSV_FILES);
    keepFocus();

    renderLast();
    renderPickList();
    renderArticleCounter();
    updateRemitoUI("");
  });

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

    if (el.downloadBtn) el.downloadBtn.addEventListener("click", downloadTxt);
    if (el.resetBtn) el.resetBtn.addEventListener("click", () => resetScans());

    if (el.pickList) {
      el.pickList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del-id]");
        if (!btn) return;

        const id = Number(btn.getAttribute("data-del-id"));
        if (!Number.isFinite(id)) return;

        deleteScanById(id);
      });
    }
  }

  function setupSelectors() {
    fillOptions(el.respSelect, RESPONSABLES);
    fillOptions(el.origenSelect, SUCURSALES);
    fillOptions(el.destinoSelect, SUCURSALES);

    const { responsable, origen, destino, bultos } = readLocal(LS_META) || {};

    if (responsable && RESPONSABLES.includes(responsable)) el.respSelect.value = responsable;
    if (origen && SUCURSALES.includes(origen)) el.origenSelect.value = origen;
    if (destino && SUCURSALES.includes(destino)) el.destinoSelect.value = destino;
    if (typeof bultos === "string") el.bultosInput.value = bultos;

    [el.respSelect, el.origenSelect, el.destinoSelect].forEach(s => {
      s?.addEventListener("change", saveMeta);
    });

    const digitsOnly = (e) => {
      const v = (e.target.value || "").replace(/\D+/g, "");
      if (v !== e.target.value) e.target.value = v;
      saveMeta();
    };

    el.bultosInput?.addEventListener("input", digitsOnly);

    if (el.remitoInput) {
      el.remitoInput.readOnly = true;
      el.remitoInput.value = "";
      el.remitoInput.placeholder = "Se genera al guardar";
    }
  }

  function saveMeta() {
    writeLocal(LS_META, {
      responsable: el.respSelect?.value || "",
      origen:      el.origenSelect?.value || "",
      destino:     el.destinoSelect?.value || "",
      bultos:      el.bultosInput?.value || "",
    });
  }

  function writeLocal(k, obj) {
    try {
      localStorage.setItem(k, JSON.stringify(obj));
    } catch {}
  }

  function readLocal(k) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  }

  function saveScans() {
    try {
      localStorage.setItem(LS_SCANS, JSON.stringify(scans));
    } catch (err) {
      console.warn("No se pudieron guardar los escaneos en localStorage:", err);
    }
  }

  function loadScans() {
    try {
      const raw = localStorage.getItem(LS_SCANS);
      if (!raw) {
        scans = [];
        scanSeq = 0;
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        scans = [];
        scanSeq = 0;
        return;
      }

      scans = parsed.map((s, idx) => ({
        id: Number.isFinite(Number(s.id)) ? Number(s.id) : idx + 1,
        code: String(s.code || "").trim(),
        ok: Boolean(s.ok),
        time: s.time || new Date().toISOString()
      })).filter(s => s.code);

      scanSeq = scans.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0);

      if (scans.length) {
        note(`Recuperados ${scans.length} escaneos`);
        showPill("ok", `Recuperados ${scans.length}`);
      }
    } catch (err) {
      console.warn("No se pudieron recuperar los escaneos desde localStorage:", err);
      scans = [];
      scanSeq = 0;
    }
  }

  function fillOptions(select, list) {
    if (!select) return;
    select.innerHTML = "";

    list.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      select.appendChild(o);
    });
  }

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

  function beepOk() {
    if (!audioCtx) return;

    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;

    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    o.stop(audioCtx.currentTime + 0.18);
  }

  function signalSaved(remito, fileName) {
    const remText = remito ? `REM${remito}` : "Remito generado";
    note(fileName ? `${remText} guardado � ${fileName}` : `${remText} guardado en Google Drive`);
    showPill("ok", `${remText} guardado`);
    beepOk();

    setTimeout(() => resetScans({ silent: true }), 650);
  }

  function signalError(msg) {
    note(msg || "Error al guardar");
    showPill("danger", "Error al guardar");
    beepError();
  }

  function setDownloadState(saving) {
    isSaving = Boolean(saving);

    if (!el.downloadBtn) return;

    el.downloadBtn.disabled = isSaving;
    el.downloadBtn.setAttribute("aria-disabled", String(isSaving));
    el.downloadBtn.textContent = isSaving ? "GUARDANDO..." : "GUARDAR";
  }

  function updateRemitoUI(remito) {
    currentRemito = remito ? String(remito) : "";

    if (el.remitoInput) {
      el.remitoInput.value = currentRemito;
      el.remitoInput.placeholder = currentRemito ? "" : "Se genera al guardar";
    }
  }

  async function loadAllCSVs(list) {
    byCode.clear();
    rows = [];

    const jobs = list.map(async (name) => {
      try {
        const res = await fetch("./" + name, { cache: "no-store" });
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
      showPill("danger", "No se encontr� ning�n CSV");
      note("No se cargaron CSV. Revis� nombres y may�sculas/min�sculas.");
    } else if (okCount === list.length) {
      showPill("ok", `Listo (${okCount}/${list.length} CSV)`);
      note(results.map(r => `OK ${r.name} (${r.rows})`).join(" � "));
    } else {
      const misses = results.filter(r => !r.ok).map(r => r.name).join(", ");
      showPill("warn", `Listo con ${okCount}/${list.length} CSV`);
      note(`Falt�: ${misses}. Verific� que est�n en la misma carpeta y con ese nombre exacto.`);
    }

    renderArticleCounter();
  }

  const key = (s) => String(s ?? "").trim().toUpperCase();

  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim();
  }

  function pickKey(keys, candidates) {
    const set = new Set(keys);

    for (const c of candidates) {
      if (set.has(c)) return c;
    }

    const wanted = candidates.map(normKey);

    for (const k of keys) {
      const nk = normKey(k);
      if (wanted.some(w => nk.includes(w))) return k;
    }

    return null;
  }

  function addToIndex(data, noOverride) {
    if (!data.length) return;

    const keys = Object.keys(data[0] || {});
    const codeKey = guessCodeColumn(keys);

    data.forEach(r => {
      const raw = r[codeKey];
      const k = key(raw);
      if (!k) return;
      if (noOverride && byCode.has(k)) return;
      byCode.set(k, r);
    });
  }

  function guessCodeColumn(keys) {
    const forced = pickKey(keys, [
      "codigo_barras",
      "c�digo","codigo","c?digo","código",
      "barcode","ean",
      "lectura","scan"
    ]);

    return forced || keys[0];
  }

  function getArticuloFromRow(row) {
    if (!row) return "";

    const keys = Object.keys(row);
    const artKey = pickKey(keys, ["articulo","art�culo","art?culo","artículo"]);

    return artKey ? String(row[artKey] ?? "").trim() : "";
  }

  function getColorTalleFromRow(row) {
    if (!row) return { color: "", talle: "" };

    const keys = Object.keys(row);
    const desc1 = pickKey(keys, ["descripcion","descripci�n","descripci?n","descripción"]);
    const desc2 = pickKey(keys, ["descripcion_2","descripci�n_2","descripci?n_2","descripción_2"]);

    const color = desc1 ? String(row[desc1] ?? "").trim() : "";
    const talle = desc2 ? String(row[desc2] ?? "").trim() : "";

    const color2 = color || (
      pickKey(keys, ["color","col"])
        ? String(row[pickKey(keys, ["color","col"])] ?? "").trim()
        : ""
    );

    const talle2 = talle || (
      pickKey(keys, ["talle","tama�o","tamano","size"])
        ? String(row[pickKey(keys, ["talle","tama�o","tamano","size"])] ?? "").trim()
        : ""
    );

    return { color: color2, talle: talle2 };
  }

  function scheduleAutoCommit() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { autoCommit(); }, AUTOCOMMIT_IDLE_MS);
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

    const k = key(clean);
    const hit = byCode.has(k);

    scans.unshift({
      id: ++scanSeq,
      code: clean,
      ok: hit,
      time: new Date().toISOString()
    });

    scans = scans.slice(0, 5000);
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
    renderPickList();
    renderArticleCounter();
  }

  function deleteScanById(id) {
    const before = scans.length;
    scans = scans.filter(s => s.id !== id);

    if (scans.length !== before) {
      saveScans();
      renderLast();
      renderPickList();
      renderArticleCounter();
      note("�tem eliminado.");
      showPill("ok", "�tem eliminado");
    }
  }

  function renderPickList() {
    if (!el.pickList) return;

    if (!scans.length) {
      el.pickList.innerHTML = `<div style="padding:12px" class="muted">Sin escaneos.</div>`;
      return;
    }

    el.pickList.innerHTML = scans.map(s => `
      <div class="pick-row">
        <span class="pick-badge ${s.ok ? "ok" : "err"}" title="${s.ok ? "OK" : "NO"}">${s.ok ? "?" : "?"}</span>
        <span class="pick-code">${escapeHtml(s.code)}</span>
        <button class="pick-del" type="button" data-del-id="${s.id}">Eliminar</button>
      </div>
    `).join("");
  }

  function renderArticleCounter() {
    if (!el.artCounter) return;

    if (!scans.length) {
      el.artCounter.innerHTML = `<div class="muted">Sin escaneos.</div>`;
      return;
    }

    const map = new Map();

    for (const s of scans) {
      const row = byCode.get(key(s.code));

      if (!row) {
        const label = String(s.code).trim();
        if (!map.has(label)) {
          map.set(label, {
            total: 0,
            variants: new Map([["SIN EQUIVALENCIA", 0]])
          });
        }

        const it = map.get(label);
        it.total += 1;
        it.variants.set("SIN EQUIVALENCIA", (it.variants.get("SIN EQUIVALENCIA") || 0) + 1);
        continue;
      }

      const articulo = getArticuloFromRow(row) || s.code;
      const { color, talle } = getColorTalleFromRow(row);

      const artLabel = [articulo, color, talle].filter(Boolean).join(" ").trim() || articulo;
      const variantLabel = [color, talle].filter(Boolean).join(" � ") || "SIN VARIANTE";

      if (!map.has(artLabel)) {
        map.set(artLabel, { total: 0, variants: new Map() });
      }

      const it = map.get(artLabel);
      it.total += 1;
      it.variants.set(variantLabel, (it.variants.get(variantLabel) || 0) + 1);
    }

    const sorted = Array.from(map.entries())
      .sort((a, b) => (b[1].total - a[1].total) || String(a[0]).localeCompare(String(b[0])));

    el.artCounter.innerHTML = sorted.map(([artLabel, info]) => {
      const variantsHtml = Array.from(info.variants.entries())
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
        .map(([label, cnt]) => `
          <div class="art-variant">
            <div>${escapeHtml(label)}</div>
            <div><small>x</small> ${cnt}</div>
          </div>
        `).join("");

      return `
        <details class="art-item">
          <summary>
            <div class="art-sum-left">
              <span class="art-arrow">�</span>
              <span class="art-code">${escapeHtml(artLabel)}</span>
            </div>
            <span class="art-total">${info.total}</span>
          </summary>
          <div class="art-variants">${variantsHtml}</div>
        </details>
      `;
    }).join("");
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

  function renderLast() {
    if (!el.lastScans) return;

    const total = scans.length;
    if (el.scanCount) el.scanCount.textContent = `${total} escaneados`;

    const recent = scans.slice(0, 10)
      .map(s => `<span class="${s.ok ? "ok" : "err"}">${s.ok ? "?" : "?"} ${escapeHtml(s.code)}</span>`)
      .join(" � ");

    el.lastScans.innerHTML = recent || "";
  }

  function resetScans({ silent = false } = {}) {
    scans = [];
    scanSeq = 0;
    currentRemito = "";
    saveScans();

    if (el.scanCount) el.scanCount.textContent = "0 escaneados";
    if (el.lastScans) el.lastScans.innerHTML = "";

    if (el.scanInput) {
      el.scanInput.value = "";
      el.scanInput.focus();
    }

    updateRemitoUI("");
    renderPickList();
    renderArticleCounter();

    if (!silent) {
      note("Escaneo limpio. Listo para pickear.");
      showPill("ok", "Listo para pickear");
    }
  }

  function keepFocus() {
    if (!el.scanInput) return;

    el.scanInput.focus();

    document.addEventListener("click", (e) => {
      const isInteractive = e.target.closest('input,select,textarea,button,a,label,[role="button"]');
      if (!isInteractive) setTimeout(() => el.scanInput.focus(), 0);
    });
  }

  async function downloadTxt() {
    ensureAudio();

    if (isSaving) {
      note("El TXT ya se esta guardando. Espera un momento.");
      showPill("warn", "Guardando...");
      return;
    }

    if (!scans.length) {
      showPill("warn", "No hay escaneos");
      note("No hay escaneos para guardar.");
      flash("err");
      return;
    }

    const origen = (el.origenSelect?.value || "").toUpperCase().trim();
    const destino = (el.destinoSelect?.value || "").toUpperCase().trim();

    if (!origen) {
      signalError("Seleccion� un ORIGEN.");
      return;
    }

    if (!destino) {
      signalError("Seleccion� un DESTINO.");
      return;
    }

    const scriptUrlOrigen = getScriptUrlForOrigen(origen);

    if (!scriptUrlOrigen) {
      signalError("No hay Apps Script configurado para el origen seleccionado.");
      return;
    }

    setDownloadState(true);
    showPill("warn", "Guardando...");
    note("Generando remito y guardando TXT...");

    const ordered = scans.slice().reverse();
    const lines = ordered.map(s => String(s.code));
    const content = lines.join("\n");

    try {
      const remitoData = await crearRemitoEnCuadernillo();
      const remito = remitoData?.remito;

      if (!remito) {
        throw new Error("El cuadernillo no devolvi� n�mero de remito.");
      }

      updateRemitoUI(remito);

      const fileName = resolveFilename(remito);
      const folderName = destino || "INVENTARIO";

      await guardarTxtEnOrigen({
        content,
        fileName,
        folderName,
        origen
      });

      signalSaved(remito, fileName);

    } catch (err) {
      console.error(err);
      signalError(err?.message || "Error al guardar.");
    } finally {
      setDownloadState(false);
    }
  }

  async function crearRemitoEnCuadernillo() {
    const origen = (el.origenSelect?.value || "").toUpperCase().trim();
    const destino = (el.destinoSelect?.value || "").toUpperCase().trim();
    const responsable = (el.respSelect?.value || "").toUpperCase().trim();
    const bultos = (el.bultosInput?.value || "0").trim();

    if (!origen) {
      throw new Error("Falta seleccionar ORIGEN.");
    }

    if (!destino) {
      throw new Error("Falta seleccionar DESTINO.");
    }

    const payload = {
      accion: "crear_remito",
      fecha: formatFechaCuadernillo(new Date()),
      origen,
      destino,
      bultos,
      responsable,
      aclaracion: ""
    };

    const res = await fetch(SCRIPT_URL_CUADERNILLO, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Cuadernillo HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Error al crear remito en cuadernillo.");
    }

    return data;
  }

  async function guardarTxtEnOrigen({ content, fileName, folderName, origen }) {
    const scriptUrl = getScriptUrlForOrigen(origen);

    if (!scriptUrl) {
      throw new Error("No hay Apps Script configurado para el origen.");
    }

    const payload = {
      content,
      fileName,
      folderName,
      mimeType: "text/plain"
    };

    const res = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`TXT HTTP ${res.status}`);
    }

    let data = null;

    try {
      data = await res.json();
    } catch {
      return { ok: true };
    }

    if (data && data.ok === false) {
      throw new Error(data.error || "Error al guardar TXT.");
    }

    return data || { ok: true };
  }

  function resolveFilename(remito) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const FECHA = `${dd}${mm}${yy}`;

    const DESTINO = safeName((el.destinoSelect?.value || "").toUpperCase());
    const RESPONSABLE = safeName((el.respSelect?.value || "").toUpperCase());
    const BULTOS = (el.bultosInput?.value || "0");

    let base = `${FECHA} ${DESTINO} ${RESPONSABLE} ${BULTOS}B REM${remito}`;
    base = base.trim();

    return ensureTxt(sanitize(base));
  }

  function formatFechaCuadernillo(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  function getScriptUrlForOrigen(origen) {
    const o = String(origen || "").toUpperCase().trim();
    if (o === "SARMIENTO")  return SCRIPT_URL_SARMIENTO;
    if (o === "AV2")        return SCRIPT_URL_AV2;
    if (o === "PUEYRREDON") return SCRIPT_URL_PUEYRREDON;
    if (o === "DEPOSITO")   return SCRIPT_URL_DEPOSITO;
    return "";
  }

  function ensureTxt(name) {
    return String(name).toLowerCase().endsWith(".txt") ? name : `${name}.txt`;
  }

  function sanitize(s) {
    return String(s).replace(/[\\/:*?"<>|]+/g, "_");
  }

  function safeName(s) {
    return String(s || "").normalize("NFC");
  }

  function parseCSV(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.length > 0);
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
          if (q && nxt === '"') {
            i++;
          } else {
            q = !q;
          }
        } else if (!q && c === ch) {
          n++;
        }
      }

      return n;
    };

    const totals = cands.map(ch => (score(l1, ch) + score(l2, ch)));
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => (
      {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]
    ));
  }

  function showPill(state, text) {
    if (!el.readyPill) return;

    el.readyPill.classList.remove("hidden", "ok", "warn", "danger");
    el.readyPill.classList.add(state || "ok");

    if (el.pillText) {
      el.pillText.textContent = text || (state === "ok" ? "Listo para pickear" : "Estado");
    }
  }
})();
