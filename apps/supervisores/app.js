/* app.js — SUPERVISORES · ASISTENCIA HOY (EVENTOS del día)
   - Lee: API_BASE?accion=eventos_hoy  => { ok:true, fecha:"YYYY-MM-DD", data:{ AV2:[...], NAZCA:[...], ... } }
   - Render: tablero por locales (grid sin slider) y lista de eventos por local
   - Soporta campos del sheet/API:
       vendedor_id, vendedor_nombre, tipo_evento, hora_declarada
     y también compatibilidad con:
       vendedor, tipo, hora
*/

;(() => {
  "use strict";

  // ================== CONFIG ==================
  const API_BASE =
    "https://script.google.com/macros/s/AKfycbxVFxV8M-nMBUD_HKIREvTYL1Ip_lv6QkqPItzIyU80wek_oOJxqt-qnF3yxyfyaiGH/exec";

  // Orden que pediste
  const LOCALES = [
    "AVELLANEDA", "WEB", "NAZCA", "LAMARCA", "SARMIENTO",
    "DEPOSITO", "CORRIENTES", "CASTELLI", "PUEYRREDON", "MORENO", "QUILMES"
  ];

  // Mapeo a lo que guarda reflejado en EVENTOS.columna "sucursal"
  const API_ALIAS = {
    "AVELLANEDA": "AV2",
    "WEB": "WEB",
    "NAZCA": "NAZCA",
    "LAMARCA": "LAMARCA",
    "SARMIENTO": "SARMIENTO",
    "DEPOSITO": "DEPOSITO",
    "CORRIENTES": "CORRIENTES",
    "CASTELLI": "CASTELLI",
    "PUEYRREDON": "PUEYRREDON",
    "MORENO": "MORENO",
    "QUILMES": "QUILMES",
  };

  // Auto refresh
  const AUTO_REFRESH_MS = 15000;

  // ================== DOM ==================
  const $ = (s, r = document) => r.querySelector(s);

  const el = {
    grid: $("#grid"),
    q: $("#q"),
    btnRefresh: $("#btnRefresh"),
    autoRefresh: $("#autoRefresh"),
    kpiFecha: $("#kpiFecha"),
    kpiLocales: $("#kpiLocales"),
    kpiEventos: $("#kpiEventos"),
    kpiMostrando: $("#kpiMostrando"),
    readyPill: $("#readyPill"),
    pillText: $("#pillText"),
  };

  // dataByLocal: Map<labelLocal, Array<EventoNormalizado>>
  let dataByLocal = new Map();
  let lastQuery = "";
  let timer = null;

  // ================== INIT ==================
  document.addEventListener("DOMContentLoaded", () => {
    el.kpiLocales.textContent = String(LOCALES.length);

    el.btnRefresh.addEventListener("click", () => cargarHoy(false));
    el.q.addEventListener("input", () => {
      lastQuery = el.q.value.trim();
      render();
    });

    el.autoRefresh.addEventListener("change", () => {
      if (el.autoRefresh.checked) startAuto();
      else stopAuto();
    });

    if (!API_BASE) {
      showPill("warn", "Falta API_BASE");
      renderConfigMissing();
      return;
    }

    cargarHoy(false);
    startAuto();
  });

  // ================== AUTO ==================
  function startAuto() {
    stopAuto();
    timer = setInterval(() => {
      if (el.autoRefresh.checked) cargarHoy(true);
    }, AUTO_REFRESH_MS);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // ================== UI HELPERS ==================
  function showPill(state, text) {
    el.readyPill.classList.remove("hidden", "ok", "warn", "danger");
    el.readyPill.classList.add(state);
    el.pillText.textContent = text;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m])
    );
  }

  function norm(s) {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .trim();
  }

  // ================== DATA FETCH ==================
  async function cargarHoy(silent = false) {
    if (!silent) showPill("warn", "Cargando…");

    const url = `${API_BASE}?accion=eventos_hoy`;

    const j = await fetch(url, { cache: "no-store" })
      .then(r => r.text())
      .then(t => {
        try { return JSON.parse(t); }
        catch { return { ok: false, message: "JSON inválido" }; }
      })
      .catch(() => ({ ok: false, message: "Error de red" }));

    dataByLocal = new Map();

    if (!j.ok) {
      showPill("danger", j.message || "Error");
      render();
      return;
    }

    const obj = j.data || {}; // { AV2:[...], NAZCA:[...], ... }

    // KPIs fecha
    const todayISOClient = new Date().toISOString().slice(0, 10);
    el.kpiFecha.textContent = (firstFecha(obj) || j.fecha || todayISOClient);

    // Armar mapa por local en el orden de tablero
    for (const label of LOCALES) {
      const apiLocal = API_ALIAS[label] || label;
      const arr = Array.isArray(obj[apiLocal]) ? obj[apiLocal] : [];
      const events = arr.map(normalizeEvent);
      dataByLocal.set(label, events);
    }

    showPill("ok", "Listo");
    render();
  }

  function firstFecha(obj) {
    for (const k of Object.keys(obj || {})) {
      const arr = obj[k];
      if (Array.isArray(arr) && arr.length) {
        const f = arr[0].fecha_operativa || arr[0].fecha || arr[0].fecha_operativa;
        if (f) return String(f);
      }
    }
    return "";
  }

  // Normaliza cualquier variante de payload
  function normalizeEvent(e) {
    const vendedor_id =
      String(e.vendedor_id ?? e.vendedorid ?? e.id ?? "").trim();

    const vendedor_nombre =
      String(e.vendedor_nombre ?? e.vendedorNom ?? e.vendedor_nom ?? e.vendedor ?? "").trim();

    const tipo_evento =
      String(e.tipo_evento ?? e.tipo_event ?? e.tipo ?? "").trim().toUpperCase();

    const hora_declarada =
      String(e.hora_declarada ?? e.hora_declar ?? e.hora_decl ?? e.hora ?? "").trim();

    return {
      vendedor_id,
      vendedor_nombre,
      tipo_evento,
      hora_declarada,

      // compat
      vendedor: vendedor_nombre,
      tipo: tipo_evento,
      hora: hora_declarada
    };
  }

  // ================== RENDER ==================
  function renderConfigMissing() {
    el.grid.innerHTML =
      `<div class="card"><div class="empty">Falta configurar <b>API_BASE</b> en app.js</div></div>`;
    el.kpiEventos.textContent = "0";
    el.kpiMostrando.textContent = "0";
  }

  function render() {
    let totalEventos = 0;
    let mostrando = 0;

    const q = lastQuery.trim();
    const frag = document.createDocumentFragment();

    for (const label of LOCALES) {
      const apiLocal = API_ALIAS[label] || label;
      let events = (dataByLocal.get(label) || []);

      totalEventos += events.length;

      if (q) {
        const qn = norm(q);
        events = events.filter(ev => {
          const hay = norm(
            `${ev.vendedor_id} ${ev.vendedor_nombre} ${ev.vendedor}`
          );
          return hay.includes(qn);
        });
      }
      mostrando += events.length;

      // ordenar por hora (string "13:35" o "8.15" etc)
      events = events.slice().sort((a, b) => String(a.hora_declarada || a.hora).localeCompare(String(b.hora_declarada || b.hora)));

      const card = document.createElement("article");
      card.className = "local-card";

      card.innerHTML = `
        <div class="local-head">
          <div>
            <div class="local-name">${escapeHtml(label)}</div>
            <div class="local-sub">API: ${escapeHtml(apiLocal)} · ${events.length} hoy</div>
          </div>
          <span class="badge">${events.length}</span>
        </div>

        <div class="local-body">
          ${
            events.length
              ? events.map(ev => renderEvent(ev)).join("")
              : `<div class="empty">Sin eventos hoy.</div>`
          }
        </div>
      `;

      frag.appendChild(card);
    }

    el.grid.innerHTML = "";
    el.grid.appendChild(frag);

    el.kpiEventos.textContent = String(totalEventos);
    el.kpiMostrando.textContent = String(mostrando);
  }

  function renderEvent(ev) {
    const idPart = ev.vendedor_id ? `${ev.vendedor_id} - ` : "";
    const nombre = ev.vendedor_nombre || ev.vendedor || "(sin nombre)";
    const tipo = ev.tipo_evento || ev.tipo || "EVENTO";
    const hora = ev.hora_declarada || ev.hora || "—";

    return `
      <div class="event">
        <div class="left">
          <div class="vendedor">${escapeHtml(idPart + nombre)}</div>
          <div class="tipo">${escapeHtml(tipo)}</div>
        </div>
        <div class="hora">${escapeHtml(hora)}</div>
      </div>
    `;
  }
})();
