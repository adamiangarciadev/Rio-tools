/* app.js — 2 CSV, match normalizado, nombre con BULTOS, y UN SOLO TXT con TODOS los códigos
   - Sin descarga local (solo Drive)
   - Señal visual/sonora al enviar a Drive (optimista: con mode:"no-cors" no se puede confirmar 100%)
   - Botón opcional para limpiar escaneo (#resetBtn)
   - Auto-limpieza luego de "guardado"
   - ✅ Lista completa de pickeo + botón eliminar por ítem
   - ✅ Contador por ARTÍCULO con desplegable (muestra ARTICULO + COLOR + TALLE)
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
  const SCRIPT_URL_SARMIENTO  = "https://script.google.com/macros/s/AKfycbzpGGyA_acQYDzZldHnameD5Xwo8hGW6-eaFjAlDZfljsuU5tqkeCb8Nizk_e2CitDU/exec";
  const SCRIPT_URL_AV2        = "https://script.google.com/macros/s/AKfycbwPNl9zyKtgun43MijeiFL3BtGTyM79_a4pocTYlYOr9Q5KllWra6s2HjbGIr11XFGy9w/exec";
  const SCRIPT_URL_PUEYRREDON = "https://script.google.com/macros/s/AKfycbxKRHA79kv30UEjOU_eeehr8evuVPhqDFfSaanJgeJPgUSEZao5eLqsTyO73CdLvgZE/exec";
  const SCRIPT_URL_DEPOSITO   = "https://script.google.com/macros/s/AKfycbxidW-8kYw_w6Wsym4UU6euKDBLbZV-n2NapYarZvtx3tifPWPv22Ck4-y4F27xRqjx/exec";

  // ====== Estado ======
  let rows = [];
  let byCode = new Map();   // key(code) -> row
  let scans = [];
  let scanSeq = 0;
  let audioCtx = null;
  let scanTimer = null;

  // ====== Elementos ======
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
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
    artCounter: $("#artCounter"), // ✅ contenedor "Conteo por artículo"

    downloadBtn: $("#downloadBtn"), // botón Guardar
    resetBtn:    $("#resetBtn"),    // botón Borrar (opcional)
  };

  // ====== Init ======
  document.addEventListener("DOMContentLoaded", () => {
    setupSelectors();
    bindUI();
    loadAllCSVs(CSV_FILES);
    keepFocus();

    renderPickList();
    renderArticleCounter();
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

      el.scanInput.addEventListener("input", () => {
        ensureAudio();
        scheduleAutoCommit();
      });
    }

    // Guardar (solo Drive)
    if (el.downloadBtn) el.downloadBtn.addEventListener("click", downloadTxt);

    // Borrar todo (manual)
    if (el.resetBtn) el.resetBtn.addEventListener("click", resetScans);

    // Eliminar 1 escaneo puntual desde la lista
    if (el.pickList){
      el.pickList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del-id]");
        if (!btn) return;

        const id = Number(btn.getAttribute("data-del-id"));
        if (!Number.isFinite(id)) return;

        deleteScanById(id);
      });
    }
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
    list.forEach(v => {
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      select.appendChild(o);
    });
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
    o.type="sine"; o.frequency.value=880;
    g.gain.value=0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    o.stop(audioCtx.currentTime + 0.18);
  }

  function signalSaved(){
    note("Archivo guardado en Google Drive");
    showPill("ok", "TXT guardado en Drive");
    beepOk();
    setTimeout(() => resetScans({ silent: true }), 650);
  }

  function signalError(){
    note("ERROR al guardar en Google Drive");
    showPill("danger", "Error al guardar TXT");
    beepError();
  }

  // ====== CSV Load & Index ======
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

    renderArticleCounter();
  }

  // Normalización
  const key = (s) => String(s ?? "").trim().toUpperCase();

  // matcher tolerante a acentos/encodings rotos
  function normKey(s){
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu,"")
      .replace(/[^\p{L}\p{N}]+/gu,"")
      .trim();
  }

  function pickKey(keys, candidates){
    const set = new Set(keys);
    // match exacto primero
    for (const c of candidates){
      if (set.has(c)) return c;
    }
    // match normalizado (tolerante a "C�digo", etc.)
    const wanted = candidates.map(normKey);
    for (const k of keys){
      const nk = normKey(k);
      if (wanted.some(w => nk.includes(w))) return k;
    }
    return null;
  }

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

  // ✅ FIX: forzar columna Código para el index (evita que tome Artículo por error)
  function guessCodeColumn(keys){
    const forced = pickKey(keys, [
      "codigo_barras",
      "código","codigo","c�digo","cÃ³digo",
      "barcode","ean",
      "lectura","scan"
    ]);
    return forced || keys[0];
  }

  function getArticuloFromRow(row){
    if (!row) return "";
    const keys = Object.keys(row);
    const artKey = pickKey(keys, ["articulo","artículo","art�culo","artÃ­culo"]);
    return artKey ? String(row[artKey] ?? "").trim() : "";
  }

  // Para el TXT: por defecto devolver ARTÍCULO (código interno) si existe
  function getOutputCode(row, fallback){
    if (!row) return String(fallback ?? "");
    const art = getArticuloFromRow(row);
    if (art) return art;

    const keys = Object.keys(row);
    const pref = pickKey(keys, ["codigo","código","sku","cod"]);
    return String((pref ? row[pref] : fallback) ?? "");
  }

  function getColorTalleFromRow(row){
    if (!row) return { color:"", talle:"" };

    const keys = Object.keys(row);

    // tu CSV tiene "Descripción" dos veces -> parseCSV lo deja como:
    // "Descripción" y "Descripción_2" (o similar)
    const desc1 = pickKey(keys, ["descripcion","descripción","descripci�n","descripciÃ³n"]);
    const desc2 = pickKey(keys, ["descripcion_2","descripción_2","descripci�n_2","descripciÃ³n_2"]);

    const color = desc1 ? String(row[desc1] ?? "").trim() : "";
    const talle = desc2 ? String(row[desc2] ?? "").trim() : "";

    // fallback si algun CSV trae columnas explícitas
    const color2 = color || (pickKey(keys, ["color","col"]) ? String(row[pickKey(keys, ["color","col"])] ?? "").trim() : "");
    const talle2 = talle || (pickKey(keys, ["talle","tamaño","tamano","size"]) ? String(row[pickKey(keys, ["talle","tamaño","tamano","size"])] ?? "").trim() : "");

    return { color: color2, talle: talle2 };
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

    scans.unshift({ id: ++scanSeq, code: clean, ok: hit, time: new Date().toISOString() });
    scans = scans.slice(0, 5000);

    if (!hit){
      flash("err"); beepError(); note(`No encontrado: ${clean}`);
    } else {
      flash("ok"); note(`OK: ${clean}`);
    }

    renderLast();
    renderPickList();
    renderArticleCounter();
  }

  function deleteScanById(id){
    const before = scans.length;
    scans = scans.filter(s => s.id !== id);

    renderLast();
    renderPickList();
    renderArticleCounter();

    if (scans.length !== before){
      note("Ítem eliminado.");
      showPill("ok", "Ítem eliminado");
    }
  }

  function renderPickList(){
    if (!el.pickList) return;

    if (!scans.length){
      el.pickList.innerHTML = `<div style="padding:12px" class="muted">Sin escaneos.</div>`;
      return;
    }

    el.pickList.innerHTML = scans.map(s => `
      <div class="pick-row">
        <span class="pick-badge ${s.ok ? "ok" : "err"}" title="${s.ok ? "OK" : "NO"}">
          ${s.ok ? "✓" : "✗"}
        </span>

        <span class="pick-code">${escapeHtml(s.code)}</span>

        <button class="pick-del" type="button" data-del-id="${s.id}">
          Eliminar
        </button>
      </div>
    `).join("");
  }

  // ====== Contador por ARTÍCULO ======
  function renderArticleCounter(){
    if (!el.artCounter) return;

    if (!scans.length){
      el.artCounter.innerHTML = `<div class="muted">Sin escaneos.</div>`;
      return;
    }

    // Map: "ARTICULO COLOR TALLE" -> { total, variants(Map) }
    // y para sin equivalencia: agrupa por el mismo código escaneado
    const map = new Map();

    for (const s of scans){
      const row = byCode.get(key(s.code));

      if (!row){
        const label = String(s.code).trim();
        if (!map.has(label)) map.set(label, { total: 0, variants: new Map([["SIN EQUIVALENCIA", 0]]) });
        const it = map.get(label);
        it.total += 1;
        it.variants.set("SIN EQUIVALENCIA", (it.variants.get("SIN EQUIVALENCIA") || 0) + 1);
        continue;
      }

      const articulo = getArticuloFromRow(row) || s.code;
      const { color, talle } = getColorTalleFromRow(row);

      // ✅ lo que querías ver: "50-5000 BLANCO 85"
      const artLabel = [articulo, color, talle].filter(Boolean).join(" ").trim() || articulo;

      // variantes internas (por si en el futuro querés agrupar dentro del mismo artículo)
      const variantLabel = [color, talle].filter(Boolean).join(" · ") || "SIN VARIANTE";

      if (!map.has(artLabel)){
        map.set(artLabel, { total: 0, variants: new Map() });
      }
      const it = map.get(artLabel);
      it.total += 1;
      it.variants.set(variantLabel, (it.variants.get(variantLabel) || 0) + 1);
    }

    const sorted = Array.from(map.entries())
      .sort((a,b) => (b[1].total - a[1].total) || String(a[0]).localeCompare(String(b[0])));

    el.artCounter.innerHTML = sorted.map(([artLabel, info]) => {
      const variantsHtml = Array.from(info.variants.entries())
        .sort((a,b) => (b[1]-a[1]) || String(a[0]).localeCompare(String(b[0])))
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
              <span class="art-arrow">›</span>
              <span class="art-code">${escapeHtml(artLabel)}</span>
            </div>
            <span class="art-total">${info.total}</span>
          </summary>
          <div class="art-variants">${variantsHtml}</div>
        </details>
      `;
    }).join("");
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

  function resetScans({ silent=false } = {}){
    scans = [];
    if (el.scanCount) el.scanCount.textContent = "0 escaneados";
    if (el.lastScans) el.lastScans.innerHTML = "";
    if (el.scanInput){
      el.scanInput.value = "";
      el.scanInput.focus();
    }

    renderPickList();
    renderArticleCounter();

    if (!silent){
      note("Escaneo limpio. Listo para pickear.");
      showPill("ok", "Listo para pickear");
    }
  }

  function keepFocus(){
    if (!el.scanInput) return;
    el.scanInput.focus();
    document.addEventListener("click", (e) => {
      const isInteractive = e.target.closest('input,select,textarea,button,a,label,[role="button"]');
      if (!isInteractive) setTimeout(() => el.scanInput.focus(), 0);
    });
  }

  // ====== Guardar TXT (Drive) ======
  function downloadTxt(){
    ensureAudio();

    if (!scans.length){
      showPill("warn", "No hay escaneos");
      note("No hay escaneos para guardar.");
      flash("err");
      return;
    }

    showPill("warn", "Guardando en Drive…");
    note("Guardando en Google Drive…");

    const lines = scans.map(s => {
      const row = byCode.get(key(s.code));
      return getOutputCode(row, s.code);
    });

    const content = lines.join("\n");
    const fnameBase = resolveFilename();
    const folderName = (el.destinoSelect?.value || "INVENTARIO").toString().toUpperCase();

    enviarArchivoAGoogleDrive({ content, fileName: fnameBase, folderName });
  }

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

  function getScriptUrlForOrigen(origen){
    const o = String(origen || "").toUpperCase().trim();
    if (o === "SARMIENTO")  return SCRIPT_URL_SARMIENTO;
    if (o === "AV2")        return SCRIPT_URL_AV2;
    if (o === "PUEYRREDON") return SCRIPT_URL_PUEYRREDON;
    if (o === "DEPOSITO")   return SCRIPT_URL_DEPOSITO;
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

    const payload = { content, fileName, folderName, mimeType: "text/plain" };

    try {
      fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
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
  function ensureTxt(name){ return String(name).toLowerCase().endsWith(".txt") ? name : `${name}.txt`; }
  function sanitize(s){ return String(s).replace(/[\\/:*?"<>|]+/g, "_"); }
  function safeName(s){ return String(s || "").normalize("NFC"); }

  // ====== CSV robusto ======
  function parseCSV(text){
    const lines = String(text).split(/\r?\n/).filter(l => l.length>0);
    if (!lines.length) return [];

    const sep = detectDelimiter(lines[0], lines[1]);
    const rawHeaders = splitCSVLine(lines[0], sep);

    const seen = {};
    const headers = rawHeaders.map(h => {
      let k = String(h || "").trim();
      if (!k) k = "COL";
      if (seen[k]) { let n = 2; while (seen[`${k}_${n}`]) n++; k = `${k}_${n}`; }
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
        } else if (!q && c === ch){
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
    let cur = "";
    let q = false;
    for(let i=0;i<line.length;i++){
      const c=line[i], n=line[i+1];
      if (c === '"'){
        if (q && n === '"'){ cur+='"'; i++; }
        else { q=!q; }
      } else if (c === sep && !q){
        out.push(cur); cur="";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  // ====== Visual ======
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (m) =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])
    );
  }

  function showPill(state, text){
    if(!el.readyPill) return;
    el.readyPill.classList.remove("hidden","ok","warn","danger");
    el.readyPill.classList.add(state || "ok");
    if (el.pillText) el.pillText.textContent = text || (state === "ok" ? "Listo para pickear" : "Estado");
  }
})();
