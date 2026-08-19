import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";

const SUPABASE_URL = "https://hczekjyagyoxdqkzdimd.supabase.co";
const SUPABASE_KEY = "sb_publishable_Fc6lL-Zdb_pBqcob_cvgzQ_NOnnpxII";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CSV_FILES = ["../../data/equivalencia.csv", "../../data/equivalencia2.csv"];
const BACKUP_ROOT_FOLDER_ID = "1HoQBiMRvflZuyLtCaJyRBWio1C5i6ofH";
const SCRIPT_URL_PICKING_TRANSITO = "https://script.google.com/macros/s/AKfycbw8AmleDr1QUztLFUMBcmhOIglNKdp3AVXc_N8W81GshcOEKK2jGzX3-68ZYajI30-bRg/exec";
const PICKING_IDLE_MS = 80;
const MAX_SCANS = 5000;
const BRANCH_KEY = "mercaderia_transito_v2_sucursal";
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const SARMIENTO = "SARMIENTO";
const DEPOSITO = "DEPOSITO";
const GRUPO_1 = ["AVELLANEDA 2", "NAZCA", "LAMARCA"];
const GRUPO_2 = ["CORRIENTES", "CASTELLI", "PUEYRREDON"];
const SIEMPRE_SARMIENTO = ["QUILMES"];
const $ = (selector) => document.querySelector(selector);
const state = {
  rows: [], sucursal: localStorage.getItem(BRANCH_KEY) || "", search: "",
  picking: { remito: null, scans: [], seq: 0, byCode: new Map(), loaded: false, error: "", timer: null, audio: null }
};

const el = {
  sucursal: $("#sucursalSelect"), search: $("#searchRemito"), refresh: $("#refreshBtn"),
  status: $("#estadoCarga"), cards: $("#cardsWrap"), modalPicking: $("#modalPicking"),
  modalPdf: $("#modalPdf"), closePdf: $("#cerrarPdfModalBtn"),
  pdfTitle: $("#pdfModalTitle"), pdfFrame: $("#pdfViewerFrame"),
  closePicking: $("#cerrarPickingModalBtn"), pickingRemito: $("#pickingRemito"),
  pickingSucursal: $("#pickingSucursal"), pickingCodigo: $("#pickingCodigo"),
  pickingScan: $("#pickingScanInput"), pickingCount: $("#pickingScanCount"),
  pickingNote: $("#pickingNoti"), pickingLast: $("#pickingLastScans"),
  pickingList: $("#pickingPickList"), pickingCounter: $("#pickingArtCounter"),
  resetPicking: $("#resetPickingBtn"), downloadPicking: $("#descargarPickingBtn")
};

el.refresh.addEventListener("click", loadRemitos);
el.sucursal.addEventListener("change", () => {
  state.sucursal = canon(el.sucursal.value);
  localStorage.setItem(BRANCH_KEY, state.sucursal);
  render();
});
el.search.addEventListener("input", () => { state.search = canon(el.search.value); render(); });
el.cards.addEventListener("click", handleAction);
el.closePdf.addEventListener("click", closePdf);
el.modalPdf.addEventListener("click", event => { if (event.target === el.modalPdf) closePdf(); });
el.closePicking.addEventListener("click", closePicking);
el.modalPicking.addEventListener("click", event => { if (event.target === el.modalPicking) closePicking(); });
el.resetPicking.addEventListener("click", () => resetPicking());
el.downloadPicking.addEventListener("click", savePicking);
el.pickingList.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-scan]");
  if (!button) return;
  state.picking.scans = state.picking.scans.filter(scan => scan.id !== Number(button.dataset.deleteScan));
  renderPicking();
});
el.pickingScan.addEventListener("keydown", event => {
  ensureAudio();
  if (event.key === "Enter") {
    event.preventDefault();
    commitScan();
    return;
  }
  scheduleScan();
});
el.pickingScan.addEventListener("input", () => { ensureAudio(); scheduleScan(); });
Promise.all([loadRemitos(), loadPickingEquivalences()]);
setInterval(loadRemitos, AUTO_REFRESH_MS);

async function loadRemitos() {
  el.status.textContent = "Cargando desde Supabase...";
  const { data, error } = await supabase.from("transito_v2_remitos").select("*").order("fecha", { ascending: false });
  if (error) {
    el.status.textContent = `Error: ${error.message}`;
    el.cards.innerHTML = '<div class="empty">No se pudo cargar. Verificá que tu perfil esté activo.</div>';
    return;
  }
  state.rows = data || [];
  fillBranches();
  render();
  el.status.textContent = "";
}

function fillBranches() {
  const branches = [...new Set(state.rows
    .flatMap(r => [canon(r.desde), canon(r.hacia)])
    .filter(branch => branch && branch !== DEPOSITO))].sort();
  if (!branches.includes(state.sucursal)) state.sucursal = branches[0] || "";
  el.sucursal.innerHTML = branches.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  el.sucursal.value = state.sucursal;
}

function render() {
  const rows = state.rows.filter(visible).filter(matchesSearch).sort(sortRows);
  if (!rows.length) {
    el.cards.innerHTML = '<div class="empty">No hay remitos pendientes para esta sucursal.</div>';
    return;
  }
  el.cards.innerHTML = rows.map(r => {
    const stage = resolveStage(r);
    const actions = stage.action === "estado"
      ? `<button class="btn primary" data-id="${r.id}" data-state="${escapeHtml(stage.next)}">${escapeHtml(stage.button)}</button>`
      : stage.action === "final"
        ? `<button class="btn ok" data-id="${r.id}" data-state="CONFIRMADO OK">CONFIRMADO OK</button><button class="btn warn" data-id="${r.id}" data-state="DIFERENCIAS">DIFERENCIAS</button>`
        : stage.action === "differences"
          ? `<button class="btn warn" data-id="${r.id}" data-state="DIFERENCIAS">EDITAR DIFERENCIAS</button>` : "";
    const isReceived = canon(r.estado) === "RECIBIDO EN SUCURSAL";
    const badgeClass = isReceived ? "recibido-sucursal" : canon(r.estado) === "DIFERENCIAS" ? "diferencias" : "recibido";
    const audit = [
      r.cod_recibe_sarmiento && `Recibió en Sarmiento: ${r.cod_recibe_sarmiento}`,
      r.cod_envia_sarmiento && `Envió desde Sarmiento: ${r.cod_envia_sarmiento}`,
      r.cod_cierre && `Cierre: ${r.cod_cierre}${r.tipo_cierre ? ` (${r.tipo_cierre})` : ""}`
    ].filter(Boolean);
    return `
      <article class="card ${isReceived ? "card-recibido-sucursal" : ""}">
        <div class="card-left">
          ${isReceived ? `<button class="btn secondary btn-picking-trigger" type="button" data-picking-id="${r.id}">REALIZAR PICKING</button>` : ""}
          <div class="card-title-row">
            <h3>Remito ${escapeHtml(r.remito)}</h3>
            ${r.file_id ? `<button class="btn view" type="button" data-pdf-id="${r.id}">VER</button>` : ""}
          </div>
          <span class="badge ${badgeClass}">${escapeHtml(r.estado || "PENDIENTE")}</span>
        </div>
        <div class="card-center">
          <div class="info"><span class="label">Fecha</span><strong>${formatDate(r.fecha)}</strong></div>
          <div class="info"><span class="label">Desde</span><strong>${escapeHtml(r.desde || "-")}</strong></div>
          <div class="info"><span class="label">Hacia</span><strong>${escapeHtml(r.hacia || "-")}</strong></div>
          <div class="info"><span class="label">Prendas</span><strong>${r.total_prendas ?? "-"}</strong></div>
          <div class="info"><span class="label">Circuito</span><strong>${needsSarmiento(r.desde,r.hacia) ? "CON SARMIENTO" : "DIRECTO"}</strong></div>
          <div class="info"><span class="label">Etapa actual</span><strong>${escapeHtml(stage.label)}</strong></div>
        </div>
        <div class="card-right">${actions}</div>
      </article>
      ${(r.observacion || r.carpeta_url || audit.length) ? `
        <div class="extra">
          ${r.observacion ? `<div><strong>Obs:</strong> ${escapeHtml(r.observacion)}</div>` : ""}
          ${r.carpeta_url ? `<div><a href="${escapeHtml(r.carpeta_url)}" target="_blank" rel="noopener noreferrer">Ver carpeta</a></div>` : ""}
          ${audit.map(item => `<div>${escapeHtml(item)}</div>`).join("")}
        </div>` : ""}
    `;
  }).join("");
}

async function handleAction(event) {
  const pdfButton = event.target.closest("[data-pdf-id]");
  if (pdfButton) {
    const pdfRow = state.rows.find(item => String(item.id) === pdfButton.dataset.pdfId);
    if (pdfRow) openPdf(pdfRow);
    return;
  }
  const pickingButton = event.target.closest("[data-picking-id]");
  if (pickingButton) {
    const pickingRow = state.rows.find(item => String(item.id) === pickingButton.dataset.pickingId);
    if (pickingRow) openPicking(pickingRow);
    return;
  }
  const button = event.target.closest("[data-id][data-state]");
  if (!button) return;
  const row = state.rows.find(item => String(item.id) === button.dataset.id);
  if (!row) return;
  const next = button.dataset.state;
  const code = prompt(`${next} · Remito ${row.remito}\n\nIngresá el código de personal:`)?.trim();
  if (!code) return;
  let observation = row.observacion || "";
  if (next === "DIFERENCIAS") {
    const value = prompt("Detallá las diferencias:", observation);
    if (value === null) return;
    observation = value.trim();
  }
  button.classList.add("is-busy");
  const patch = { estado: next, observacion: observation, updated_at: new Date().toISOString() };
  if (next === "RECIBIDO EN SARMIENTO") patch.cod_recibe_sarmiento = code;
  if (next === "ENVIADO A DESTINO") patch.cod_envia_sarmiento = code;
  if (next === "RECIBIDO EN SUCURSAL") patch.cod_recibe_sucursal = code;
  if (["CONFIRMADO OK", "DIFERENCIAS"].includes(next)) Object.assign(patch, { cod_cierre: code, tipo_cierre: next });
  const { data, error } = await supabase.from("transito_v2_remitos").update(patch).eq("id", row.id).select().single();
  button.classList.remove("is-busy");
  if (error) return alert(`No se pudo actualizar: ${error.message}`);
  state.rows = state.rows.map(item => item.id === data.id ? data : item);
  render();
  el.status.textContent = "";
}

function openPdf(row) {
  const fileId = String(row.file_id || "").trim();
  if (!fileId) {
    alert("Este remito no tiene archivo PDF asociado.");
    return;
  }
  el.pdfTitle.textContent = `Visualizar remito ${row.remito || ""}`;
  el.pdfFrame.src = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  el.modalPdf.classList.remove("hidden");
}

function closePdf() {
  el.modalPdf.classList.add("hidden");
  el.pdfFrame.src = "";
}

function sortRows(a, b) {
  const priority = row => {
    const status = canon(row.estado);
    if (status === "RECIBIDO EN SUCURSAL") return 0;
    if (status === "DIFERENCIAS") return 1;
    if (status === "ENVIADO A DESTINO") return 2;
    if (status === "RECIBIDO EN SARMIENTO") return 3;
    return 4;
  };
  return priority(a) - priority(b) || String(b.remito).localeCompare(String(a.remito), "es", { numeric: true });
}

function visible(r) {
  const branch = canon(state.sucursal), from = canon(r.desde), to = canon(r.hacia), status = canon(r.estado);
  if (status === "CONFIRMADO OK" || (branch === SARMIENTO && from === DEPOSITO)) return false;
  if (!needsSarmiento(from, to)) return branch === to;
  if (branch === SARMIENTO) return ["", "ENVIADO A SUCURSAL", "RECIBIDO EN SARMIENTO"].includes(status);
  return branch === to && ["ENVIADO A DESTINO", "RECIBIDO EN SUCURSAL", "DIFERENCIAS"].includes(status);
}
function matchesSearch(r) { return !state.search || canon([r.remito,r.desde,r.hacia,r.estado,r.observacion].join(" ")).includes(state.search); }
function resolveStage(r) {
  const branch=canon(state.sucursal), to=canon(r.hacia), status=canon(r.estado), via=needsSarmiento(r.desde,r.hacia);
  if (!via) {
    if (["", "ENVIADO A SUCURSAL"].includes(status)) return {label:"Esperando recepción en sucursal",action:"estado",button:"RECIBIDO EN SUCURSAL",next:"RECIBIDO EN SUCURSAL"};
    if (["RECIBIDO", "RECIBIDO EN SUCURSAL"].includes(status)) return {label:"Recibido en sucursal",action:"final"};
  } else if (branch === SARMIENTO) {
    if (["", "ENVIADO A SUCURSAL"].includes(status)) return {label:"En tránsito hacia SARMIENTO",action:"estado",button:"RECIBIDO EN SARMIENTO",next:"RECIBIDO EN SARMIENTO"};
    if (status === "RECIBIDO EN SARMIENTO") return {label:`Listo para enviar a ${to}`,action:"estado",button:`ENVIADO A ${to}`,next:"ENVIADO A DESTINO"};
  } else if (branch === to) {
    if (status === "ENVIADO A DESTINO") return {label:"En tránsito hacia sucursal final",action:"estado",button:"RECIBIDO EN SUCURSAL",next:"RECIBIDO EN SUCURSAL"};
    if (["RECIBIDO", "RECIBIDO EN SUCURSAL"].includes(status)) return {label:"Recibido en sucursal",action:"final"};
  }
  if (status === "DIFERENCIAS") return {label:"Diferencias cargadas",action:"differences"};
  return {label:status || "Pendiente",action:null};
}
function needsSarmiento(from,to){from=canon(from);to=canon(to);if(SIEMPRE_SARMIENTO.includes(from)||SIEMPRE_SARMIENTO.includes(to))return true;return (GRUPO_1.includes(from)&&GRUPO_2.includes(to))||(GRUPO_2.includes(from)&&GRUPO_1.includes(to));}
function canon(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();}
function formatDate(value){if(!value)return "-";const [y,m,d]=value.split("-");return `${d}/${m}/${y}`;}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);}

async function loadPickingEquivalences() {
  state.picking.byCode.clear();
  state.picking.loaded = false;
  const results = await Promise.allSettled(CSV_FILES.map(async file => {
    const response = await fetch(file, { cache: "no-store" });
    if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
    const rows = parseCSV(await response.text());
    indexPickingRows(rows);
    return rows.length;
  }));
  const loaded = results.filter(result => result.status === "fulfilled").length;
  state.picking.loaded = loaded > 0;
  state.picking.error = loaded === CSV_FILES.length ? "" : loaded ? "Se cargaron equivalencias parciales." : "No se pudieron cargar las equivalencias.";
}

function openPicking(remito) {
  state.picking.remito = remito;
  state.picking.scans = [];
  state.picking.seq = 0;
  clearTimeout(state.picking.timer);
  el.pickingRemito.value = remito.remito || "";
  el.pickingSucursal.value = canon(state.sucursal || remito.hacia);
  el.pickingCodigo.value = "";
  el.pickingScan.value = "";
  el.modalPicking.classList.remove("hidden");
  renderPicking();
  notePicking(state.picking.loaded ? (state.picking.error || "Listo para pickear.") : "Cargando equivalencias...");
  setTimeout(() => el.pickingScan.focus(), 0);
}

function closePicking() {
  el.modalPicking.classList.add("hidden");
  clearTimeout(state.picking.timer);
  state.picking.remito = null;
  state.picking.scans = [];
}

function scheduleScan() {
  clearTimeout(state.picking.timer);
  state.picking.timer = setTimeout(() => {
    if (String(el.pickingScan.value || "").trim().length >= 3) commitScan();
  }, PICKING_IDLE_MS);
}

function commitScan() {
  clearTimeout(state.picking.timer);
  const code = String(el.pickingScan.value || "").trim();
  el.pickingScan.value = "";
  el.pickingScan.focus();
  if (!code) return;
  if (!state.picking.loaded) {
    flashPicking("err"); beep(false); notePicking(state.picking.error || "Las equivalencias todavía no están disponibles."); return;
  }
  const ok = state.picking.byCode.has(normalizeBarcode(code));
  state.picking.scans.unshift({ id: ++state.picking.seq, code, ok });
  if (state.picking.scans.length > MAX_SCANS) state.picking.scans.length = MAX_SCANS;
  flashPicking(ok ? "ok" : "err");
  beep(ok);
  notePicking(ok ? `OK: ${code}` : `Sin equivalencia: ${code}`);
  renderPicking();
}

function renderPicking() {
  el.pickingCount.textContent = `${state.picking.scans.length} escaneados`;
  el.pickingLast.innerHTML = state.picking.scans.slice(0, 10).map(scan => `<span class="${scan.ok ? "ok" : "err"}">${scan.ok ? "✓" : "✕"} ${escapeHtml(scan.code)}</span>`).join(" · ");
  el.pickingList.innerHTML = state.picking.scans.length ? state.picking.scans.map(scan => `
    <div class="pick-row"><span class="pick-badge ${scan.ok ? "ok" : "err"}">${scan.ok ? "✓" : "✕"}</span><span class="pick-code">${escapeHtml(scan.code)}</span><button class="pick-del" type="button" data-delete-scan="${scan.id}">Eliminar</button></div>`).join("") : '<div style="padding:12px" class="muted">Sin escaneos.</div>';
  const counts = new Map();
  state.picking.scans.forEach(scan => {
    const row = state.picking.byCode.get(normalizeBarcode(scan.code));
    const article = row ? getField(row, ["articulo", "artículo"]) || scan.code : scan.code;
    const color = row ? getField(row, ["descripcion", "descripción", "color"]) : "";
    const size = row ? getField(row, ["descripcion_2", "descripción_2", "talle", "tamano", "tamaño"]) : "";
    const label = [article, color, size].filter(Boolean).join(" · ");
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  el.pickingCounter.innerHTML = counts.size ? [...counts.entries()].sort((a,b) => b[1]-a[1]).map(([label,total]) => `<div class="art-variant"><div>${escapeHtml(label)}</div><div><small>x</small> ${total}</div></div>`).join("") : '<div class="muted">Sin escaneos.</div>';
}

function resetPicking() {
  state.picking.scans = [];
  state.picking.seq = 0;
  el.pickingScan.value = "";
  renderPicking();
  notePicking("Escaneo limpio. Listo para pickear.");
  el.pickingScan.focus();
}

async function savePicking() {
  const remito = state.picking.remito;
  const personalCode = String(el.pickingCodigo.value || "").trim();
  if (!remito) return alert("No hay remito seleccionado.");
  if (!personalCode) { alert("Ingresá el código de quien realiza el picking."); el.pickingCodigo.focus(); return; }
  if (!state.picking.scans.length) { alert("Todavía no hay mercadería pickeada."); el.pickingScan.focus(); return; }
  const content = state.picking.scans.slice().reverse().map(scan => scan.code).join("\n");
  const folderName = canon(state.sucursal || remito.hacia);
  const fileName = pickingFilename(remito.remito, folderName, personalCode);
  el.downloadPicking.disabled = true;
  el.downloadPicking.textContent = "Guardando...";
  downloadTxt(fileName, content);
  try {
    const response = await fetch(SCRIPT_URL_PICKING_TRANSITO, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: "guardar_txt_transito_picking", content, fileName, folderName, backupRootFolderId: BACKUP_ROOT_FOLDER_ID, remito: remito.remito, sucursal: folderName, origen: remito.desde || "", destino: remito.hacia || "", codigoPersonal: personalCode, totalEscaneados: state.picking.scans.length, fechaGeneracionIso: new Date().toISOString() })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    notePicking(`TXT descargado y copia guardada en Drive: ${fileName}`);
  } catch (error) {
    notePicking(`TXT descargado, pero falló la copia en Drive: ${error.message}`);
  } finally {
    el.downloadPicking.disabled = false;
    el.downloadPicking.textContent = "Descargar TXT y guardar copia";
  }
}

function pickingFilename(remito, branch, code) {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
  return `${date} REM${remito} ${branch} PICKING RESP${code}.txt`.replace(/[\\/:*?"<>|]+/g, "_");
}

function downloadTxt(fileName, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function notePicking(message) { el.pickingNote.textContent = message || ""; }
function flashPicking(kind) { el.pickingScan.classList.remove("ok", "err"); void el.pickingScan.offsetWidth; el.pickingScan.classList.add(kind); setTimeout(() => el.pickingScan.classList.remove(kind), 220); }
function ensureAudio() { try { state.picking.audio ||= new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
function beep(ok) {
  const audio = state.picking.audio; if (!audio) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = ok ? "sine" : "square"; oscillator.frequency.value = ok ? 880 : 220; gain.gain.value = 0.0001;
  oscillator.connect(gain).connect(audio.destination); oscillator.start(); gain.gain.exponentialRampToValueAtTime(0.22, audio.currentTime + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18); oscillator.stop(audio.currentTime + 0.21);
}

function indexPickingRows(rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const codeKey = findKey(keys, ["codigo_barras", "codigo", "código", "barcode", "ean", "lectura", "scan"]) || keys[0];
  rows.forEach(row => { const key = normalizeBarcode(row[codeKey]); if (key && !state.picking.byCode.has(key)) state.picking.byCode.set(key, row); });
}
function getField(row, candidates) { const key = findKey(Object.keys(row), candidates); return key ? String(row[key] ?? "").trim() : ""; }
function findKey(keys, candidates) { const wanted = candidates.map(normalizeKey); return keys.find(key => wanted.includes(normalizeKey(key))) || keys.find(key => wanted.some(item => normalizeKey(key).includes(item))); }
function normalizeKey(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ""); }
function normalizeBarcode(value) { return String(value || "").trim().toUpperCase(); }
function parseCSV(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const delimiter = [";", ",", "|", "\t"].sort((a,b) => lines[0].split(b).length-lines[0].split(a).length)[0];
  const headers = splitCSV(lines[0], delimiter).map(value => value.trim());
  return lines.slice(1).map(line => { const cells = splitCSV(line, delimiter), row = {}; headers.forEach((header,index) => row[header || `COL_${index}`] = String(cells[index] ?? "").trim()); return row; });
}
function splitCSV(line, delimiter) {
  const cells = []; let value = "", quoted = false;
  for (let index=0; index<line.length; index++) { const char=line[index], next=line[index+1]; if (char==='"') { if (quoted && next==='"') { value+='"'; index++; } else quoted=!quoted; } else if (char===delimiter && !quoted) { cells.push(value); value=""; } else value+=char; }
  cells.push(value); return cells;
}
