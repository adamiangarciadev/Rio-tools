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
    exportBtn: $("#exportBtn"),
    deselectAllBtn: $("#deselectAllBtn"),
    refreshBtn: $("#refreshBtn"),
    periodFilter: $("#periodFilter"),
    branchFilter: $("#branchFilter"),
    segmentFilter: $("#segmentFilter"),
    searchInput: $("#searchInput"),
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
    el.exportBtn.addEventListener("click", exportSelectedClients);
    el.deselectAllBtn.addEventListener("click", clearSelection);
    el.clearSelectionBtn.addEventListener("click", clearSelection);
    el.periodFilter.addEventListener("change", render);
    el.branchFilter.addEventListener("change", render);
    el.segmentFilter.addEventListener("change", render);
    el.searchInput.addEventListener("input", render);

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
    branches.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch;
      option.textContent = branch;
      el.branchFilter.appendChild(option);
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
    const q = normalizeSearch(el.searchInput.value);

    return state.dashboard.clientes
      .filter((client) => !branch || (client.sucursales || []).includes(branch))
      .filter((client) => !segment || client.segmento === segment)
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
    el.exportBtn.disabled = isBusy || state.selectedClients.size === 0;
    el.deselectAllBtn.disabled = isBusy || state.selectedClients.size === 0;
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

      const clients = selectedIds
        .map((id) => state.dashboard.clientes.find((client) => client.clienteId === id))
        .filter(Boolean);

      const detailRows = [];
      for (const client of clients) {
        const data = await apiGet("cliente", { cliente: client.clienteId });
        const purchases = Array.isArray(data.compras) ? data.compras : [];
        purchases.forEach((purchase) => {
          detailRows.push({
            clienteId: client.clienteId,
            nombre: client.nombre || "",
            telefono: formatPhone(client),
            email: client.email || "",
            segmento: client.segmento || "",
            fecha: purchase.fecha || "",
            sucursal: purchase.sucursal || "",
            listaPrecio: purchase.listaPrecio || "",
            total: Number(purchase.total || 0)
          });
        });
      }

      downloadExcelFile(clients, detailRows);
      el.statusText.textContent = `Export listo: ${clients.length} clientes seleccionados.`;
    } catch (error) {
      console.error(error);
      window.alert(error.message || "No se pudo exportar la seleccion.");
    } finally {
      setBusy(false);
      renderSelection();
    }
  }

  function downloadExcelFile(clients, purchases) {
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
    const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    const purchasesSheet = XLSX.utils.aoa_to_sheet([purchaseHeaders, ...purchaseRows]);

    forceSheetText(summarySheet);
    forceSheetText(purchasesSheet);
    setColumnWidths(summarySheet, summaryHeaders, summaryRows);
    setColumnWidths(purchasesSheet, purchaseHeaders, purchaseRows);

    XLSX.utils.book_append_sheet(wb, summarySheet, "Clientes");
    XLSX.utils.book_append_sheet(wb, purchasesSheet, "Compras");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ventas_clientes_seleccion_${stamp}.xlsx`, {
      bookType: "xlsx",
      compression: true,
      cellDates: false
    });
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
