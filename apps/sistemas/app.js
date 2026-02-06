;(() => {
  "use strict";

  // === CONFIG ===
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDTljuh7QRY7xkMDp_Lq_t-R6LYYeQOOq8-QMW4Fer8ReOXk8Zi76V1SeHS2PDVgX8GQ/exec";
  const LS_TOKEN = "rio_asistencia_token_v1"; 


  const $ = (s, r=document) => r.querySelector(s);

  const el = {
    tokenInput: $("#tokenInput"),
    saveTokenBtn: $("#saveTokenBtn"),
    refreshBtn: $("#refreshBtn"),

    sucursalSel: $("#sucursalSel"),
    tipoSel: $("#tipoSel"),
    prioSel: $("#prioSel"),
    telInput: $("#telInput"),
    mailInput: $("#mailInput"),
    descInput: $("#descInput"),
    createBtn: $("#createBtn"),
    createMsg: $("#createMsg"),

    fEstado: $("#fEstado"),
    fSucursal: $("#fSucursal"),
    qInput: $("#qInput"),

    tableWrap: $("#tableWrap"),
    footInfo: $("#footInfo"),
  };

  function getToken(){
    return (localStorage.getItem(LS_TOKEN) || "RIO_TOOLS_2026_CAMBIAME").trim();
  }

  function setToken(t){
    localStorage.setItem(LS_TOKEN, String(t||"").trim());
  }

  function withParams(url, params){
    const u = new URL(url);
    Object.entries(params).forEach(([k,v]) => {
      if(v !== undefined && v !== null && String(v).length) u.searchParams.set(k, v);
    });
    return u.toString();
  }

  async function apiGet(params){
    const token = getToken();
    const url = withParams(SCRIPT_URL, { token, ...params });
    const r = await fetch(url, { cache:"no-store" });
    return await r.json();
  }

  async function apiPost(payload){
    const token = getToken();
    const url = withParams(SCRIPT_URL, { token });
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    return await r.json();
  }

  function estadoBadge(estado){
    const e = String(estado||"").trim();
    if(e === "Resuelto") return `<span class="badge ok">Resuelto</span>`;
    if(e === "Pendiente") return `<span class="badge danger">Pendiente</span>`;
    if(e === "En Curso") return `<span class="badge warn">En Curso</span>`;
    if(e === "Seguimiento") return `<span class="badge warn">Seguimiento</span>`;
    return `<span class="badge">${escapeHtml(e)}</span>`;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function renderTickets(list){
    if(!list.length){
      el.tableWrap.innerHTML = `<div class="muted">Sin tickets para mostrar.</div>`;
      el.footInfo.textContent = "";
      return;
    }

    const q = (el.qInput.value || "").trim().toLowerCase();

    const filtered = list.filter(t => {
      if(!q) return true;
      const blob = `${t.ticket} ${t.sucursal} ${t.tipo} ${t.prioridad} ${t.descripcion}`.toLowerCase();
      return blob.includes(q);
    });

    const rows = filtered.map(t => `
      <tr>
        <td><b>${escapeHtml(t.ticket)}</b><div class="muted small">${escapeHtml(String(t.fecha||""))}</div></td>
        <td>${escapeHtml(t.sucursal)}</td>
        <td>${escapeHtml(t.tipo)}<div class="muted small">${escapeHtml(t.prioridad)}</div></td>
        <td>${escapeHtml(t.descripcion)}</td>
        <td>${estadoBadge(t.estado)}</td>
        <td class="actions">
          ${t.wa ? `<a class="link" href="${escapeHtml(t.wa)}" target="_blank" rel="noopener">Abrir chat</a>` : `<span class="muted small">Sin WA</span>`}
          <a class="link" href="#" data-copy="${escapeHtml(t.ticket)}">Copiar ID</a>
        </td>
      </tr>
    `).join("");

    el.tableWrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Sucursal</th>
            <th>Tipo</th>
            <th>Descripción</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    el.footInfo.textContent = `${filtered.length} / ${list.length} tickets`;
    el.tableWrap.querySelectorAll("[data-copy]").forEach(a => {
      a.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const v = a.getAttribute("data-copy") || "";
        try{ await navigator.clipboard.writeText(v); }catch{}
      });
    });
  }

  async function cargarSucursales(){
    const res = await apiGet({ accion:"sucursales" });
    if(!res.ok) throw new Error(res.message || "Error sucursales");
    const list = res.data || [];

    // Crear
    el.sucursalSel.innerHTML = list.map(x => `<option>${escapeHtml(x.sucursal)}</option>`).join("");
    // Filtro
    el.fSucursal.innerHTML = `<option value="">Todas</option>` + list.map(x => `<option>${escapeHtml(x.sucursal)}</option>`).join("");
  }

  async function cargarTickets(){
    const estado = el.fEstado.value || "";
    const sucursal = el.fSucursal.value || "";
    const res = await apiGet({ accion:"tickets", estado, sucursal, limit:"120" });
    if(!res.ok) throw new Error(res.message || "Error tickets");
    renderTickets(res.data || []);
  }

  async function crearTicket(){
    el.createMsg.textContent = "Creando…";
    const payload = {
      accion:"crear_ticket",
      sucursal: el.sucursalSel.value,
      tipo: el.tipoSel.value,
      prioridad: el.prioSel.value,
      descripcion: el.descInput.value,
      tel: el.telInput.value,
      email: el.mailInput.value
    };
    const res = await apiPost(payload);
    if(!res.ok) throw new Error(res.message || "No se pudo crear");

    const data = res.data || {};
    el.createMsg.textContent = `OK: ${data.ticketId || ""}`;
    el.descInput.value = "";
    await cargarTickets();
  }

  function bind(){
    // token
    el.tokenInput.value = getToken();
    el.saveTokenBtn.addEventListener("click", () => {
      setToken(el.tokenInput.value);
    });

    // filtros
    el.refreshBtn.addEventListener("click", cargarTickets);
    el.fEstado.addEventListener("change", cargarTickets);
    el.fSucursal.addEventListener("change", cargarTickets);
    el.qInput.addEventListener("input", () => cargarTickets());

    // crear
    el.createBtn.addEventListener("click", async () => {
      try{ await crearTicket(); }
      catch(e){ el.createMsg.textContent = `Error: ${e.message || e}`; }
    });
  }

  async function init(){
    bind();
    try{
      await cargarSucursales();
      await cargarTickets();
    }catch(e){
      el.tableWrap.innerHTML = `<div class="muted">Error: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
