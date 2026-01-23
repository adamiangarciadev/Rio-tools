/* app.js — 2 CSV, match normalizado, nombre con BULTOS, y UN SOLO TXT con TODOS los códigos
   - Sin descarga local
   - Señal visual/sonora al enviar a Drive (optimista: con mode:"no-cors" no se puede confirmar 100%)
*/
;(() => {
  "use strict";

  // ====== Config ======
  const RESPONSABLES = ["DAVID","DIEGO","JOEL","MARTIN","MIGUEL","NAHUEL","RODRIGO","RAMON","ROBERTO","SERGIO","PATO","FRANCO"];
  const SUCURSALES  = ["AV2","NAZCA","LAMARCA","CORRIENTES","CO2","CASTELLI","QUILMES","MORENO","SARMIENTO","DEPOSITO","PUEYRREDON"];
  const CSV_FILES   = ["equivalencia.csv", "equivalencia2.csv"]; // ambos si existen
  const LS_META  = "pickeo_meta_v1";
  const AUTOCOMMIT_IDLE_MS = 80;
  const MIN_LEN_FOR_COMMIT = 3;

  // ====== URLs de Apps Script por ORIGEN ======
  // SARMIENTO
  const SCRIPT_URL_SARMIENTO = "https://script.google.com/macros/s/AKfycbzpGGyA_acQYDzZldHnameD5Xwo8hGW6-eaFjAlDZfljsuU5tqkeCb8Nizk_e2CitDU/exec";

  // AV2
  const SCRIPT_URL_AV2 = "https://script.google.com/macros/s/AKfycbwPNl9zyKtgun43MijeiFL3BtGTyM79_a4pocTYlYOr9Q5KllWra6s2HjbGIr11XFGy9w/exec";

  // PUEYRREDON
  const SCRIPT_URL_PUEYRREDON = "https://script.google.com/macros/s/AKfycbxKRHA79kv30UEjOU_eeehr8evuVPhqDFfSaanJgeJPgUSEZao5eLqsTyO73CdLvgZE/exec";

  // DEPOSITO
  const SCRIPT_URL_DEPOSITO = "https://script.google.com/macros/s/AKfycbxidW-8kYw_w6Wsym4UU6euKDBLbZV-n2NapYarZvtx3tifPWPv22Ck4-y4F27xRqjx/exec";

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
    respSelect:   $("#respSelect"),
    origenSelect: $("#origenSelect"),
    destinoSelect:$("#destinoSelect"),
    bultosInput:  $("#bultosInput"),
    remitoInput:  $("#remitoInput"),
    scanInput: $("#scanInput"),
    scanCount: $("#scanCount"),
    noti:       $("#noti"),
    lastScans:  $("#lastScans"),
    downloadBtn: $("#downloadBtn"),
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
    if (el.downloadBtn) el.downloadBtn.addEventListener("click", downloadTxt);
  }

  // ====== Selectors / LocalStorage ======
  function setupSelectors(){
    fillOptions(el.respSelect, RESPONSABLES);
    fillOptions(el.origenSelect, SUCURSALES);
    fillOptions(el.destinoSelect, SUCURSALES);

    const { responsable, origen, destino, remito, bultos } = readLocal(LS_META) || {};
    if (responsable && RESPONSABLES.includes(responsable)) el.respSelect.value = responsable;
    if (origen && SUCURSALES.includes(origen)) el.origenSelect.value = origen;
    if (destino && SUCURSALES.includes(destino)) el.destinoSelect.value = destino;
    if (typeof bultos === "string") el.bultosInput.value = bultos;
    if (typeof remito === "string") el.remitoInput.value = remito;

    [el.respSelect, el.origenSelect, el.destinoSelect].forEach(s => s?.addEventListener("change", saveMeta));
    const digitsOnly = (e) => {
      const v = (e.target.value || "").replace(/\D+/g, "");
      if (v !== e.target.value) e.target.value = v;
      saveMeta();
    };
    el.bultosInput?.addEventListener("input", digitsOnly);
    el.remitoInput?.addEventListener("input", digitsOnly);
  }

  function saveMeta(){
    writeLocal(LS_META, {
      responsable: el.respSelect?.value || "",
      origen:      el.origenSelect?.value || "",
      destino:     el.destinoSelect?.value || "",
      bultos:      el.bultosInput?.value || "",
      remito:      el.remitoInput?.value || "",
    });
  }

  function writeLocal(k, obj){ try{ localStorage.setItem(k, JSON.stringify(obj)); }catch{} }
  function readLocal(k){ try{ const r = localStorage.getItem(k); return r? JSON.parse(r): null; }catch{ return null; } }

  function fillOptions(select, list){
    if(!select) return;
    select.innerHTML = "";
    list.forEach(v => { const o=document.createElement("option"); o.value=v; o.textContent=v; select.appendChild(o); });
  }

  // ====== Audio ======
  function ensureAudio(){
    if (!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch{ audioCtx = null; }
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

  function beepOk(){
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type="sine";
    o.frequency.value=880;
    g.gain.value=0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    o.stop(audioCtx.currentTime + 0.18);
  }

  // Señal "guardado" (optimista)
  function signalSaved(){
    note("Archivo guardado en Google Drive");
    showPill("ok", "TXT guardado en Drive");
    beepOk();
  }

  function signalError(){
    note("ERROR al guardar en Google Drive");
    showPill("danger", "Error al guardar TXT");
    beepError();
  }

  // ====== CSV Load & Index (multi-archivo) ======
  async function loadAllCSVs(list){
    byCode.clear(); rows = [];
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
    const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"");
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
    const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"");
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
    if (!clean){ flash("err"); return; }
    const k = key(clean);
    const hit = byCode.has(k);

    scans.unshift({ code: clean, ok: hit, time: new Date().toISOString() });
    scans = scans.slice(0, 5000);

    if (!hit){
      flash("err"); beepError(); note(`No encontrado: ${clean}`);
    } else {
      flash("ok"); note(`OK: ${clean}`);
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

  function note(msg){ if (el.noti) el.noti.textContent = msg; }

  function renderLast(){
    if (!el.lastScans) return;
    const total = scans.length;
    if (el.scanCount) el.scanCount.textContent = `${total} escaneados`;
    const recent = scans.slice(0, 10)
      .map(s => `<span class="${s.ok?'ok':'err'}">${s.ok?'✓':'✗'} ${escapeHtml(s.code)}</span>`)
      .join(" · ");
    el.lastScans.innerHTML = recent || "";
  }

  // Mantener foco SOLO donde corresponde (sin robarlo a los selects/inputs)
  function keepFocus(){
    if (!el.scanInput) return;
    el.scanInput.focus();
    document.addEventListener("click", (e) => {
      const isInteractive = e.target.closest('input,select,textarea,button,a,label,[role="button"]');
      if (!isInteractive) setTimeout(() => el.scanInput.focus(), 0);
    });
  }

  // ====== TXT (UN SOLO ARCHIVO con TODOS los códigos) ======
  function downloadTxt(){
    // Señal de "enviando"
    showPill("warn", "Guardando en Drive…");
    note("Guardando en Google Drive…");

    // Todos los escaneos, convirtiendo a código interno si existe
    const lines = scans.map(s => {
      const row = byCode.get(key(s.code));
      return getOutputCode(row, s.code);
    });

    const content = lines.join("\n");
    const fnameBase = resolveFilename();

    // ✅ SOLO Drive (sin descarga local)
    const folderName = (el.destinoSelect?.value || "INVENTARIO").toString().toUpperCase();
    enviarArchivoAGoogleDrive({
      content: content,
      fileName: fnameBase,
      folderName: folderName
    });
  }

  // Formato: YYMMDD DESTINO RESPONSABLE NB REM<REMITO>.txt
  function resolveFilename(){
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth()+1).padStart(2,"0");
    const dd = String(now.getDate()).padStart(2,"0");
    const FECHA = `${yy}${mm}${dd}`;

    const DESTINO = safeName((el.destinoSelect?.value || "").toUpperCase());
    const RESPONSABLE = safeName((el.respSelect?.value || "").toUpperCase());
    const BULTOS = (el.bultosInput?.value || "0");
    const REMITO = (el.remitoInput?.value || "");

    let base = `${FECHA} ${DESTINO} ${RESPONSABLE} ${BULTOS}B REM${REMITO}`;
    base = base.trim();
    return ensureTxt(sanitize(base));
  }

  // ====== Envío a Apps Script (Google Drive) ======
  function getScriptUrlForOrigen(origen){
    const o = String(origen || "").toUpperCase().trim();
    if (o === "SARMIENTO") return SCRIPT_URL_SARMIENTO;
    if (o === "AV2")       return SCRIPT_URL_AV2;
    if (o === "PUEYRREDON") return SCRIPT_URL_PUEYRREDON;
    if (o === "DEPOSITO") return SCRIPT_URL_DEPOSITO;
    // Si aún no hay script asignado para otros locales:
    return "";
  }

  function enviarArchivoAGoogleDrive({ content, fileName, folderName }){
    const origen = el.origenSelect?.value || "";
    const scriptUrl = getScriptUrlForOrigen(origen);

    if (!scriptUrl){
      console.warn("No hay SCRIPT_URL configurada para el origen:", origen);
      signalError();
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
        mode: "no-cors", // no podemos leer la respuesta, pero el archivo se crea igual (señal optimista)
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      })
      .then(() => {
        console.log("Archivo enviado a Apps Script:", fileName, "=> carpeta", folderName, "ORIGEN:", origen);
        signalSaved();
      })
      .catch((err) => {
        console.error("Error al enviar a Apps Script:", err);
        signalError();
      });
    } catch (err) {
      console.error("Error al enviar a Apps Script:", err);
      signalError();
    }
  }

  // ====== Helpers ======
  function ensureTxt(name){ return name.toLowerCase().endsWith(".txt") ? name : `${name}.txt`; }
  function sanitize(s){ return s.replace(/[\\/:*?"<>|]+/g, "_"); } // mantiene espacios/acentos
  function safeName(s){ return s.normalize("NFC"); }

  // ====== CSV robusto (autodetecta ; , | \t y comillas) ======
  function parseCSV(text){
    const lines = text.split(/\r?\n/).filter(l => l.length>0);
    if (!lines.length) return [];
    const sep = detectDelimiter(lines[0], lines[1]); // ; , | \t
    const rawHeaders = splitCSVLine(lines[0], sep);

    // deduplicar encabezados
    const seen = {};
    const headers = rawHeaders.map(h => {
      let k = String(h || "").trim();
      if (!k) k = "COL";
      if (seen[k]) { let n = 2; while (seen[`${k}_${n}`]) n++; k = `${k}_${n}`; }
      seen[k] = true; return k;
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
        if (c === '"'){ if(q && nxt === '"'){ i++; } else { q=!q; } }
        else if (!q && c === ch){ n++; }
      }
      return n;
    };
    const totals = cands.map(ch => (score(l1,ch)+score(l2,ch)));
    let best = 0, bestIdx = 0;
    totals.forEach((n,idx) => { if(n>best){ best=n; bestIdx=idx; } });
    return best>0 ? cands[bestIdx] : ";";
  }

  function splitCSVLine(line, sep){
    const out = []; let cur=""; let q=false;
    for(let i=0;i<line.length;i++){
      const c=line[i], n=line[i+1];
      if(c === '"'){
        if(q && n === '"'){ cur+='"'; i++; } else { q=!q; }
      } else if(c === sep && !q){
        out.push(cur); cur="";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  // ====== Otros helpers visuales ======
  function slug(s){
    return (s||"").toString()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu,"")
      .replace(/[^\w\-]+/g,"_")
      .replace(/_+/g,"_")
      .replace(/^_|_$/g,"");
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  }

  function showPill(state, text){
    if(!el.readyPill) return;
    el.readyPill.classList.remove("hidden","ok","warn","danger");
    el.readyPill.classList.add(state || "ok");
    if(el.pillText) el.pillText.textContent = text || (state === "ok" ? "Listo para pickear" : "Estado");
  }
})();
