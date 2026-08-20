;(() => {
  "use strict";
  const API_URL = window.CLIENTES_CONTACTAR_API_URL || "";
  const STATUSES = {
    pendiente: "Pendiente", contactado: "Contactado", no_responde: "No responde",
    ya_no_vende: "Ya no vende", bloqueado: "Me bloqueó", no_contactar: "No contactar"
  };
  const TERMINAL = new Set(["no_responde", "ya_no_vende", "bloqueado", "no_contactar"]);
  const $ = (id) => document.getElementById(id);
  const el = Object.fromEntries(["accessGate","accessForm","accessPassword","accessError","protectedContent","refreshBtn","logoutBtn","todayCount","pendingCount","contactedCount","discardedCount","viewFilter","statusFilter","searchInput","apiBadge","statusText","listTitle","listSubtitle","visibleCount","clientList","emptyDetail","detailForm","detailName","detailMeta","detailPurchase","detailDays","detailAlert","detailContact","detailStatus","detailNote","reactivateBtn","saveStatus","eventList"].map((id) => [id, $(id)]));
  const state = { token: sessionStorage.getItem("rio_clientes_contactar_token") || "", data: { clients: {}, dailyRuns: [], events: [] }, selectedId: "" };

  init();
  function init() {
    fillStatuses(); bind();
    if (state.token) unlockAndLoad();
  }
  function bind() {
    el.accessForm.addEventListener("submit", login);
    el.refreshBtn.addEventListener("click", loadState);
    el.logoutBtn.addEventListener("click", logout);
    el.viewFilter.addEventListener("change", render);
    el.statusFilter.addEventListener("change", render);
    el.searchInput.addEventListener("input", render);
    el.clientList.addEventListener("click", (event) => { const row = event.target.closest("[data-client-id]"); if (row) selectClient(row.dataset.clientId); });
    el.detailForm.addEventListener("submit", saveClient);
    el.reactivateBtn.addEventListener("click", () => { el.detailStatus.value = "pendiente"; saveClient(new Event("submit")); });
  }
  function fillStatuses() {
    for (const [value, label] of Object.entries(STATUSES)) {
      el.statusFilter.add(new Option(label, value)); el.detailStatus.add(new Option(label, value));
    }
  }
  async function login(event) {
    event.preventDefault(); el.accessError.textContent = "Validando...";
    try {
      const passwordHash = await sha256(el.accessPassword.value);
      const response = await api("login", { passwordHash }, false);
      state.token = response.token; sessionStorage.setItem("rio_clientes_contactar_token", state.token);
      el.accessPassword.value = ""; el.accessError.textContent = ""; await unlockAndLoad();
    } catch (error) { el.accessError.textContent = error.message; }
  }
  async function unlockAndLoad() { el.accessGate.hidden = true; el.protectedContent.hidden = false; await loadState(); }
  function logout() { state.token = ""; sessionStorage.removeItem("rio_clientes_contactar_token"); el.protectedContent.hidden = true; el.accessGate.hidden = false; el.accessPassword.focus(); }
  async function loadState() {
    setStatus("loading", "Actualizando seguimiento...");
    try {
      const response = await api("getState"); state.data = response.state || { clients: {}, dailyRuns: [], events: [] };
      setStatus("ok", `Actualizado ${formatDateTime(state.data.updatedAt)}`); render();
    } catch (error) { if (/sesion|token|autoriz/i.test(error.message)) logout(); setStatus("error", error.message); }
  }
  function render() {
    const clients = Object.values(state.data.clients || {}); const now = Date.now();
    const todayRun = [...(state.data.dailyRuns || [])].reverse().find((run) => run.date === localDate());
    const todayIds = new Set(todayRun?.alertClientIds || []);
    el.todayCount.textContent = todayIds.size;
    el.pendingCount.textContent = clients.filter((c) => c.activeCandidate && !TERMINAL.has(c.status) && c.status !== "contactado").length;
    el.contactedCount.textContent = clients.filter((c) => c.lastContactAt && now - new Date(c.lastContactAt).getTime() < 7 * 86400000).length;
    el.discardedCount.textContent = clients.filter((c) => TERMINAL.has(c.status)).length;
    const query = normalize(el.searchInput.value), status = el.statusFilter.value, view = el.viewFilter.value;
    const visible = clients.filter((c) => {
      if (status && c.status !== status) return false;
      if (query && !normalize(`${c.nombre} ${c.clienteId} ${c.telefono}`).includes(query)) return false;
      if (view === "today") return todayIds.has(c.clienteId);
      if (view === "active") return c.activeCandidate && !TERMINAL.has(c.status);
      if (view === "contacted") return c.status === "contactado";
      if (view === "discarded") return TERMINAL.has(c.status);
      return true;
    }).sort((a,b) => String(b.lastAlertAt||"").localeCompare(String(a.lastAlertAt||"")) || String(a.nombre).localeCompare(String(b.nombre),"es"));
    const titles = { today:["Enviados hoy","Clientes incluidos en el aviso diario."], active:["Seguimiento activo","Pendientes y contactos todavía vigentes."], contacted:["Contactados","Mensajes detectados desde WhatsApp."], discarded:["Descartados","No volverán a generar alertas hasta reactivarlos."], all:["Todos los clientes","Historial completo del seguimiento."] };
    [el.listTitle.textContent, el.listSubtitle.textContent] = titles[view]; el.visibleCount.textContent = visible.length;
    el.clientList.innerHTML = visible.length ? visible.map(clientRow).join("") : '<div class="empty-state">No hay clientes para esta vista.</div>';
    if (state.selectedId && state.data.clients[state.selectedId]) renderDetail();
  }
  function clientRow(client) {
    return `<button type="button" class="client-row ${state.selectedId===client.clienteId?"active":""}" data-client-id="${escapeHtml(client.clienteId)}"><span class="client-identity"><strong>${escapeHtml(client.nombre)}</strong><span>${escapeHtml(client.clienteId)} · ${escapeHtml(client.telefono)}</span></span><span class="client-cell"><span>Última compra</span>${formatDate(client.ultimaCompra)}</span><span class="client-cell"><span>Sin compra</span>${Number(client.diasSinCompra||0)} días</span><span class="status-pill" data-status="${escapeHtml(client.status||"pendiente")}">${escapeHtml(STATUSES[client.status]||"Pendiente")}</span></button>`;
  }
  function selectClient(id) { state.selectedId = id; render(); renderDetail(); }
  function renderDetail() {
    const client = state.data.clients[state.selectedId]; if (!client) return;
    el.emptyDetail.hidden = true; el.detailForm.hidden = false; el.detailName.textContent = client.nombre; el.detailMeta.textContent = `${client.clienteId} · ${client.telefono}`;
    el.detailPurchase.textContent = `${formatDate(client.ultimaCompra)} · ${formatMoney(client.ultimaCompraMonto)}`; el.detailDays.textContent = `${client.diasSinCompra || 0} días`; el.detailAlert.textContent = formatDateTime(client.lastAlertAt); el.detailContact.textContent = formatDateTime(client.lastContactAt);
    el.detailStatus.value = client.status || "pendiente"; el.detailNote.value = client.note || ""; el.reactivateBtn.hidden = !TERMINAL.has(client.status); el.saveStatus.textContent = "";
    const events = (state.data.events || []).filter((event) => event.clienteId === client.clienteId).slice(-30).reverse();
    el.eventList.innerHTML = events.length ? events.map((e) => `<div class="event-item">${eventLabel(e)}<span>${formatDateTime(e.at)}</span></div>`).join("") : '<div class="empty-state">Sin movimientos registrados.</div>';
  }
  async function saveClient(event) {
    event.preventDefault(); if (!state.selectedId) return; el.saveStatus.textContent = "Guardando...";
    try {
      const response = await api("updateClient", { clienteId: state.selectedId, status: el.detailStatus.value, note: el.detailNote.value.trim() });
      state.data = response.state; el.saveStatus.textContent = "Cambios guardados."; render();
    } catch (error) { el.saveStatus.textContent = error.message; }
  }
  async function api(action, payload = {}, authenticated = true) {
    if (!API_URL) throw new Error("Falta publicar y configurar la API de seguimiento.");
    const response = await fetch(API_URL, { method:"POST", redirect:"follow", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({ action, ...(authenticated?{token:state.token}:{}), ...payload }) });
    const data = await response.json(); if (!data.ok) throw new Error(data.error || "La API respondió con error."); return data;
  }
  async function sha256(value) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b)=>b.toString(16).padStart(2,"0")).join(""); }
  function setStatus(kind,text){ el.apiBadge.dataset.state=kind; el.apiBadge.textContent=kind==="ok"?"Sincronizado":kind==="error"?"Error":"Actualizando"; el.statusText.textContent=text; }
  function localDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date())}
  function formatDate(v){if(!v)return "-";const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v)}
  function formatDateTime(v){if(!v)return "-";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat("es-AR",{dateStyle:"short",timeStyle:"short"}).format(d)}
  function formatMoney(v){return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(v||0))}
  function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
  function eventLabel(e){return ({alert_sent:"Aviso diario enviado",contacted:"Contacto detectado en WhatsApp",status_changed:`Estado actualizado a ${STATUSES[e.status]||e.status}`})[e.type]||e.type||"Movimiento"}
  function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
})();
