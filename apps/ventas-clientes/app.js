;(() => {
  "use strict";

  const API_URL = window.VENTAS_CLIENTES_API_URL || "";
  const PERIOD_LABELS = {
    month: "Mes base",
    last3: "Ultimos 3 meses",
    year: "Anio base",
    all: "Historico"
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const el = {
    pingBtn: $("#pingBtn"),
    importBtn: $("#importBtn"),
    exportDataBtn: $("#exportDataBtn"),
    exportBtn: $("#exportBtn"),
    deselectAllBtn: $("#deselectAllBtn"),
    refreshBtn: $("#refreshBtn"),
    periodFilter: $("#periodFilter"),
    branchFilter: $("#branchFilter"),
    segmentFilter: $("#segmentFilter"),
    priceListFilter: $("#priceListFilter"),
    priceListOnly: $("#priceListOnly"),
    searchInput: $("#searchInput"),
    selectAllVisible: $("#selectAllVisible"),
    apiBadge: $("#apiBadge"),
    sourceBadge: $("#sourceBadge"),
    statusText: $("#statusText"),
    totalClients: $("#totalClients"),
    newClients: $("#newClients"),
    rankingTitle: $("#rankingTitle"),
    rankingSubtitle: $("#rankingSubtitle"),
    selectionText: $("#selectionText"),
    clearSelectionBtn: $("#clearSelectionBtn"),
    clientRows: $("#clientRows"),
    clientDetail: $("#clientDetail"),
    detailHint: $("#detailHint"),
    exportDataModal: $("#exportDataModal"),
    exportDataCloseBtn: $("#exportDataCloseBtn"),
    exportFromDate: $("#exportFromDate"),
    exportToDate: $("#exportToDate"),
    exportBranch: $("#exportBranch"),
    exportPriceList: $("#exportPriceList"),
    exportPriceListOnly: $("#exportPriceListOnly"),
    runExportDataBtn: $("#runExportDataBtn"),
    rowTemplate: $("#clientRowTemplate")
  };

  const state = {
    loading: false,
    apiOk: false,
    sort: "periodTotal",
    selectedClientId: "",
    selectedClients: new Set(),
    dashboard: {
      meta: {},
      clientes: [],
      sucursales: [],
      meses: []
    },
    comprasCliente: []
  };

  init();

  function init() {
    bindEvents();
    checkApi().finally(loadDashboard);
  }

  function bindEvents() {
    el.pingBtn?.addEventListener("click", checkApi);
    el.refreshBtn.addEventListener("click", loadDashboard);
    el.importBtn?.addEventListener("click", importDriveFiles);
    el.exportDataBtn.addEventListener("click", openExportDataModal);
    el.exportDataCloseBtn.addEventListener("click", closeExportDataModal);
    el.exportDataModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-export-close='1']")) closeExportDataModal();
    });
    el.runExportDataBtn.addEventListener("click", exportDataByBranch);
    el.exportBtn.addEventListener("click", exportSelectedClients);
    el.deselectAllBtn.addEventListener("click", clearSelection);
    el.clearSelectionBtn.addEventListener("click", clearSelection);
    el.periodFilter.addEventListener("change", render);
    el.branchFilter.addEventListener("change", render);
    el.segmentFilter.addEventListener("change", render);
    el.priceListFilter.addEventListener("change", () => {
      syncExportFiltersFromMain();
      render();
    });
    el.priceListOnly.addEventListener("change", () => {
      syncExportFiltersFromMain();
      render();
    });
    el.searchInput.addEventListener("input", render);
    el.selectAllVisible.addEventListener("change", toggleAllVisibleClients);

    $$("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        state.sort = button.dataset.sort || "periodTotal";
        $$("[data-sort]").forEach((item) => item.classList.toggle("active", item === button));
        renderClients();
      });
    });

    el.clientRows.addEventListener("click", (event) => {
      const check = event.target.closest("[data-action='toggle-client']");
      if (check) {
        toggleClientSelection(check.dataset.clientId, check.checked);
        return;
      }

      const button = event.target.closest("[data-action='select-client']");
      if (!button) return;
      selectClient(button.dataset.clientId);
    });
  }

  async function loadDashboard() {
    if (state.loading) return;

    try {
      state.loading = true;
      setBusy(true);
      el.sourceBadge.textContent = "Leyendo datos";
      el.statusText.textContent = "Leyendo base historica...";

      const data = await apiGet("dashboard");
      if (!data.ok) throw new Error(data.error || "No se pudo cargar el dashboard.");

      state.dashboard = {
        meta: data.meta || {},
        clientes: normalizeClients(data.clientes),
        sucursales: Array.isArray(data.sucursales) ? data.sucursales : [],
        meses: Array.isArray(data.meses) ? data.meses : []
      };

      populateFilters();
      if (!state.selectedClientId && state.dashboard.clientes.length) {
        state.selectedClientId = state.dashboard.clientes[0].clienteId;
      }
      render();

      if (state.selectedClientId) {
        await loadClientDetail(state.selectedClientId);
      }
    } catch (error) {
      console.error(error);
      if (!state.apiOk) {
        el.apiBadge.textContent = "API no disponible";
        el.apiBadge.dataset.state = "error";
      }
      el.sourceBadge.textContent = "Datos no disponibles";
      el.sourceBadge.dataset.state = "error";
      el.statusText.textContent = error.message || "No se pudo conectar con la API.";
      renderEmpty(error.message || "Falta configurar la API publicada de ventas por cliente.");
    } finally {
      state.loading = false;
      setBusy(false);
    }
  }

  async function checkApi() {
    try {
      el.apiBadge.textContent = "Probando API";
      el.apiBadge.dataset.state = "loading";
      el.statusText.textContent = "Probando conexion con la Web App...";

      const data = await apiGet("ping");
      if (!data.ok) throw new Error(data.error || "La API respondio con error.");

      state.apiOk = true;
      el.apiBadge.textContent = "API activa";
      el.apiBadge.dataset.state = "ok";
      el.statusText.textContent = `API activa: ${data.app || "ventas-clientes"} · ${formatDateTime(data.ts)}`;
      return true;
    } catch (error) {
      state.apiOk = false;
      el.apiBadge.textContent = "API no disponible";
      el.apiBadge.dataset.state = "error";
      el.statusText.textContent = error.message || "No se pudo consultar la API.";
      return false;
    }
  }

  async function importDriveFiles() {
    const ok = window.confirm("Importar CSVs nuevos desde la carpeta de Google Drive?");
    if (!ok) return;

    try {
      setBusy(true);
      el.statusText.textContent = "Importando archivos desde Drive...";
      const data = await apiGet("importar_csvs");
      if (!data.ok) throw new Error(data.error || "No se pudieron importar los CSVs.");
      window.alert(`Importacion lista. Archivos nuevos: ${data.archivosImportados || 0}. Filas nuevas: ${data.filasImportadas || 0}.`);
      await loadDashboard();
    } catch (error) {
      window.alert(error.message || "No se pudo importar desde Drive.");
    } finally {
      setBusy(false);
    }
  }

  async function selectClient(clientId) {
    if (!clientId) return;
    state.selectedClientId = clientId;
    renderClients();
    await loadClientDetail(clientId);
  }

  function toggleClientSelection(clientId, checked) {
    if (!clientId) return;
    if (checked) {
      state.selectedClients.add(clientId);
    } else {
      state.selectedClients.delete(clientId);
    }
    renderClients();
    renderSelection();
  }

  function clearSelection() {
    state.selectedClients.clear();
    renderClients();
    renderSelection();
  }

  function toggleAllVisibleClients() {
    const visible = getVisibleClients();
    const checked = el.selectAllVisible.checked;
    visible.forEach((client) => {
      if (!client.clienteId) return;
      if (checked) state.selectedClients.add(client.clienteId);
      else state.selectedClients.delete(client.clienteId);
    });
    renderClients(visible);
    renderSelection();
  }

  function updateSelectAllVisibleState(visible) {
    const clients = visible || getVisibleClients();
    const selectable = clients.filter((client) => client.clienteId);
    const selected = selectable.filter((client) => state.selectedClients.has(client.clienteId));

    el.selectAllVisible.disabled = state.loading || selectable.length === 0;
    el.selectAllVisible.checked = selectable.length > 0 && selected.length === selectable.length;
    el.selectAllVisible.indeterminate = selected.length > 0 && selected.length < selectable.length;
  }

  async function loadClientDetail(clientId) {
    try {
      el.detailHint.textContent = "Cargando historial...";
      const data = await apiGet("cliente", { cliente: clientId });
      if (!data.ok) throw new Error(data.error || "No se pudo cargar el cliente.");
      state.comprasCliente = Array.isArray(data.compras) ? data.compras : [];
      renderDetail();
    } catch (error) {
      console.error(error);
      el.clientDetail.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "No se pudo cargar el historial.")}</div>`;
    }
  }

  function populateFilters() {
    const currentBranch = el.branchFilter.value;
    const branches = state.dashboard.sucursales.map((item) => item.sucursal).filter(Boolean);

    el.branchFilter.innerHTML = `<option value="">Todas las sucursales</option>`;
    el.exportBranch.innerHTML = `<option value="">Elegir sucursal</option>`;
    branches.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch;
      option.textContent = branch;
      el.branchFilter.appendChild(option);
      el.exportBranch.appendChild(option.cloneNode(true));
    });
    if (branches.includes(currentBranch)) el.branchFilter.value = currentBranch;

    const currentSegment = el.segmentFilter.value;
    const segments = Array.from(new Set(state.dashboard.clientes.map((client) => client.segmento).filter(Boolean))).sort();
    el.segmentFilter.innerHTML = `<option value="">Todos los segmentos</option>`;
    segments.forEach((segment) => {
      const option = document.createElement("option");
      option.value = segment;
      option.textContent = segment;
      el.segmentFilter.appendChild(option);
    });
    if (segments.includes(currentSegment)) el.segmentFilter.value = currentSegment;

    const currentList = el.priceListFilter.value;
    const priceLists = Array.from(new Set(state.dashboard.clientes.flatMap(getClientLists).filter(Boolean))).sort((a, b) => {
      return String(a).localeCompare(String(b), "es");
    });

    el.priceListFilter.innerHTML = `<option value="">Todas las listas</option>`;
    el.exportPriceList.innerHTML = `<option value="">Todas las listas</option>`;
    priceLists.forEach((priceList) => {
      const option = document.createElement("option");
      option.value = priceList;
      option.textContent = priceList;
      el.priceListFilter.appendChild(option);
      el.exportPriceList.appendChild(option.cloneNode(true));
    });
    if (priceLists.includes(currentList)) el.priceListFilter.value = currentList;
  }

  function render() {
    const visible = getVisibleClients();
    renderSummary(visible);
    renderClients(visible);
    renderDetail();
    renderSelection();
  }

  function renderSummary(visible) {
    const newClients = visible.filter((client) => client.segmento === "Cliente nuevo").length;

    el.totalClients.textContent = formatNumber(visible.length);
    el.newClients.textContent = formatNumber(newClients);

    const meta = state.dashboard.meta || {};
    if (state.apiOk) {
      el.apiBadge.textContent = "API activa";
      el.apiBadge.dataset.state = "ok";
    }
    el.sourceBadge.textContent = meta.totalFilas ? "Base historica" : "Sin datos";
    el.sourceBadge.dataset.state = meta.totalFilas ? "ok" : "empty";
    el.statusText.textContent = meta.totalFilas
      ? `${formatNumber(meta.totalFilas)} filas importadas. Periodo ${meta.fechaMin || "-"} a ${meta.fechaMax || "-"}.`
      : "Todavia no hay CSVs importados.";

    el.rankingTitle.textContent = `Mejores clientes - ${PERIOD_LABELS[el.periodFilter.value] || "Periodo"}`;
  }

  function renderClients(preset) {
    const clients = preset || getVisibleClients();
    const sorted = [...clients].sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      return bv - av || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
    });

    el.rankingSubtitle.textContent = `${formatNumber(sorted.length)} clientes visibles, ordenados por ${getSortLabel()}.`;
    el.clientRows.innerHTML = "";

    if (!sorted.length) {
      el.clientRows.innerHTML = `<tr><td colspan="8" class="empty-cell">No hay clientes para estos filtros.</td></tr>`;
      updateSelectAllVisibleState([]);
      return;
    }

    const fragment = document.createDocumentFragment();
    sorted.slice(0, 250).forEach((client) => {
      const row = el.rowTemplate.content.firstElementChild.cloneNode(true);
      row.classList.toggle("active", client.clienteId === state.selectedClientId);
      row.dataset.clientId = client.clienteId;
      const checkbox = row.querySelector("[data-action='toggle-client']");
      checkbox.dataset.clientId = client.clienteId;
      checkbox.checked = state.selectedClients.has(client.clienteId);
      row.querySelector("[data-action='select-client']").dataset.clientId = client.clienteId;
      row.querySelector("[data-field='name']").textContent = client.nombre || "Sin nombre";
      row.querySelector("[data-field='code']").textContent = `Cliente ${client.clienteId || "-"}`;
      row.querySelector("[data-field='phone']").textContent = cleanPhone(client.telefono) || "-";
      row.querySelector("[data-field='mobile']").textContent = cleanPhone(client.telefonoMovil) || "-";
      row.querySelector("[data-field='branch']").textContent = client.sucursalPrincipal || "-";
      const segment = row.querySelector("[data-field='segment']");
      segment.textContent = client.segmento || "-";
      segment.dataset.segment = segmentKey(client.segmento);
      row.querySelector("[data-field='periodTotal']").textContent = formatMoney(getPeriodTotal(client));
      row.querySelector("[data-field='lastPurchase']").textContent = formatDateShort(client.ultimaCompra);
      fragment.appendChild(row);
    });

    el.clientRows.appendChild(fragment);
    updateSelectAllVisibleState(sorted);
    renderSelection();
  }

  function renderSelection() {
    const count = state.selectedClients.size;
    el.selectionText.textContent = `${formatNumber(count)} cliente${count === 1 ? "" : "s"} seleccionado${count === 1 ? "" : "s"}.`;
    el.exportBtn.disabled = state.loading || count === 0;
    el.deselectAllBtn.disabled = state.loading || count === 0;
    el.clearSelectionBtn.disabled = count === 0;
  }

  function renderDetail() {
    const client = state.dashboard.clientes.find((item) => item.clienteId === state.selectedClientId);
    if (!client) {
      el.detailHint.textContent = "Selecciona un cliente para ver su historial.";
      el.clientDetail.innerHTML = `<div class="empty-state">Sin cliente seleccionado.</div>`;
      return;
    }

    el.detailHint.textContent = client.nombre || "Cliente";
    const purchases = state.comprasCliente.filter((item) => String(item.clienteId || "") === String(client.clienteId || ""));
    const purchaseRows = purchases.slice(0, 80).map((item) => `
      <div class="purchase-row">
        <strong>${escapeHtml(formatDateShort(item.fecha))}</strong>
        <span>${escapeHtml(item.sucursal || "-")} · ${escapeHtml(item.listaPrecio || "-")}</span>
        <strong>${formatMoney(Number(item.total || 0))}</strong>
      </div>
    `).join("");

    el.clientDetail.innerHTML = `
      <article class="client-card">
        <div class="client-card__title">
          <h3>${escapeHtml(client.nombre || "Sin nombre")}</h3>
          <p>${escapeHtml(client.clienteId || "-")} · ${escapeHtml(formatPhone(client) || "Sin telefono")} · ${escapeHtml(client.email || "Sin email")}</p>
        </div>
        <span class="segment-pill" data-segment="${segmentKey(client.segmento)}">${escapeHtml(client.segmento || "-")}</span>
        <div class="metric-grid">
          <div class="metric"><span>Historico</span><strong>${formatMoney(Number(client.totalHistorico || 0))}</strong></div>
          <div class="metric"><span>Periodo</span><strong>${formatMoney(getPeriodTotal(client))}</strong></div>
          <div class="metric"><span>Telefono</span><strong>${escapeHtml(cleanPhone(client.telefono) || "-")}</strong></div>
          <div class="metric"><span>Telefono movil</span><strong>${escapeHtml(cleanPhone(client.telefonoMovil) || "-")}</strong></div>
          <div class="metric"><span>Email</span><strong>${escapeHtml(client.email || "-")}</strong></div>
          <div class="metric"><span>Dias compra</span><strong>${formatNumber(client.diasCompra || 0)}</strong></div>
          <div class="metric"><span>Frecuencia</span><strong>${escapeHtml(client.frecuenciaTexto || "-")}</strong></div>
          <div class="metric"><span>Primera</span><strong>${escapeHtml(formatDateShort(client.primeraCompra))}</strong></div>
          <div class="metric"><span>Ultima</span><strong>${escapeHtml(formatDateShort(client.ultimaCompra))}</strong></div>
        </div>
        <div class="metric">
          <span>Sucursales / listas</span>
          <strong>${escapeHtml(client.sucursalesTexto || "-")} · ${escapeHtml(client.listasTexto || "-")}</strong>
        </div>
        <div class="detail-list">
          ${purchaseRows || `<div class="empty-state">Cargando compras del cliente...</div>`}
        </div>
      </article>
    `;
  }

  function getVisibleClients() {
    const branch = el.branchFilter.value;
    const segment = el.segmentFilter.value;
    const priceList = el.priceListFilter.value;
    const priceListOnly = el.priceListOnly.checked;
    const q = normalizeSearch(el.searchInput.value);

    return state.dashboard.clientes
      .filter((client) => !branch || (client.sucursales || []).includes(branch))
      .filter((client) => !segment || client.segmento === segment)
      .filter((client) => matchesPriceList(client, priceList, priceListOnly))
      .filter((client) => getPeriodTotal(client) !== 0 || el.periodFilter.value === "all")
      .filter((client) => {
        if (!q) return true;
        const haystack = normalizeSearch([
          client.clienteId,
          client.nombre,
          client.telefono,
          client.telefonoMovil,
          client.email
        ].join(" "));
        return haystack.includes(q);
      });
  }

  function getPeriodTotal(client) {
    const period = el.periodFilter.value;
    if (period === "month") return Number(client.totalMesBase || 0);
    if (period === "last3") return Number(client.totalUltimos3Meses || 0);
    if (period === "year") return Number(client.totalAnioBase || 0);
    return Number(client.totalHistorico || 0);
  }

  function getSortValue(client) {
    if (state.sort === "frequencyScore") return Number(client.frequencyScore || 0);
    if (state.sort === "lastPurchaseTs") return Number(client.lastPurchaseTs || 0);
    return getPeriodTotal(client);
  }

  function getSortLabel() {
    if (state.sort === "frequencyScore") return "frecuencia";
    if (state.sort === "lastPurchaseTs") return "compra reciente";
    return "venta";
  }

  function normalizeClients(clients) {
    return (Array.isArray(clients) ? clients : []).map((client) => ({
      ...client,
      clienteId: String(client.clienteId || ""),
      sucursales: Array.isArray(client.sucursales) ? client.sucursales : [],
      listas: Array.isArray(client.listas) ? client.listas : parseListText(client.listasTexto),
      lastPurchaseTs: Date.parse(client.ultimaCompra || "") || 0
    }));
  }

  async function apiGet(action, params = {}) {
    if (!API_URL || API_URL.includes("PEGAR_URL")) {
      throw new Error("Falta configurar VENTAS_CLIENTES_API_URL en api-config.js.");
    }
    const url = new URL(API_URL);
    url.searchParams.set("accion", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderEmpty(message) {
    el.clientRows.innerHTML = `<tr><td colspan="8" class="empty-cell">${escapeHtml(message)}</td></tr>`;
    el.clientDetail.innerHTML = `<div class="empty-state">Cuando haya datos, aca aparece el seguimiento del cliente.</div>`;
    el.totalClients.textContent = "0";
    el.newClients.textContent = "0";
  }

  function setBusy(isBusy) {
    if (el.pingBtn) el.pingBtn.disabled = isBusy;
    el.refreshBtn.disabled = isBusy;
    if (el.importBtn) el.importBtn.disabled = isBusy;
    el.exportDataBtn.disabled = isBusy || !state.dashboard.clientes.length;
    el.runExportDataBtn.disabled = isBusy;
    el.exportBtn.disabled = isBusy || state.selectedClients.size === 0;
    el.deselectAllBtn.disabled = isBusy || state.selectedClients.size === 0;
  }

  function openExportDataModal() {
    const meta = state.dashboard.meta || {};
    el.exportFromDate.value = meta.fechaMin || "";
    el.exportToDate.value = meta.fechaMax || new Date().toISOString().slice(0, 10);
    if (!el.exportBranch.value && el.branchFilter.value) el.exportBranch.value = el.branchFilter.value;
    syncExportFiltersFromMain();
    el.exportDataModal.classList.remove("hidden");
  }

  function closeExportDataModal() {
    el.exportDataModal.classList.add("hidden");
  }

  function syncExportFiltersFromMain() {
    el.exportPriceList.value = el.priceListFilter.value || "";
    el.exportPriceListOnly.checked = el.priceListOnly.checked;
  }

  async function exportDataByBranch() {
    const desde = el.exportFromDate.value;
    const hasta = el.exportToDate.value;
    const sucursal = el.exportBranch.value;
    const listaPrecio = el.exportPriceList.value;
    const soloLista = el.exportPriceListOnly.checked;

    if (!desde || !hasta) {
      window.alert("Elegí fecha desde y fecha hasta.");
      return;
    }
    if (!sucursal) {
      window.alert("Elegí una sucursal.");
      return;
    }
    if (desde > hasta) {
      window.alert("La fecha desde no puede ser mayor a la fecha hasta.");
      return;
    }

    try {
      setBusy(true);
      el.statusText.textContent = `Buscando clientes que pasaron por ${sucursal} entre ${desde} y ${hasta}...`;

      let data = await apiGet("exportar_datos", {
        desde,
        hasta,
        sucursal,
        listaPrecio,
        soloLista: soloLista ? "1" : ""
      });
      if (!data.ok) throw new Error(data.error || "No se pudo generar la exportacion.");
      if (!Array.isArray(data.clientes) || !Array.isArray(data.compras)) {
        data = await exportDataByBranchFallback(desde, hasta, sucursal, listaPrecio, soloLista);
      }

      const clients = Array.isArray(data.clientes) ? data.clientes : [];
      const purchases = Array.isArray(data.compras) ? data.compras : [];
      if (!clients.length || !purchases.length) {
        window.alert("No se encontraron compras para esos filtros.");
        el.statusText.textContent = "Exportacion sin resultados.";
        return;
      }

      downloadExcelFile(clients, purchases, {
        prefix: "ventas_clientes_datos",
        filters: data.filtros || { desde, hasta, sucursal, listaPrecio, soloLista },
        meta: data.meta || {}
      });
      closeExportDataModal();
      el.statusText.textContent = `Export listo: ${formatNumber(clients.length)} clientes y ${formatNumber(purchases.length)} compras.`;
    } catch (error) {
      console.error(error);
      window.alert(error.message || "No se pudo exportar los datos.");
    } finally {
      setBusy(false);
      renderSelection();
    }
  }

  async function exportDataByBranchFallback(desde, hasta, sucursal, listaPrecio, soloLista) {
    const candidates = state.dashboard.clientes
      .filter((client) => (client.sucursales || []).some((branch) => sameBranch(branch, sucursal)));

    const selectedClients = [];
    const detailRows = [];
    let totalExportado = 0;
    let processed = 0;

    for (const client of candidates) {
      processed++;
      if (processed === 1 || processed % 25 === 0 || processed === candidates.length) {
        el.statusText.textContent = `Revisando historial ${processed}/${candidates.length} para ${sucursal}...`;
      }

      const data = await apiGet("cliente", { cliente: client.clienteId });
      const purchases = Array.isArray(data.compras) ? data.compras : [];
      const inRange = purchases.filter((purchase) => isDateInRange(purchase.fecha, desde, hasta));
      const passedByBranch = inRange.some((purchase) => {
        return sameBranch(purchase.sucursal, sucursal) && (!listaPrecio || samePriceList(purchase.listaPrecio, listaPrecio));
      });
      if (!passedByBranch) continue;

      selectedClients.push(client);
      const exportPurchases = soloLista && listaPrecio
        ? inRange.filter((purchase) => samePriceList(purchase.listaPrecio, listaPrecio))
        : inRange;

      exportPurchases.forEach((purchase) => {
        const total = Number(purchase.total || 0);
        totalExportado += total;
        detailRows.push({
          clienteId: client.clienteId,
          nombre: client.nombre || "",
          telefono: cleanPhone(client.telefono),
          telefonoMovil: cleanPhone(client.telefonoMovil),
          email: client.email || "",
          segmento: client.segmento || "",
          fecha: purchase.fecha || "",
          sucursal: purchase.sucursal || "",
          listaPrecio: purchase.listaPrecio || "",
          total
        });
      });
    }

    return {
      ok: true,
      filtros: { desde, hasta, sucursal, listaPrecio, soloLista },
      meta: {
        clientesBase: selectedClients.length,
        comprasExportadas: detailRows.length,
        totalExportado
      },
      clientes: selectedClients,
      compras: detailRows
    };
  }

  async function exportSelectedClients() {
    const selectedIds = Array.from(state.selectedClients);
    if (!selectedIds.length) {
      window.alert("Selecciona al menos un cliente para exportar.");
      return;
    }

    try {
      setBusy(true);
      el.statusText.textContent = `Preparando export de ${selectedIds.length} clientes...`;

      let exportData;
      try {
        exportData = await exportSelectedClientsViaApi(selectedIds);
      } catch (apiError) {
        console.warn("Export seleccion por API no disponible, usando fallback.", apiError);
        exportData = await exportSelectedClientsFallback(selectedIds);
      }

      const clients = Array.isArray(exportData.clientes) ? exportData.clientes : [];
      const detailRows = Array.isArray(exportData.compras) ? exportData.compras : [];

      downloadExcelFile(clients, detailRows, {
        prefix: "ventas_clientes_seleccion",
        filters: {
          listaPrecio: el.priceListFilter.value,
          soloLista: el.priceListOnly.checked
        },
        meta: exportData.meta || {}
      });
      el.statusText.textContent = `Export listo: ${clients.length} clientes seleccionados.`;
    } catch (error) {
      console.error(error);
      window.alert(error.message || "No se pudo exportar la seleccion.");
    } finally {
      setBusy(false);
      renderSelection();
    }
  }

  async function exportSelectedClientsViaApi(selectedIds) {
    const listaPrecio = el.priceListFilter.value;
    const soloLista = el.priceListOnly.checked;
    const chunkSize = 120;
    const chunks = [];
    for (let i = 0; i < selectedIds.length; i += chunkSize) {
      chunks.push(selectedIds.slice(i, i + chunkSize));
    }

    const out = {
      ok: true,
      meta: {
        clientesSolicitados: selectedIds.length,
        clientesExportados: 0,
        comprasExportadas: 0,
        totalExportado: 0
      },
      clientes: [],
      compras: []
    };
    const seenClients = new Set();

    for (let i = 0; i < chunks.length; i++) {
      el.statusText.textContent = `Exportando seleccion por tandas ${i + 1}/${chunks.length}...`;
      const data = await apiGet("exportar_seleccion", {
        clientes: chunks[i].join(","),
        listaPrecio,
        soloLista: soloLista ? "1" : ""
      });
      if (!data.ok) throw new Error(data.error || "No se pudo exportar la seleccion.");
      if (!Array.isArray(data.clientes) || !Array.isArray(data.compras)) {
        throw new Error("La API publicada todavia no tiene exportar_seleccion.");
      }

      data.clientes.forEach((client) => {
        if (!client?.clienteId || seenClients.has(client.clienteId)) return;
        seenClients.add(client.clienteId);
        out.clientes.push(client);
      });
      out.compras.push(...data.compras);
      out.meta.totalExportado += Number(data.meta?.totalExportado || sumPurchaseTotal(data.compras));
    }

    out.meta.clientesExportados = out.clientes.length;
    out.meta.comprasExportadas = out.compras.length;
    return out;
  }

  async function exportSelectedClientsFallback(selectedIds) {
    const listaPrecio = el.priceListFilter.value;
    const soloLista = el.priceListOnly.checked;
    const clients = [];
    const detailRows = [];
    for (let i = 0; i < selectedIds.length; i++) {
      const client = state.dashboard.clientes.find((item) => item.clienteId === selectedIds[i]);
      if (!client) continue;
      if (i === 0 || (i + 1) % 25 === 0 || i === selectedIds.length - 1) {
        el.statusText.textContent = `Exportando seleccion desde historial ${i + 1}/${selectedIds.length}...`;
      }
      const data = await apiGet("cliente", { cliente: client.clienteId });
      const purchases = Array.isArray(data.compras) ? data.compras : [];
      if (listaPrecio && !purchases.some((purchase) => samePriceList(purchase.listaPrecio, listaPrecio))) continue;

      const exportPurchases = soloLista && listaPrecio
        ? purchases.filter((purchase) => samePriceList(purchase.listaPrecio, listaPrecio))
        : purchases;
      if (!exportPurchases.length) continue;

      clients.push(client);
      exportPurchases.forEach((purchase) => {
        detailRows.push({
          clienteId: client.clienteId,
          nombre: client.nombre || "",
          telefono: cleanPhone(client.telefono),
          telefonoMovil: cleanPhone(client.telefonoMovil),
          email: client.email || "",
          segmento: client.segmento || "",
          fecha: purchase.fecha || "",
          sucursal: purchase.sucursal || "",
          listaPrecio: purchase.listaPrecio || "",
          total: Number(purchase.total || 0)
        });
      });
    }

    return {
      ok: true,
      meta: {
        clientesSolicitados: selectedIds.length,
        clientesExportados: clients.length,
        comprasExportadas: detailRows.length,
        totalExportado: sumPurchaseTotal(detailRows)
      },
      clientes: clients,
      compras: detailRows
    };
  }

  function downloadExcelFile(clients, purchases, options = {}) {
    if (!window.XLSX) {
      throw new Error("No se cargo la libreria para generar XLSX. Revisa la conexion a internet y volve a intentar.");
    }

    const summaryHeaders = [
      "Cliente ID", "Nombre", "Telefono", "Telefono movil", "Telefono principal", "Email", "Segmento", "Sucursales",
      "Listas", "Total historico", "Total periodo", "Ultimos 3 meses",
      "Anio base", "Primera compra", "Ultima compra", "Dias compra", "Frecuencia"
    ];
    const purchaseHeaders = [
      "Cliente ID", "Nombre", "Telefono", "Telefono movil", "Telefono principal", "Email", "Segmento", "Fecha",
      "Sucursal", "Lista precio", "Total"
    ];
    const filterHeaders = ["Filtro", "Valor"];
    const filters = options.filters || {};
    const meta = options.meta || {};
    const filterRows = [
      ["Tipo de exportacion", filters.sucursal ? "Clientes por sucursal y rango" : "Clientes seleccionados"],
      ["Sucursal base", filters.sucursal || "-"],
      ["Desde", filters.desde || "-"],
      ["Hasta", filters.hasta || "-"],
      ["Lista de precio", filters.listaPrecio || "-"],
      ["Solo esa lista", filters.soloLista ? "Si" : "No"],
      ["Clientes solicitados", meta.clientesSolicitados || clients.length],
      ["Clientes exportados", clients.length],
      ["Compras exportadas", purchases.length],
      ["Clientes que pasaron por sucursal", meta.clientesBase || "-"],
      ["Total compras exportadas", moneyText(meta.totalExportado || sumPurchaseTotal(purchases))],
      ["Generado", new Date().toISOString().slice(0, 19).replace("T", " ")]
    ];

    const summaryRows = clients.map((client) => [
      textCell(client.clienteId),
      textCell(client.nombre),
      textCell(cleanPhone(client.telefono)),
      textCell(cleanPhone(client.telefonoMovil)),
      textCell(formatPhone(client)),
      textCell(client.email),
      textCell(client.segmento),
      textCell(client.sucursalesTexto),
      textCell(client.listasTexto),
      moneyText(client.totalHistorico),
      moneyText(getPeriodTotal(client)),
      moneyText(client.totalUltimos3Meses),
      moneyText(client.totalAnioBase),
      textCell(client.primeraCompra),
      textCell(client.ultimaCompra),
      textCell(client.diasCompra),
      textCell(client.frecuenciaTexto)
    ]);

    const purchaseRows = purchases.map((row) => [
      textCell(row.clienteId),
      textCell(row.nombre),
      textCell(cleanPhone(row.telefono)),
      textCell(cleanPhone(row.telefonoMovil)),
      textCell(formatPhone(row)),
      textCell(row.email),
      textCell(row.segmento),
      textCell(row.fecha),
      textCell(row.sucursal),
      textCell(row.listaPrecio),
      moneyText(row.total)
    ]);

    const wb = XLSX.utils.book_new();
    const filtersSheet = XLSX.utils.aoa_to_sheet([filterHeaders, ...filterRows]);
    const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    const purchasesSheet = XLSX.utils.aoa_to_sheet([purchaseHeaders, ...purchaseRows]);

    forceSheetText(filtersSheet);
    forceSheetText(summarySheet);
    forceSheetText(purchasesSheet);
    setColumnWidths(filtersSheet, filterHeaders, filterRows);
    setColumnWidths(summarySheet, summaryHeaders, summaryRows);
    setColumnWidths(purchasesSheet, purchaseHeaders, purchaseRows);

    XLSX.utils.book_append_sheet(wb, filtersSheet, "Filtros");
    XLSX.utils.book_append_sheet(wb, summarySheet, "Clientes");
    XLSX.utils.book_append_sheet(wb, purchasesSheet, "Compras");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${options.prefix || "ventas_clientes"}_${stamp}.xlsx`, {
      bookType: "xlsx",
      compression: true,
      cellDates: false
    });
  }

  function sumPurchaseTotal(purchases) {
    return purchases.reduce((sum, row) => sum + Number(row.total || 0), 0);
  }

  function isDateInRange(value, desde, hasta) {
    const fecha = String(value || "").slice(0, 10);
    return fecha >= desde && fecha <= hasta;
  }

  function sameBranch(a, b) {
    return normalizeSearch(a) === normalizeSearch(b);
  }

  function samePriceList(a, b) {
    return normalizeSearch(a) === normalizeSearch(b);
  }

  function parseListText(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getClientLists(client) {
    if (Array.isArray(client.listas)) return client.listas.filter(Boolean);
    return parseListText(client.listasTexto);
  }

  function matchesPriceList(client, priceList, onlySelectedList) {
    if (!priceList) return true;
    const lists = getClientLists(client);
    const hasList = lists.some((list) => samePriceList(list, priceList));
    if (!hasList) return false;
    return !onlySelectedList || (lists.length === 1 && samePriceList(lists[0], priceList));
  }

  function forceSheetText(sheet) {
    Object.keys(sheet).forEach((key) => {
      if (key[0] === "!") return;
      sheet[key].t = "s";
      sheet[key].v = textCell(sheet[key].v);
      delete sheet[key].w;
      delete sheet[key].z;
    });
  }

  function setColumnWidths(sheet, headers, rows) {
    const widths = headers.map((header, index) => {
      const values = rows.map((row) => textCell(row[index]));
      const max = [header, ...values].reduce((acc, value) => Math.max(acc, textCell(value).length), 0);
      return { wch: Math.min(Math.max(max + 2, 12), 42) };
    });
    sheet["!cols"] = widths;
  }

  function textCell(value) {
    return String(value == null ? "" : value);
  }

  function moneyText(value) {
    return `$ ${new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(value || 0))}`;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatDateShort(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("es-AR").format(date);
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function formatPhone(client) {
    return cleanPhone(client.telefonoMovil) || cleanPhone(client.telefono) || "";
  }

  function cleanPhone(value) {
    const phone = String(value || "").trim();
    if (!phone || phone === "0") return "";
    return phone;
  }

  function formatMonth(value) {
    if (!value) return "-";
    const parts = String(value).split("-");
    if (parts.length !== 2) return value;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric" }).format(date);
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function segmentKey(segment) {
    const value = normalizeSearch(segment);
    if (value.includes("nuevo")) return "nuevo";
    if (value.includes("frecuente") && value.includes("alto")) return "frecuente-alto";
    if (value.includes("habitual")) return "habitual";
    if (value.includes("espaciado") && value.includes("alto")) return "espaciado-alto";
    if (value.includes("inactivo")) return "inactivo";
    return "base";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
