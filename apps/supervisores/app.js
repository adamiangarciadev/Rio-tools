/* app.js — SUPERVISORES · ASISTENCIA HOY (EVENTOS del día)
   - Compatible con:
     A) Formato VIEJO: { ok:true, fecha:"YYYY-MM-DD", data:{ AV2:[...], NAZCA:[...], ... } }
     B) Formato NUEVO: { ok:true, fecha:"YYYY-MM-DD", items:[...], data:[...] }  (lista)
   - Render: tablero por locales (grid sin slider) y lista de eventos por local
   - ✅ Comprobantes: muestra 📎 y visor modal embebido.
*/

;(() => {
  "use strict";

  // ================== CONFIG ==================
  const API_BASE =
    "https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec";

  const LOCALES = [
    "AVELLANEDA", "WEB", "NAZCA", "LAMARCA", "SARMIENTO",
    "DEPOSITO", "CORRIENTES", "CASTELLI", "PUEYRREDON", "MORENO", "QUILMES"
  ];

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

    // ✅ Click delegado: abrir comprobante
    el.grid.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest(".file-btn") : null;
      if (!btn) return;
      const url = btn.getAttribute("data-file") || "";
      if (url) openComprobante(url);
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

  // ================== MODAL (visor comprobantes) ==================
  let modalMounted = false;

  function ensureModal() {
    if (modalMounted) return;
    modalMounted = true;

    const wrap = document.createElement("div");
    wrap.id = "fileModal";
    wrap.className = "modal hidden";
    wrap.innerHTML = `
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="Comprobante">
        <div class="modal-head">
          <div class="modal-title">Comprobante</div>
          <div class="modal-actions">
            <button type="button" class="modal-btn" id="modalOpenNew">Abrir en pestaña</button>
            <button type="button" class="modal-x" data-close="1" aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener("click", (ev) => {
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-close") === "1") {
        closeModal();
      }
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeModal();
    });
  }

  function openComprobante(url) {
    if (!url) return;
    ensureModal();

    const modal = document.getElementById("fileModal");
    const body = document.getElementById("modalBody");
    const btnNew = document.getElementById("modalOpenNew");

    btnNew.onclick = () => window.open(url, "_blank", "noopener,noreferrer");

    const u = String(url);
    const isImage = /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(u);
    const isPdf = /\.pdf(\?.*)?$/i.test(u) || u.includes("/preview");

    body.innerHTML = "";

    if (isImage) {
      const img = document.createElement("img");
      img.className = "modal-img";
      img.alt = "Comprobante";
      img.src = u;
      body.appendChild(img);
    } else {
      const iframe = document.createElement("iframe");
      iframe.className = "modal-frame";
      iframe.src = u;
      iframe.allow = "autoplay";
      body.appendChild(iframe);
    }

    modal.classList.remove("hidden");
  }

  function closeModal() {
    const modal = document.getElementById("fileModal");
    if (!modal) return;
    modal.classList.add("hidden");
    const body = document.getElementById("modalBody");
    if (body) body.innerHTML = "";
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

    // ✅ Soportar:
    // - viejo: j.data = { AV2:[...], ... }
    // - nuevo: j.items = [...] (o j.data = [...])
    const grouped = toGroupedBySucursal(j);

    const todayISOClient = new Date().toISOString().slice(0, 10);
    el.kpiFecha.textContent = (firstFecha(grouped) || j.fecha || todayISOClient);

    for (const label of LOCALES) {
      const apiLocal = API_ALIAS[label] || label;
      const arr = Array.isArray(grouped[apiLocal]) ? grouped[apiLocal] : [];
      const events = arr.map(normalizeEvent);
      dataByLocal.set(label, events);
    }

    showPill("ok", "Listo");
    render();
  }

  // Convierte cualquier payload a { SUCURSAL:[rows], ... }
  function toGroupedBySucursal(j) {
    // Caso viejo: data ya es objeto por sucursal
    if (j && j.data && !Array.isArray(j.data) && typeof j.data === "object") {
      return j.data;
    }

    // Caso nuevo: items[] o data[] (lista)
    const list =
      (Array.isArray(j?.items) ? j.items :
      (Array.isArray(j?.data) ? j.data : [])) || [];

    const out = {};
    for (const row of list) {
      const suc = String(
        row?.sucursal ??
        row?.local ??
        row?.suc ??
        row?.branch ??
        ""
      ).trim().toUpperCase();

      if (!suc) continue;
      if (!out[suc]) out[suc] = [];
      out[suc].push(row);
    }
    return out;
  }

  function firstFecha(groupedObj) {
    for (const k of Object.keys(groupedObj || {})) {
      const arr = groupedObj[k];
      if (Array.isArray(arr) && arr.length) {
        const f = arr[0].fecha_operativa || arr[0].fecha;
        if (f) return String(f);
      }
    }
    return "";
  }

  function resolveComprobanteUrl(urlRaw, driveId) {
    const u = String(urlRaw || "").trim();
    const id = String(driveId || "").trim();
    if (u) return u;
    if (id) return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
    return "";
  }

  function normalizeEvent(e) {
    const vendedor_id =
      String(e.vendedor_id ?? e.vendedorid ?? e.id ?? "").trim();

    const vendedor_nombre =
      String(e.vendedor_nombre ?? e.vendedorNom ?? e.vendedor_nom ?? e.vendedor ?? e.nombre ?? "").trim();

    const tipo_evento =
      String(e.tipo_evento ?? e.tipo_event ?? e.tipo ?? "").trim().toUpperCase();

    const hora_declarada =
      String(e.hora_declarada ?? e.hora_declar ?? e.hora_decl ?? e.hora ?? "").trim();

    const comprobante_url_raw =
      String(
        e.comprobante_url ??
        e.comprobanteUrl ??
        e.comprobante ??
        e.archivo_url ??
        e.file_url ??
        e.url_archivo ??
        e.url ??
        ""
      ).trim();

    const comprobante_drive_id =
      String(
        e.comprobante_file_id ??
        e.comprobante_drive_id ??
        e.comprobanteDriveId ??
        e.drive_id ??
        e.file_id ??
        e.fileId ??
        e.comprobante_drive_id ??
        ""
      ).trim();

    const comprobante_url = resolveComprobanteUrl(comprobante_url_raw, comprobante_drive_id);

    return {
      vendedor_id,
      vendedor_nombre,
      tipo_evento,
      hora_declarada,
      comprobante_url,

      vendedor: vendedor_nombre,
      tipo: tipo_evento,
      hora: hora_declarada,
      obs: String(e.observacion ?? e.obs ?? "").trim()
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
          const hay = norm(`${ev.vendedor_id} ${ev.vendedor_nombre} ${ev.vendedor}`);
          return hay.includes(qn);
        });
      }
      mostrando += events.length;

      events = events.slice().sort((a, b) =>
        String(a.hora_declarada || a.hora).localeCompare(String(b.hora_declarada || b.hora))
      );

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

    const hasFile = !!(ev.comprobante_url && String(ev.comprobante_url).trim());
    const fileBtn = hasFile
      ? `<button class="file-btn" type="button" data-file="${escapeHtml(ev.comprobante_url)}" title="Ver comprobante" aria-label="Ver comprobante">📎</button>`
      : `<span class="file-spacer"></span>`;

    return `
      <div class="event">
        <div class="left">
          <div class="vendedor">${escapeHtml(idPart + nombre)}</div>
          <div class="tipo">${escapeHtml(tipo)}</div>
        </div>

        <div class="right">
          ${fileBtn}
          <div class="hora">${escapeHtml(hora)}</div>
        </div>
      </div>
    `;
  }
})();
