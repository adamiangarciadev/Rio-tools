(() => {
  "use strict";

  const API_URL = String(window.RIO_INCIDENTES_API_URL || "").trim();
  const STORE_KEY = "rio_incidentes_v1";
  const BRANCH_KEY = "rio_sucursal";
  const BRANCH_ALIASES = [BRANCH_KEY, "asistencia_sucursal_v1", "rio_remitos_sucursal", "rio_sucursal_web", "rio_deposito_local", "mercaderia_transito_sucursal", "sucursal"];
  const BRANCHES = ["AV2", "NAZCA", "LAMARCA", "CORRIENTES", "CASTELLI", "QUILMES", "SARMIENTO", "DEPÓSITO", "PUEYRREDÓN", "WEB", "ADMINISTRACIÓN"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 6;
  let tickets = [];
  let selectedFiles = [];
  let mode = "general";
  let equivalences = [];
  let labelItems = [];
  let toastTimer;

  const $ = (selector) => document.querySelector(selector);
  const els = {
    form: $("#incidentForm"), branch: $("#branch"), reporter: $("#reporterCode"), area: $("#area"),
    priority: $("#priority"), title: $("#title"), description: $("#description"), files: $("#attachments"),
    fileList: $("#attachmentList"), dropZone: $("#dropZone"), message: $("#formMessage"), submit: $("#submitTicket"),
    search: $("#search"), status: $("#statusFilter"), areaFilter: $("#areaFilter"), list: $("#ticketList"), empty: $("#emptyState"),
    dialog: $("#detailDialog"), detail: $("#detailContent"), badge: $("#connectionBadge")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    fillBranches();
    bindEvents();
    updateCounters();
    setMode("general");
    loadEquivalences();
    await loadTickets();
  }

  function fillBranches() {
    els.branch.innerHTML = '<option value="">Seleccionar sucursal</option>' + BRANCHES.map(x => `<option>${x}</option>`).join("");
    const saved = BRANCH_ALIASES.map(key => localStorage.getItem(key)).find(Boolean) || "";
    const normalized = normalizeBranch(saved);
    if (normalized && !BRANCHES.includes(normalized)) els.branch.add(new Option(normalized, normalized));
    els.branch.value = normalized;
  }

  function normalizeBranch(value) {
    const clean = String(value || "").trim().toUpperCase();
    const aliases = { AVELLANEDA: "AV2", "AVELLANEDA 2": "AV2", DEPOSITO: "DEPÓSITO", PUEYRREDON: "PUEYRREDÓN", ADMINISTRACION: "ADMINISTRACIÓN" };
    return aliases[clean] || clean;
  }

  function bindEvents() {
    els.form.addEventListener("submit", submitIncident);
    els.branch.addEventListener("change", saveBranch);
    $("#newTicketTop").addEventListener("click", () => $("#formPanel").scrollIntoView({ behavior: "smooth" }));
    $("#clearForm").addEventListener("click", resetForm);
    $("#refreshTickets").addEventListener("click", loadTickets);
    $("#closeDetail").addEventListener("click", () => els.dialog.close());
    els.dialog.addEventListener("click", event => { if (event.target === els.dialog) els.dialog.close(); });
    [els.search, els.status, els.areaFilter].forEach(node => node.addEventListener("input", renderTickets));
    els.title.addEventListener("input", updateCounters);
    els.description.addEventListener("input", updateCounters);
    els.files.addEventListener("change", event => addFiles(event.target.files));
    ["dragenter", "dragover"].forEach(name => els.dropZone.addEventListener(name, event => { event.preventDefault(); els.dropZone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(name => els.dropZone.addEventListener(name, event => { event.preventDefault(); els.dropZone.classList.remove("dragging"); }));
    els.dropZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
    document.querySelectorAll(".quick-action").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
    $("#labelBajas").addEventListener("input", updateBajasCount);
    $("#labelArticleSearch").addEventListener("input", () => fillArticleSelect("label"));
    $("#negativeArticleSearch").addEventListener("input", () => fillArticleSelect("negative"));
    ["label", "negative"].forEach(prefix => {
      $(`#${prefix}Article`).addEventListener("change", () => fillColors(prefix));
      $(`#${prefix}Color`).addEventListener("change", () => fillSizes(prefix));
      $(`#${prefix}Size`).addEventListener("change", () => { if (prefix === "negative") updateNegativeMatch(); });
    });
    $("#addLabelItem").addEventListener("click", addLabelItem);
  }

  function setMode(nextMode) {
    mode = nextMode;
    document.querySelectorAll(".quick-action").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    $("#generalFields").hidden = mode !== "general";
    $("#labelsWorkflow").hidden = mode !== "labels";
    $("#negativeWorkflow").hidden = mode !== "negative";
    $("#generalFields").querySelectorAll("input,select,textarea").forEach(node => node.disabled = mode !== "general");
    updateSubmitLabel();
    clearMessage();
  }

  function updateSubmitLabel() {
    els.submit.textContent = mode === "labels" ? "Crear pedido de etiquetas" : mode === "negative" ? "Informar stock negativo" : "Crear incidente";
  }

  async function loadEquivalences() {
    const status = $("#equivalenceStatus");
    try {
      const results = await Promise.allSettled(["../../data/equivalencia.csv", "../../data/equivalencia2.csv"].map(path => fetch(path).then(response => {
        if (!response.ok) throw new Error(path);
        return response.text();
      }).then(parseEquivalences)));
      const unique = new Map();
      results.filter(x => x.status === "fulfilled").flatMap(x => x.value).forEach(row => unique.set(`${row.code}|${row.article}|${row.color}|${row.size}`, row));
      equivalences = [...unique.values()];
      if (!equivalences.length) throw new Error("No hay datos");
      status.textContent = `${equivalences.length.toLocaleString("es-AR")} combinaciones cargadas y listas para validar.`;
      status.className = "equivalence-status ok";
      fillArticleSelect("label"); fillArticleSelect("negative");
    } catch {
      status.textContent = "No se pudieron cargar las equivalencias. Abrí la app desde el servidor de RIO Tools.";
      status.className = "equivalence-status error";
      $("#negativeMatch").textContent = "Equivalencias no disponibles.";
    }
  }

  function parseEquivalences(text) {
    return String(text).split(/\r?\n/).slice(1).filter(Boolean).map(line => {
      const cols = line.split(";").map(value => value.replace(/^"|"$/g, "").trim());
      return { code: cols[0], article: cols[1], color: cols[2], size: cols[3] };
    }).filter(row => row.code && row.article && row.color && row.size);
  }

  function fillArticleSelect(prefix) {
    const search = normalizeText($(`#${prefix}ArticleSearch`).value);
    const select = $(`#${prefix}Article`);
    const current = select.value;
    const articles = [...new Set(equivalences.map(row => row.article))].filter(article => !search || normalizeText(article).includes(search)).sort(naturalSort);
    select.innerHTML = '<option value="">Seleccionar artículo</option>' + articles.slice(0, 800).map(value => `<option>${escapeHtml(value)}</option>`).join("");
    if (articles.includes(current)) select.value = current;
    fillColors(prefix);
  }

  function fillColors(prefix) {
    const article = $(`#${prefix}Article`).value;
    const select = $(`#${prefix}Color`);
    const colors = [...new Set(equivalences.filter(row => row.article === article).map(row => row.color))].sort(naturalSort);
    select.innerHTML = '<option value="">Seleccionar color</option>' + colors.map(value => `<option>${escapeHtml(value)}</option>`).join("");
    select.disabled = !article;
    fillSizes(prefix);
  }

  function fillSizes(prefix) {
    const article = $(`#${prefix}Article`).value;
    const color = $(`#${prefix}Color`).value;
    const select = $(`#${prefix}Size`);
    const sizes = [...new Set(equivalences.filter(row => row.article === article && row.color === color).map(row => row.size))].sort(naturalSort);
    select.innerHTML = '<option value="">Seleccionar talle</option>' + sizes.map(value => `<option>${escapeHtml(value)}</option>`).join("");
    select.disabled = !color;
    if (prefix === "negative") updateNegativeMatch();
  }

  function findVariant(prefix) {
    const article = $(`#${prefix}Article`).value, color = $(`#${prefix}Color`).value, size = $(`#${prefix}Size`).value;
    return equivalences.find(row => row.article === article && row.color === color && row.size === size);
  }

  function addLabelItem() {
    const variant = findVariant("label");
    const quantity = Math.max(1, Number($("#labelQuantity").value) || 1);
    if (!variant) return showToast("Elegí artículo, color y talle.");
    const existing = labelItems.find(item => item.code === variant.code);
    if (existing) existing.quantity += quantity; else labelItems.push({ ...variant, quantity });
    renderLabelItems();
  }

  function renderLabelItems() {
    const container = $("#labelItems");
    container.innerHTML = "";
    labelItems.forEach((item, index) => {
      const row = document.createElement("div"); row.className = "workflow-item";
      row.innerHTML = `<div><strong>${escapeHtml(item.article)} · ${escapeHtml(item.color)} · T. ${escapeHtml(item.size)}</strong><small>Código: ${escapeHtml(item.code)}</small></div><b>× ${item.quantity}</b><button type="button" aria-label="Quitar">×</button>`;
      row.querySelector("button").addEventListener("click", () => { labelItems.splice(index, 1); renderLabelItems(); });
      container.appendChild(row);
    });
  }

  function parseCodes(raw) { return [...new Set(String(raw || "").split(/[\n,;\t ]+/).map(x => x.trim()).filter(Boolean))]; }
  function updateBajasCount() { const count = parseCodes($("#labelBajas").value).length; $("#labelBajasCount").textContent = `${count} código${count === 1 ? "" : "s"} único${count === 1 ? "" : "s"} detectado${count === 1 ? "" : "s"}`; }
  function updateNegativeMatch() {
    const match = findVariant("negative"), node = $("#negativeMatch");
    node.classList.toggle("valid", Boolean(match));
    node.textContent = match ? `Código confirmado: ${match.code} · ${match.article} · ${match.color} · Talle ${match.size}` : "Seleccioná artículo, color y talle.";
  }
  function naturalSort(a, b) { return String(a).localeCompare(String(b), "es", { numeric: true }); }

  function saveBranch() {
    const value = normalizeBranch(els.branch.value);
    if (value) localStorage.setItem(BRANCH_KEY, value); else localStorage.removeItem(BRANCH_KEY);
  }

  function updateCounters() {
    $("#titleCount").textContent = els.title.value.length;
    $("#descriptionCount").textContent = els.description.value.length;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    for (const file of incoming) {
      if (selectedFiles.length >= MAX_FILES) { showToast(`Podés adjuntar hasta ${MAX_FILES} archivos.`); break; }
      if (file.size > MAX_FILE_SIZE) { showToast(`${file.name} supera los 10 MB.`); continue; }
      if (selectedFiles.some(item => item.name === file.name && item.size === file.size)) continue;
      selectedFiles.push(file);
    }
    els.files.value = "";
    renderSelectedFiles();
  }

  function renderSelectedFiles() {
    els.fileList.innerHTML = "";
    selectedFiles.forEach((file, index) => {
      const row = document.createElement("div"); row.className = "attachment-item";
      const preview = file.type.startsWith("image/") ? `<img class="attachment-thumb" src="${URL.createObjectURL(file)}" alt="">` : `<span class="attachment-thumb">${fileIcon(file)}</span>`;
      row.innerHTML = `${preview}<div><strong>${escapeHtml(file.name)}</strong><small>${formatSize(file.size)}</small></div><button type="button" aria-label="Quitar">×</button>`;
      row.querySelector("button").addEventListener("click", () => { selectedFiles.splice(index, 1); renderSelectedFiles(); });
      els.fileList.appendChild(row);
    });
  }

  async function submitIncident(event) {
    event.preventDefault();
    clearMessage();
    if (!els.branch.value || !els.reporter.value.trim()) return setMessage("Completá la sucursal y el código de colaborador.", "error");
    if (mode === "general" && !els.form.reportValidity()) return setMessage("Completá todos los campos obligatorios.", "error");
    saveBranch();
    els.submit.disabled = true; els.submit.textContent = "Creando…";
    try {
      const attachments = await Promise.all(selectedFiles.map(fileToPayload));
      const common = { action: "crear", branch: normalizeBranch(els.branch.value), reporterCode: els.reporter.value.trim(), attachments };
      let created = [];
      if (mode === "labels") created = await createLabelTickets(common);
      else if (mode === "negative") created = [await persistTicket(createNegativePayload(common))];
      else created = [await persistTicket({ ...common, area: els.area.value, priority: els.priority.value, title: els.title.value.trim(), description: els.description.value.trim() })];
      resetForm(true);
      const ids = created.map(item => item.id).join(" y ");
      setMessage(`${created.length > 1 ? "Incidentes" : "Incidente"} ${ids} creado${created.length > 1 ? "s" : ""} correctamente.`, "success");
      renderAll(); showToast(`${created.length} incidente${created.length > 1 ? "s" : ""} creado${created.length > 1 ? "s" : ""}`);
    } catch (error) {
      setMessage(error.message || "No se pudo crear el incidente.", "error");
    } finally {
      els.submit.disabled = false; updateSubmitLabel();
    }
  }

  async function createLabelTickets(common) {
    const bajas = parseCodes($("#labelBajas").value);
    if (!labelItems.length) throw new Error("Agregá al menos una etiqueta nueva.");
    const group = `REET-${Date.now()}`;
    const labelsText = labelItems.map(item => `${item.quantity} × ${item.code} | Art. ${item.article} | ${item.color} | Talle ${item.size}`).join("\n");
    if (!bajas.length) {
      const etiquetas = await persistTicket({ ...common, area: "Precios", priority: "Alta", title: `Pedido de etiquetas (${labelItems.reduce((sum, item) => sum + item.quantity, 0)})`, description: `Etiquetas solicitadas:\n${labelsText}\n\nNo se solicitó baja de artículos.` });
      return [etiquetas];
    }
    const baja = await persistTicket({ ...common, area: "Stock", priority: "Alta", title: `Baja de artículos para reetiquetado (${bajas.length})`, description: `Proceso vinculado: ${group}\n\nCódigos a dar de baja:\n${bajas.join("\n")}` });
    const etiquetas = await persistTicket({ ...common, area: "Precios", priority: "Alta", title: `Pedido de etiquetas para reetiquetado (${labelItems.reduce((sum, item) => sum + item.quantity, 0)})`, description: `Proceso vinculado: ${group}\nIncidente de baja: ${baja.id}\n\nEtiquetas solicitadas:\n${labelsText}` });
    return [baja, etiquetas];
  }

  function createNegativePayload(common) {
    const variant = findVariant("negative");
    const stock = Number($("#negativeStock").value);
    if (!variant) throw new Error("Seleccioná una combinación válida de artículo, color y talle.");
    if (!Number.isFinite(stock) || stock >= 0) throw new Error("El stock informado debe ser un número negativo.");
    return { ...common, area: "Stock", priority: "Alta", title: `Stock negativo · ${variant.article} · ${variant.color} · Talle ${variant.size}`, description: `Código: ${variant.code}\nArtículo: ${variant.article}\nColor: ${variant.color}\nTalle: ${variant.size}\nStock mostrado por el sistema: ${stock}` };
  }

  async function persistTicket(payload) {
    if (API_URL) return (await apiPost(payload)).ticket;
    const created = createLocalTicket(payload); tickets.unshift(created); saveLocal(); return created;
  }

  async function loadTickets() {
    try {
      if (API_URL) {
        const response = await fetch(`${API_URL}?action=listar&t=${Date.now()}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Error de conexión");
        tickets = Array.isArray(result.tickets) ? result.tickets : [];
        els.badge.textContent = "Conectado"; els.badge.classList.add("online");
      } else {
        tickets = readLocal();
        els.badge.textContent = "Modo local"; els.badge.classList.remove("online");
      }
      renderAll();
    } catch (error) {
      tickets = readLocal(); renderAll();
      els.badge.textContent = "Sin conexión · respaldo local"; els.badge.classList.remove("online");
      showToast("No se pudo conectar. Se muestran los datos locales.");
    }
  }

  function renderAll() { fillAreaFilter(); renderTickets(); }

  function fillAreaFilter() {
    const current = els.areaFilter.value;
    const areas = [...new Set(tickets.map(x => x.area).filter(Boolean))].sort();
    els.areaFilter.innerHTML = '<option value="">Todas las áreas</option>' + areas.map(x => `<option>${escapeHtml(x)}</option>`).join("");
    if (areas.includes(current)) els.areaFilter.value = current;
  }

  function renderTickets() {
    const query = normalizeText(els.search.value);
    const filtered = tickets.filter(ticket => {
      const haystack = normalizeText([ticket.id, ticket.title, ticket.description, ticket.reporterCode, ticket.branch, ticket.area].join(" "));
      return (!query || haystack.includes(query)) && (!els.status.value || ticket.status === els.status.value) && (!els.areaFilter.value || ticket.area === els.areaFilter.value);
    });
    els.list.innerHTML = "";
    els.empty.hidden = filtered.length > 0;
    filtered.forEach(ticket => {
      const card = document.createElement("article"); card.className = "ticket-card"; card.dataset.priority = ticket.priority;
      card.innerHTML = `<span class="priority-line"></span><div class="ticket-main"><div class="ticket-top"><span class="ticket-id">${escapeHtml(ticket.id)}</span><span class="tag">${escapeHtml(ticket.area)}</span></div><h3 class="ticket-title">${escapeHtml(ticket.title)}</h3><div class="ticket-meta"><span>${escapeHtml(ticket.branch)}</span><span>·</span><span>Cód. ${escapeHtml(ticket.reporterCode)}</span><span>·</span><span>${formatDate(ticket.createdAt)}</span>${ticket.attachments?.length ? `<span>· 📎 ${ticket.attachments.length}</span>` : ""}</div></div><span class="status-pill" data-status="${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span>`;
      card.addEventListener("click", () => openDetail(ticket)); els.list.appendChild(card);
    });
  }

  function openDetail(ticket) {
    const files = (ticket.attachments || []).map(item => `<a href="${escapeHtml(item.url || item.dataUrl || "#")}" target="_blank" rel="noopener">${fileIcon(item)} ${escapeHtml(item.name)}</a>`).join("");
    els.detail.innerHTML = `<div class="detail-title"><p class="eyebrow">${escapeHtml(ticket.id)}</p><h2>${escapeHtml(ticket.title)}</h2><span class="status-pill" data-status="${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span></div><div class="detail-description">${escapeHtml(ticket.description)}</div><div class="detail-grid"><div class="detail-field"><span>Sucursal</span><strong>${escapeHtml(ticket.branch)}</strong></div><div class="detail-field"><span>Área</span><strong>${escapeHtml(ticket.area)}</strong></div><div class="detail-field"><span>Prioridad</span><strong>${escapeHtml(ticket.priority)}</strong></div><div class="detail-field"><span>Reportó</span><strong>Cód. ${escapeHtml(ticket.reporterCode)}</strong></div><div class="detail-field"><span>Creado</span><strong>${formatDate(ticket.createdAt)}</strong></div><div class="detail-field"><span>Última actualización</span><strong>${formatDate(ticket.updatedAt)}</strong></div></div>${files ? `<h3>Adjuntos</h3><div class="detail-attachments">${files}</div>` : ""}`;
    els.dialog.showModal();
  }

  function createLocalTicket(payload) {
    const sequence = Math.max(0, ...tickets.map(x => Number(String(x.id).replace(/\D/g, "")) || 0)) + 1;
    const now = new Date().toISOString();
    return { ...payload, id: `INC-${String(sequence).padStart(5, "0")}`, status: "Abierto", createdAt: now, updatedAt: now };
  }

  async function fileToPayload(file) {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    return { name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl };
  }

  async function apiPost(payload) {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "No se pudo guardar");
    return result;
  }

  function resetForm(preserveMessage = false) {
    const branch = els.branch.value; els.form.reset(); els.branch.value = branch; els.priority.value = "Media";
    labelItems = []; renderLabelItems(); updateBajasCount(); updateNegativeMatch();
    selectedFiles = []; renderSelectedFiles(); updateCounters(); if (!preserveMessage) clearMessage();
  }
  function readLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; } }
  function saveLocal() { localStorage.setItem(STORE_KEY, JSON.stringify(tickets)); }
  function setMessage(text, type) { els.message.textContent = text; els.message.className = `form-message ${type || ""}`; }
  function clearMessage() { setMessage("", ""); }
  function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date); }
  function formatSize(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
  function fileIcon(file) { const type = String(file.type || ""); if (type.startsWith("image/")) return "▧"; if (type.startsWith("video/")) return "▶"; if (type.includes("pdf") || String(file.name).toLowerCase().endsWith(".pdf")) return "PDF"; return "DOC"; }
  function showToast(text) { const node = $("#toast"); node.textContent = text; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 3200); }
})();
