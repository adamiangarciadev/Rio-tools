;(() => {
  "use strict";

  const API_URL = window.REMITOS_DEPOSITO_API_URL || "";
  const STORE_KEY = "rio_remitos_deposito_store_v1";
  const INITIAL_ROWS = 12;

  const $ = (selector) => document.querySelector(selector);

  const el = {
    reloadBtn: $("#reloadBtn"),
    exportBtn: $("#exportBtn"),
    segments: Array.from(document.querySelectorAll(".segment")),
    existingClientBox: $("#existingClientBox"),
    newClientForm: $("#newClientForm"),
    clientSelect: $("#clientSelect"),
    clientCodeInput: $("#clientCodeInput"),
    clientsDatalist: $("#clientsDatalist"),
    searchClientBtn: $("#searchClientBtn"),
    newClientCode: $("#newClientCode"),
    newClientName: $("#newClientName"),
    newClientAddress: $("#newClientAddress"),
    newClientPhone: $("#newClientPhone"),
    currentClient: $("#currentClient"),
    nextRemito: $("#nextRemito"),
    clientRemitoCount: $("#clientRemitoCount"),
    sourceBadge: $("#sourceBadge"),
    remitoForm: $("#remitoForm"),
    formStatus: $("#formStatus"),
    remitoClientName: $("#remitoClientName"),
    remitoDate: $("#remitoDate"),
    remitoNumber: $("#remitoNumber"),
    packageCount: $("#packageCount"),
    itemsBody: $("#itemsBody"),
    addRowBtn: $("#addRowBtn"),
    observations: $("#observations"),
    remitoTotal: $("#remitoTotal"),
    saveRemitoBtn: $("#saveRemitoBtn"),
    clearFormBtn: $("#clearFormBtn"),
    printBtn: $("#printBtn"),
    historyStatus: $("#historyStatus"),
    historySearch: $("#historySearch"),
    historyList: $("#historyList"),
    itemRowTemplate: $("#itemRowTemplate")
  };

  const state = {
    mode: "existing",
    currentClient: null,
    clients: {},
    remitos: [],
    source: "local",
    saving: false,
    selectedRemito: null
  };

  init();

  function init() {
    bindEvents();
    el.remitoDate.value = todayIso();
    resetRows();
    loadStore();
  }

  function bindEvents() {
    el.segments.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode || "existing"));
    });

    el.searchClientBtn.addEventListener("click", searchClient);
    el.clientSelect.addEventListener("change", () => {
      if (!el.clientSelect.value) return;
      el.clientCodeInput.value = el.clientSelect.value;
      searchClient();
    });
    el.clientCodeInput.addEventListener("change", searchClient);
    el.clientCodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchClient();
      }
    });

    el.newClientForm.addEventListener("submit", saveNewClient);
    el.reloadBtn.addEventListener("click", loadStore);
    el.exportBtn.addEventListener("click", exportStore);
    el.addRowBtn.addEventListener("click", () => addRow());
    el.clearFormBtn.addEventListener("click", clearRemitoForm);
    el.printBtn.addEventListener("click", () => window.print());
    el.remitoForm.addEventListener("submit", saveRemito);
    el.itemsBody.addEventListener("input", onItemsInput);
    el.itemsBody.addEventListener("click", onItemsClick);
    el.historySearch.addEventListener("input", renderHistory);
    el.historyList.addEventListener("click", onHistoryClick);
  }

  async function loadStore() {
    const localStore = readLocalStore();
    applyStore(localStore, "local");

    if (!isApiConfigured()) {
      el.formStatus.textContent = "Modo local activo. Configura api-config.js con Apps Script para respaldo central.";
      return;
    }

    try {
      el.sourceBadge.textContent = "Conectando";
      const data = await fetchJson(`${API_URL}?accion=store`);
      applyStore(data.store || {}, "Apps Script");
      writeLocalStore(getStoreSnapshot());
    } catch (error) {
      console.error(error);
      el.sourceBadge.textContent = "Local";
      el.formStatus.textContent = "No se pudo conectar con Apps Script. Se usa el respaldo local.";
    }
  }

  function applyStore(store, source) {
    state.clients = store.clients && typeof store.clients === "object" ? store.clients : {};
    state.remitos = Array.isArray(store.remitos) ? store.remitos : [];
    state.source = source;
    el.sourceBadge.textContent = source;
    renderClientsDatalist();
    refreshCurrentClient();
    renderHistory();
  }

  function setMode(mode) {
    state.mode = mode === "new" ? "new" : "existing";
    el.segments.forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
    el.existingClientBox.hidden = state.mode !== "existing";
    el.newClientForm.hidden = state.mode !== "new";

    if (state.mode === "new") {
      el.newClientCode.focus();
    } else {
      el.clientCodeInput.focus();
    }
  }

  function searchClient() {
    const code = getClientCodeFromInput(el.clientCodeInput.value);
    if (!code) {
      window.alert("Ingresa un codigo de cliente.");
      return;
    }

    const client = state.clients[code];
    if (!client) {
      const shouldCreate = window.confirm(`No existe el cliente ${code}. ¿Querés cargarlo ahora?`);
      if (!shouldCreate) return;
      setMode("new");
      el.newClientCode.value = code;
      el.newClientName.focus();
      return;
    }

    selectClient(client);
  }

  async function saveNewClient(event) {
    event.preventDefault();

    const client = {
      codigo: normalizeCode(el.newClientCode.value),
      nombre: cleanText(el.newClientName.value),
      direccion: cleanText(el.newClientAddress.value),
      telefono: cleanText(el.newClientPhone.value),
      creadoEn: new Date().toISOString()
    };

    if (!client.codigo || !client.nombre) {
      window.alert("Completa codigo y nombre del cliente.");
      return;
    }

    state.clients[client.codigo] = {
      ...(state.clients[client.codigo] || {}),
      ...client,
      actualizadoEn: new Date().toISOString()
    };

    await persistStore("guardar_cliente", { cliente: state.clients[client.codigo] });
    writeLocalStore(getStoreSnapshot());
    selectClient(state.clients[client.codigo]);
    el.newClientForm.reset();
    setMode("existing");
  }

  function selectClient(client) {
    state.currentClient = client;
    el.clientCodeInput.value = client.codigo || "";
    el.remitoClientName.value = client.nombre || "";
    state.selectedRemito = null;
    refreshCurrentClient();
    clearRemitoForm({ keepClient: true });
    renderHistory();
  }

  function renderClientsDatalist() {
    const clients = Object.values(state.clients || {})
      .filter((client) => client && client.codigo)
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es") || String(a.codigo).localeCompare(String(b.codigo), "es"));

    el.clientSelect.innerHTML = `<option value="">Seleccionar cliente</option>` + clients.map((client) => {
      const code = escapeAttr(client.codigo || "");
      const name = escapeHtml(client.nombre || "");
      return `<option value="${code}">${code} - ${name}</option>`;
    }).join("");

    el.clientsDatalist.innerHTML = clients.map((client) => {
      const code = escapeAttr(client.codigo || "");
      const name = escapeAttr(client.nombre || "");
      return `<option value="${code}" label="${name}">${code} - ${name}</option>`;
    }).join("");
  }

  function getClientCodeFromInput(value) {
    const raw = cleanText(value);
    const normalized = normalizeCode(raw);
    if (state.clients[normalized]) return normalized;

    const exactByName = Object.values(state.clients || {}).find((client) => normalizeCode(client.nombre) === normalized);
    if (exactByName) return exactByName.codigo;

    const codePrefix = normalized.split(/\s+-\s+|\s+/)[0];
    return normalizeCode(codePrefix);
  }

  function refreshCurrentClient() {
    const client = state.currentClient ? state.clients[state.currentClient.codigo] : null;
    state.currentClient = client || null;

    if (!state.currentClient) {
      el.currentClient.textContent = "Sin seleccionar";
      el.nextRemito.textContent = "-";
      el.clientRemitoCount.textContent = "0";
      el.saveRemitoBtn.disabled = true;
      el.printBtn.disabled = true;
      return;
    }

    const remitos = getClientRemitos(state.currentClient.codigo);
    const nextNumber = buildNextRemitoNumber(state.currentClient.codigo, remitos);
    el.currentClient.textContent = `${state.currentClient.codigo} - ${state.currentClient.nombre}`;
    el.nextRemito.textContent = nextNumber;
    if (!state.selectedRemito) {
      el.remitoNumber.value = nextNumber;
    }
    el.clientRemitoCount.textContent = String(remitos.length);
    el.saveRemitoBtn.disabled = Boolean(state.selectedRemito);
    el.printBtn.disabled = false;
  }

  async function saveRemito(event) {
    event.preventDefault();
    if (state.saving) return;

    if (state.selectedRemito) {
      window.alert("Este remito ya fue guardado y no se puede editar. Limpia el formulario para crear uno nuevo.");
      return;
    }

    if (!state.currentClient) {
      window.alert("Primero selecciona o crea un cliente.");
      return;
    }

    const items = readItems();
    if (!items.length) {
      window.alert("Carga al menos un articulo en el remito.");
      return;
    }

    const remito = {
      id: `${state.currentClient.codigo}-${Date.now()}`,
      numero: el.remitoNumber.value || buildNextRemitoNumber(state.currentClient.codigo, getClientRemitos(state.currentClient.codigo)),
      clienteCodigo: state.currentClient.codigo,
      clienteNombre: state.currentClient.nombre,
      fecha: el.remitoDate.value || todayIso(),
      bultos: Number(el.packageCount.value || 0),
      observaciones: cleanText(el.observations.value),
      items,
      totalCantidad: round2(items.reduce((sum, item) => sum + item.cantidad, 0)),
      total: round2(items.reduce((sum, item) => sum + item.monto, 0)),
      creadoEn: new Date().toISOString()
    };

    try {
      state.saving = true;
      el.saveRemitoBtn.disabled = true;
      el.saveRemitoBtn.textContent = "Guardando...";
      state.remitos.push(remito);
      await persistStore("guardar_remito", { remito });
      writeLocalStore(getStoreSnapshot());
      state.selectedRemito = remito;
      setRemitoReadonly(true);
      refreshCurrentClient();
      renderHistory();
      el.formStatus.textContent = `Remito ${remito.numero} guardado. Limpia el formulario para cargar uno nuevo.`;
      window.alert(`Remito ${remito.numero} guardado correctamente.`);
    } catch (error) {
      state.remitos = state.remitos.filter((item) => item.id !== remito.id);
      console.error(error);
      window.alert(error.message || "No se pudo guardar el remito.");
    } finally {
      state.saving = false;
      el.saveRemitoBtn.textContent = "Guardar remito";
      refreshCurrentClient();
    }
  }

  async function persistStore(action, payload) {
    if (!isApiConfigured()) return;

    const data = await fetchJson(API_URL, {
      method: "POST",
      body: JSON.stringify({
        accion: action,
        ...payload
      })
    });

    if (data.store) {
      applyStore(data.store, "Apps Script");
    }
  }

  function clearRemitoForm(options = {}) {
    if (!options.keepClient) {
      state.selectedRemito = null;
    }

    setRemitoReadonly(false);
    el.remitoDate.value = todayIso();
    el.packageCount.value = "0";
    el.observations.value = "";
    resetRows();

    if (state.currentClient) {
      el.remitoClientName.value = state.currentClient.nombre || "";
      el.remitoNumber.value = buildNextRemitoNumber(state.currentClient.codigo, getClientRemitos(state.currentClient.codigo));
      el.formStatus.textContent = "Listo para cargar un remito.";
    } else {
      el.remitoClientName.value = "";
      el.remitoNumber.value = "";
      el.formStatus.textContent = "Selecciona o crea un cliente para empezar.";
    }

    updateTotals();
    refreshCurrentClient();
  }

  function resetRows() {
    el.itemsBody.innerHTML = "";
    for (let i = 0; i < INITIAL_ROWS; i++) addRow();
  }

  function addRow(item = {}) {
    const row = el.itemRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-field="articulo"]').value = item.articulo || "";
    row.querySelector('[data-field="descripcion"]').value = item.descripcion || "";
    row.querySelector('[data-field="cantidad"]').value = item.cantidad || "";
    row.querySelector('[data-field="precio"]').value = item.precio || "";
    row.querySelector('[data-field="monto"]').textContent = formatCurrency(item.monto || 0);
    el.itemsBody.appendChild(row);
  }

  function onItemsInput(event) {
    if (!event.target.matches("input")) return;
    const row = event.target.closest("tr");
    updateRowAmount(row);
    updateTotals();
  }

  function onItemsClick(event) {
    const button = event.target.closest("[data-action='remove-row']");
    if (!button) return;

    const row = button.closest("tr");
    if (el.itemsBody.children.length <= 1) {
      row.querySelectorAll("input").forEach((input) => {
        input.value = "";
      });
    } else {
      row.remove();
    }
    updateTotals();
  }

  function updateRowAmount(row) {
    if (!row) return;
    const cantidad = parseNumber(row.querySelector('[data-field="cantidad"]').value);
    const precio = parseNumber(row.querySelector('[data-field="precio"]').value);
    row.querySelector('[data-field="monto"]').textContent = formatCurrency(cantidad * precio);
  }

  function updateTotals() {
    const total = readItems().reduce((sum, item) => sum + item.monto, 0);
    el.remitoTotal.textContent = formatCurrency(total);
  }

  function readItems() {
    return Array.from(el.itemsBody.querySelectorAll("tr"))
      .map((row) => {
        const articulo = cleanText(row.querySelector('[data-field="articulo"]').value);
        const descripcion = cleanText(row.querySelector('[data-field="descripcion"]').value);
        const cantidad = parseNumber(row.querySelector('[data-field="cantidad"]').value);
        const precio = parseNumber(row.querySelector('[data-field="precio"]').value);
        return {
          articulo,
          descripcion,
          cantidad,
          precio,
          monto: round2(cantidad * precio)
        };
      })
      .filter((item) => item.articulo || item.descripcion || item.cantidad || item.precio);
  }

  function renderHistory() {
    if (!state.currentClient) {
      el.historyList.innerHTML = `<div class="empty-state">Sin cliente seleccionado.</div>`;
      el.historyStatus.textContent = "Busca un cliente para ver sus remitos.";
      return;
    }

    const query = normalizeSearch(el.historySearch.value);
    const remitos = getClientRemitos(state.currentClient.codigo)
      .filter((remito) => {
        if (!query) return true;
        const bucket = [
          remito.numero,
          remito.fecha,
          remito.observaciones,
          ...(remito.items || []).flatMap((item) => [item.articulo, item.descripcion])
        ].join(" ");
        return normalizeSearch(bucket).includes(query);
      });

    el.historyStatus.textContent = `${remitos.length} remito${remitos.length === 1 ? "" : "s"} para ${state.currentClient.nombre}.`;

    if (!remitos.length) {
      el.historyList.innerHTML = `<div class="empty-state">No hay remitos para este filtro.</div>`;
      return;
    }

    el.historyList.innerHTML = remitos.map((remito) => `
      <article class="history-card">
        <div class="history-card__top">
          <div>
            <h3>${escapeHtml(remito.numero || "-")}</h3>
            <p>${escapeHtml(formatDate(remito.fecha))}</p>
          </div>
          <strong>${escapeHtml(formatCurrency(remito.total || 0))}</strong>
        </div>
        <dl>
          <div><dt>Prendas</dt><dd>${escapeHtml(remito.totalCantidad || 0)}</dd></div>
          <div><dt>Bultos</dt><dd>${escapeHtml(remito.bultos || 0)}</dd></div>
        </dl>
        <button class="btn secondary" type="button" data-action="load-remito" data-id="${escapeAttr(remito.id)}">Ver remito</button>
      </article>
    `).join("");
  }

  function onHistoryClick(event) {
    const button = event.target.closest("[data-action='load-remito']");
    if (!button) return;

    const remito = state.remitos.find((item) => item.id === button.dataset.id);
    if (!remito) return;
    loadRemitoIntoForm(remito);
  }

  function loadRemitoIntoForm(remito) {
    state.selectedRemito = remito;
    el.remitoClientName.value = remito.clienteNombre || "";
    el.remitoDate.value = remito.fecha || todayIso();
    el.remitoNumber.value = remito.numero || "";
    el.packageCount.value = remito.bultos || 0;
    el.observations.value = remito.observaciones || "";
    el.itemsBody.innerHTML = "";
    (remito.items || []).forEach(addRow);
    while (el.itemsBody.children.length < INITIAL_ROWS) addRow();
    setRemitoReadonly(true);
    updateTotals();
    refreshCurrentClient();
    el.formStatus.textContent = `Viendo remito ${remito.numero}. Limpia el formulario para cargar uno nuevo.`;
  }

  function setRemitoReadonly(readonly) {
    el.remitoClientName.readOnly = true;
    el.remitoDate.readOnly = true;
    el.remitoNumber.readOnly = true;
    el.packageCount.readOnly = readonly;
    el.observations.readOnly = readonly;
    el.addRowBtn.disabled = readonly;

    el.itemsBody.querySelectorAll("input").forEach((input) => {
      input.readOnly = readonly;
      input.tabIndex = readonly ? -1 : 0;
    });

    el.itemsBody.querySelectorAll("[data-action='remove-row']").forEach((button) => {
      button.disabled = readonly;
    });

    el.remitoForm.classList.toggle("is-readonly", readonly);
  }

  function getClientRemitos(code) {
    return state.remitos
      .filter((remito) => String(remito.clienteCodigo) === String(code))
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
  }

  function buildNextRemitoNumber(code, remitos) {
    const maxSeq = remitos.reduce((max, remito) => {
      const match = String(remito.numero || "").match(/-(\d+)$/);
      const seq = match ? Number(match[1]) : 0;
      return Math.max(max, seq);
    }, 0);
    return `${normalizeCode(code)}-${String(maxSeq + 1).padStart(4, "0")}`;
  }

  function getStoreSnapshot() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      clients: state.clients,
      remitos: state.remitos
    };
  }

  function readLocalStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeLocalStore(store) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn("No se pudo guardar en localStorage", error);
    }
  }

  function exportStore() {
    const blob = new Blob([JSON.stringify(getStoreSnapshot(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `remitos-deposito-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "La respuesta del servidor no es JSON valido.");
    }
    if (!data.ok) throw new Error(data.error || "La API devolvio un error.");
    return data;
  }

  function isApiConfigured() {
    return API_URL && !API_URL.includes("PEGAR_URL");
  }

  function parseNumber(value) {
    let normalized = String(value || "").trim();
    if (normalized.includes(",") && normalized.includes(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(",", ".");
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "-";
    const parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function todayIso() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function round2(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function normalizeCode(value) {
    return cleanText(value).toUpperCase();
  }

  function normalizeSearch(value) {
    return cleanText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
