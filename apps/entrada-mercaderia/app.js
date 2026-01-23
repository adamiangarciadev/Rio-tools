/* app.js — Recepción de mercadería, 2 CSV, match normalizado, SOLO guarda en Drive y botón reset */
;(() => {
  "use strict";

  // ====== Config ======
  const RESPONSABLES = ["DAVID","DIEGO","JOEL","MARTIN","MIGUEL","NAHUEL","RODRIGO","RAMON","ROBERTO","SERGIO","PATO","FRANCO","ANGEL","JESUS","MATIAS","BRENDA","VALENTINA","LUCIANO","ORIANA","AGUSTIN","SARA","SOLEDAD GALEANO","ALAN","ENZO","SOLEDAD SIERRA","DAIANA","PEDRO"];
  const SUCURSALES  = ["AV2","NAZCA","LAMARCA","CORRIENTES","CO2","CASTELLI","QUILMES","MORENO","SARMIENTO","DEPOSITO","PUEYRREDON"];
  const CSV_FILES   = ["equivalencia.csv", "equivalencia2.csv"]; // ambos si existen

  RESPONSABLES.sort((a, b) => a.localeCompare(b, "es"));
  SUCURSALES.sort((a, b) => a.localeCompare(b, "es"));


  const LS_META  = "recepcion_meta_v1";

  const AUTOCOMMIT_IDLE_MS = 80;
  const MIN_LEN_FOR_COMMIT = 3;

  // ====== URLs de Apps Script por SUCURSAL (entrada) ======
  const SCRIPT_URL_SARMIENTO = "https://script.google.com/macros/s/AKfycbzpGGyA_acQYDzZldHnameD5Xwo8hGW6-eaFjAlDZfljsuU5tqkeCb8Nizk_e2CitDU/exec";
  const SCRIPT_URL_AV2       = "https://script.google.com/macros/s/AKfycbwPNl9zyKtgun43MijeiFL3BtGTyM79_a4pocTYlYOr9Q5KllWra6s2HjbGIr11XFGy9w/exec";
  const SCRIPT_URL_PUEYRREDON = "https://script.google.com/macros/s/AKfycbxKRHA79kv30UEjOU_eeehr8evuVPhqDFfSaanJgeJPgUSEZao5eLqsTyO73CdLvgZE/exec";

  // ====== Estado ======
  let rows = [];
  let byCode = new Map();   // key(code) -> row
  let scans = [];
  let audioCtx = null;
  let scanTimer = null;

  // ====== Elementos ======
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const el = {
    readyPill: $("#readyPill"),
    pillText:  $("#pillText"),

    // Campos recepción
    respOrigenSelect:      $("#respOrigenSelect"),
    remitoOrigenInput:     $("#remitoOrigenInput"),
    respEntradaSelect:     $("#respEntradaSelect"),
    sucursalEntradaSelect: $("#sucursalEntradaSelect"),
    bultosInput:           $("#bultosInput"),

    scanInput:  $("#scanInput"),
    scanCount:  $("#scanCount"),
    noti:       $("#noti"),
    lastScans:  $("#lastScans"),

    // Botones
    saveBtn:   $("#saveBtn"),
    resetBtn:  $("#resetBtn"),
  };

  // ====== Init ======
  document.addEventListener("DOMContentLoaded", () => {
    setupSelectors();
    bindUI();
    loadAllCSVs(CSV_FILES);
    keepFocus();
  });

  function bindUI(){
    if (el.scanInput){
      el.scanInput.addEventListener("keydown", (e) => {
        ensureAudio();
        if (e.key === "Enter"){
          e.preventDefault();
          const code = (el.scanInput.value || "").trim();
          processScan(code);
          el.scanInput.value = "";
          el.scanInput.focus();
          clearTimeout(scanTimer); scanTimer = null;
          return;
        }
        scheduleAutoCommit();
      });
      el.scanInput.addEventListener("input", () => { ensureAudio(); scheduleAutoCommit(); });
    }

    // Guardar TXT SOLO en Drive
    if (el.saveBtn) {
      el.saveBtn.addEventListener("click", guardarEnDrive);
    }

    // Reset escaneo (volver a 0)
    if (el.resetBtn) {
      el.resetBtn.addEventListener("click", resetScans);
    }
  }

  // ====== Selectors / LocalStorage ======
  function setupSelectors(){
    fillOptions(el.respOrigenSelect, RESPONSABLES);
    fillOptions(el.respEntradaSelect, RESPONSABLES);
    fillOptions(el.sucursalEntradaSelect, SUCURSALES);

    const {
      respOrigen,
      remitoOrigen,
      respEntrada,
      sucursalEntrada,
      bultos
    } = readLocal(LS_META) || {};

    if (respOrigen && RESPONSABLES.includes(respOrigen)) {
      el.respOrigenSelect.value = respOrigen;
    }
    if (respEntrada && RESPONSABLES.includes(respEntrada)) {
      el.respEntradaSelect.value = respEntrada;
    }
    if (sucursalEntrada && SUCURSALES.includes(sucursalEntrada)) {
      el.sucursalEntradaSelect.value = sucursalEntrada;
    }
    if (typeof bultos === "string") {
      el.bultosInput.value = bultos;
    }
    if (typeof remitoOrigen === "string") {
      el.remitoOrigenInput.value = remitoOrigen;
    }

    [el.respOrigenSelect, el.respEntradaSelect, el.sucursalEntradaSelect].forEach(s => s?.addEventListener("change", saveMeta));

    const digitsOnly = (e) => {
      const v = (e.target.value || "").replace(/\D+/g, "");
      if (v !== e.target.value) e.target.value = v;
      saveMeta();
    };

    el.bultosInput?.addEventListener("input", digitsOnly);
    el.remitoOrigenInput?.addEventListener("input", digitsOnly);
  }

  function saveMeta(){
    writeLocal(LS_META, {
      respOrigen:      el.respOrigenSelect?.value || "",
      remitoOrigen:    el.remitoOrigenInput?.value || "",
      respEntrada:     el.respEntradaSelect?.value || "",
      sucursalEntrada: el.sucursalEntradaSelect?.value || "",
      bultos:          el.bultosInput?.value || "",
    });
  }

  function writeLocal(k, obj){
    try{
      localStorage.setItem(k, JSON.stringify(obj));
    }catch{}
  }

  function readLocal(k){
    try{
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : null;
    }catch{
      return null;
    }
  }

  function fillOptions(select, list){
    if(!select) return;
    select.innerHTML = "";
    list.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      select.appendChild(o);
    });
  }

  // ====== Audio ======
  function ensureAudio(){
    if (!audioCtx){
      try{
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }catch{
        audioCtx = null;
      }
    }
  }

  function beepError(){
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type="square"; o.frequency.value=220;
    g.gain.value=0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
    o.stop(audioCtx.currentTime + 0.25);
    if (navigator.vibrate) navigator.vibrate(80);
  }

  // ====== CSV Load & Index (multi-archivo) ======
  async function loadAllCSVs(list){
    byCode.clear();
    rows = [];
    const jobs = list.map(async (name) => {
      try{
        const res = await fetch("./" + name, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        const data = parseCSV(text);
        addToIndex(data, /*noOverride*/ true);
        rows = rows.concat(data);
        return { name, ok: true, rows: data.length };
      }catch(e){
        return { name, ok: false, err: e?.message || "error" };
      }
    });

    const results = await Promise.all(jobs);
    const okCount = results.filter(r => r.ok).length;

    if (okCount === 0){
      showPill("danger","No se encontró ningún CSV");
      note("No se cargaron CSV. Revisá nombres y mayúsculas/minúsculas.");
    } else if (okCount === list.length){
      showPill("ok",`Listo (${okCount}/${list.length} CSV)`);
      note(results.map(r => `OK ${r.name} (${r.rows})`).join(" · "));
    } else {
      const misses = results.filter(r => !r.ok).map(r => r.name).join(", ");
      showPill("warn",`Listo con ${okCount}/${list.length} CSV`);
      note(`Faltó: ${misses}. Verificá que estén en la misma carpeta y con ese nombre exacto.`);
    }
  }

  // Normalización de clave para el match
  const key = (s) => String(s ?? "").trim().toUpperCase();

  function addToIndex(data, noOverride){
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

  function guessCodeColumn(keys){
    const norm = s => (s||"").toLowerCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu,"");
    const patterns = [
      "codigo_barras","codigo barras","barra","barcode","ean","lectura","scan",
      "codigo","código","equivalencia","equiv","sku","cod"
    ];
    return keys.find(k => patterns.some(p => norm(k).includes(p))) || keys[0];
  }

  // Preferir ARTÍCULO (código interno), sino código/sku/cod
  function getOutputCode(row, fallback){
    if (!row) return String(fallback ?? "");
    const keys = Object.keys(row);
    const prefArt = findKey(keys, ["articulo","artículo"]);
    if (prefArt) return String(row[prefArt] ?? "");
    const pref = findKey(keys, ["codigo","código","sku","cod"]);
    return String((pref ? row[pref] : fallback) ?? "");
  }

  function findKey(keys, pats){
    const norm = s => (s||"").toLowerCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu,"");
    return keys.find(k => pats.some(p => norm(k).includes(p)));
  }

  // ====== Scan Handling ======
  function scheduleAutoCommit(){
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { autoCommit(); }, AUTOCOMMIT_IDLE_MS);
  }

  function autoCommit(){
    const code = (el.scanInput.value || "").trim();
    if (code.length >= MIN_LEN_FOR_COMMIT){
      processScan(code);
      el.scanInput.value = "";
      el.scanInput.focus();
    }
    scanTimer = null;
  }

  function processScan(code){
    const clean = String(code || "").trim();
    if (!clean){
      flash("err");
      return;
    }
    const k = key(clean);
    const hit = byCode.has(k);
    scans.unshift({ code: clean, ok: hit, time: new Date().toISOString() });
    scans = scans.slice(0, 5000);
    if (!hit){
      flash("err");
      beepError();
      note(`No encontrado: ${clean}`);
    } else {
      flash("ok");
      note(`OK: ${clean}`);
    }
    renderLast();
  }

  function flash(kind){
    if (!el.scanInput) return;
    el.scanInput.classList.remove("ok","err");
    void el.scanInput.offsetWidth;
    el.scanInput.classList.add(kind);
    setTimeout(() => el.scanInput.classList.remove(kind), 220);
  }

  function note(msg){
    if (el.noti) el.noti.textContent = msg;
  }

  function renderLast(){
    if (!el.lastScans) return;
    const total = scans.length;
    if (el.scanCount) el.scanCount.textContent = `${total} escaneados`;
    const recent = scans.slice(0, 10)
      .map(s => `<span class="${s.ok?'ok':'err'}">${s.ok?'✓':'✗'} ${escapeHtml(s.code)}</span>`)
      .join(" · ");
    el.lastScans.innerHTML = recent || "";
  }

  // Mantener foco SOLO donde corresponde
  function keepFocus(){
    if (!el.scanInput) return;
    el.scanInput.focus();
    document.addEventListener("click", (e) => {
      const isInteractive = e.target.closest('input,select,textarea,button,a,label,[role="button"]');
      if (!isInteractive) setTimeout(() => el.scanInput.focus(), 0);
    });
  }

  // ====== Guardar TXT SOLO en Drive ======
  function guardarEnDrive(){
    if (!scans.length){
      note("No hay escaneos para guardar.");
      flash("err");
      return;
    }

    const lines = scans.map(s => {
      const row = byCode.get(key(s.code));
      return getOutputCode(row, s.code);
    });

    const content = lines.join("\n");
    const fnameBase = resolveFilename();
    const folderName = (el.sucursalEntradaSelect?.value || "RECEPCION").toString().toUpperCase();

    enviarArchivoAGoogleDrive({
      content: content,
      fileName: fnameBase,
      folderName: folderName
    });

    note("Archivo enviado a Drive (revisar carpeta en unos segundos).");
  }

  // ====== Reset escaneo ======
  function resetScans(){
    scans = [];
    renderLast();
    note("Escaneos reiniciados.");
  }

  // Formato RECEPCIÓN:
  // YYMMDD <SUC_ENTRADA> <RESP_ENTRADA> <BULTOS>B REM<REMITO_ORIGEN> OK.txt
  function resolveFilename(){
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth()+1).padStart(2,"0");
    const dd = String(now.getDate()).padStart(2,"0");
    const FECHA = `${yy}${mm}${dd}`;

    const SUC_ENTRADA = safeName((el.sucursalEntradaSelect?.value || "").toUpperCase());
    const RESP_ENTRADA = safeName((el.respEntradaSelect?.value || "").toUpperCase());
    const BULTOS = (el.bultosInput?.value || "0");
    const REM_ORIGEN = (el.remitoOrigenInput?.value || "");

    let base = `${FECHA} ${SUC_ENTRADA} ${RESP_ENTRADA} ${BULTOS}B REM${REM_ORIGEN} OK`;
    base = base.trim();
    return ensureTxt(sanitize(base));
  }

  // ====== Envío a Apps Script (Google Drive) ======
  function getScriptUrlForSucursal(sucursal){
    const o = String(sucursal || "").toUpperCase().trim();

    if (o === "SARMIENTO")   return SCRIPT_URL_SARMIENTO;
    if (o === "AV2")         return SCRIPT_URL_AV2;
    if (o === "PUEYRREDON")  return SCRIPT_URL_PUEYRREDON;

    return "";
  }

  function enviarArchivoAGoogleDrive({ content, fileName, folderName }){
    const sucursal = el.sucursalEntradaSelect?.value || "";
    const scriptUrl = getScriptUrlForSucursal(sucursal);

    if (!scriptUrl){
      console.warn("No hay SCRIPT_URL configurada para la sucursal de entrada:", sucursal);
      note("No hay script configurado para esta sucursal.");
      return;
    }

    const payload = {
      content: content,
      fileName: fileName,
      folderName: folderName,
      mimeType: "text/plain"
    };

    try {
      fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });
      console.log(
        "Archivo enviado a Apps Script para guardar en Drive:",
        fileName,
        "=> carpeta", folderName,
        "SUCURSAL ENTRADA:", sucursal
      );
    } catch (err) {
      console.error("Error al enviar a Apps Script:", err);
      note("Error al enviar a Drive (ver consola).");
    }
  }

  // ====== Helpers ======
  function ensureTxt(name){
    return name.toLowerCase().endsWith(".txt") ? name : `${name}.txt`;
  }

  function sanitize(s){
    return s.replace(/[\\/:*?"<>|]+/g, "_");
  }

  function safeName(s){
    return s.normalize("NFC");
  }

  // CSV robusto
  function parseCSV(text){
    const lines = text.split(/\r?\n/).filter(l => l.length>0);
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
    for (let i=1;i<lines.length;i++){
      const cells = splitCSVLine(lines[i], sep);
      const obj = {};
      headers.forEach((h,idx) => obj[h] = (cells[idx] ?? "").trim());
      out.push(obj);
    }
    return out;
  }

  function detectDelimiter(l1, l2=""){
    const cands = [",",";","|","\t"];
    const score = (line, ch) => {
      let q=false, n=0;
      for(let i=0;i<line.length;i++){
        const c=line[i], nxt=line[i+1];
        if (c === '"'){
          if(q && nxt === '"'){ i++; }
          else { q=!q; }
        }
        else if (!q && c === ch){
          n++;
        }
      }
      return n;
    };
    const totals = cands.map(ch => (score(l1,ch)+score(l2,ch)));
    let best = 0, bestIdx = 0;
    totals.forEach((n,idx) => { if(n>best){ best=n; bestIdx=idx; } });
    return best>0 ? cands[bestIdx] : ";";
  }

  function splitCSVLine(line, sep){
    const out = [];
    let cur="";
    let q=false;
    for(let i=0;i<line.length;i++){
      const c=line[i], n=line[i+1];
      if(c === '"'){
        if(q && n === '"'){ cur+='"'; i++; }
        else { q=!q; }
      } else if(c === sep && !q){
        out.push(cur); cur="";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (m) =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])
    );
  }

  function showPill(state, text){
    if(!el.readyPill) return;
    el.readyPill.classList.remove("hidden","ok","warn","danger");
    el.readyPill.classList.add(state || "ok");
    if(el.pillText) {
      el.pillText.textContent = text || (state === "ok" ? "Listo para recibir" : "Estado");
    }
  }
})();
