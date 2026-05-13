;(() => {
  "use strict";

  const API_URL = window.PEDIDOS_DASHBOARD_API_URL || "";
  const NORMALIZATION = {
    sucursal: {
      AVELLANEDA: ["AVELLANEDA", "AVELL", "AV", "AV2", "AV 2"],
      QUILMES: ["QUILMES", "QUIlMES", "QLMES"],
      "EN SUCURSAL": ["SUCURSAL"]
    },
    usuario: {
      ENZO: [
        "ENZO",
        "E",
        "ENZO/GABRIELA",
        "ENZO/ANTONELLA",
        "ENZO RETIRO ANDREA ALVAREZ"
      ],
      FLORENCIA: [
        "FLORENCIA",
        "FLOR",
        "FLLREOCNI",
        "FEFE",
        "FLROENCIA",
        "FLORENICIA",
        "FLOENCIA",
        "FL0ORENCIA",
        "FLORENICA",
        "FLORENCUA",
        "FFLORENCIA",
        "FLORENCUIA",
        "FLORENCIAS",
        "FLORENICS",
        "FLORENMICIA",
        "FLORENCIOA",
        "FLORENCJIA"
      ],
      FRANCO: [
        "FRANCO"
      ],
      ROMINA: [
        "ROMINA",
        "ROMI",
        "ROM",
        "ROMINAROMINA"
      ],
      GABRIELA: [
        "GABRIELA",
        "GABI",
        "GABO"
      ],
      RODRIGO: [
        "RODRIGO",
        "RODRI"
      ],
      SOLEDAD: [
        "SOLEDAD",
        "SOLE",
        "SOLER",
        "SOLE/FLORENCIA"
      ]
    },
    estado: {
      "ESPERANDO MERCADERIA": ["ESPERANDO MERCA", "ESPERANDO MERCADERIA", "ESPERANDO MERCADERÍA"],
      "ESPERANDO PAGO": ["ESPERANDO PAGO"],
      "PARA ARMAR": ["PARA ARMAR"],
      "ARMANDO PEDIDO": ["ARMANDO PEDIDO", "ARMADO PEDIDO"],
      "PICKEADO/ARMADO": ["PICKEADO/ARMADO", "PICKEADO", "PICKED", "ARMADO", "ARMADO/PICKEADO"],
      "LISTO PARA RETIRO": ["LISTO PARA RETIRO", "LISTO RETIRO"],
      "ENVIADO": ["ENVIADO", "ENVIADO A SUCURSAL"],
      "RETIRADO": ["RETIRADO"],
      "EN SUCURSAL": ["EN SUCURSAL"]
    },
    tipoEnvio: {
      RETIRO: ["RETIRO", "RETIRA"],
      "ENVIO SHIPNOW": ["ENVIO SHIPNOW", "ENVÍO SHIPNOW", "SHIPNOW"],
      "ENVIO A SUCURSAL": ["ENVIO A SUCURSAL", "ENVÍO A SUCURSAL"]
    },
    web: {
      MINORISTA: ["MINORISTA", "MIN"],
      MAYORISTA: ["MAYORISTA", "MAY"]
    }
  };

  const USER_NOISE_VALUES = [
    "",
    ".",
    "..",
    "99",
    "117",
    "9999",
    "A",
    "ALEJANDRA LOCAL",
    "ANTONELLA LOPEZ",
    "COCO",
    "DAMIAN",
    "DAMIAN PRUEBA",
    "GISE LOCAL",
    "JOEL",
    "JOHA",
    "KARI",
    "KARINA SILVA",
    "LAURA LOCAL",
    "LOCAL",
    "LUCH",
    "LUCHI",
    "LUCCIANO",
    "LUCIANO",
    "PATO",
    "VC"
  ];

  const DONE_STATE_PATTERNS = [
    "PICKEADO",
    "ARMADO",
    "LISTO PARA RETIRO",
    "ENVIADO"
  ];

  const DEMO_ROWS = [
    {
      fecha: "27/01/2026 15:42:00",
      usuario: "romina",
      origen: "onEditManual",
      idPedido: "807",
      sucursal: "quilmes",
      estadoPrevio: "ESPERANDO PAGO",
      estadoActual: "PARA ARMAR",
      tipoEnvio: "retiro",
      web: "minorista",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "28/01/2026 9:20:00",
      usuario: "Romi",
      origen: "onEditManual",
      idPedido: "807",
      sucursal: "QUILMES",
      estadoPrevio: "PARA ARMAR",
      estadoActual: "PICKEADO/ARMADO",
      tipoEnvio: "RETIRO",
      web: "MINORISTA",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "28/01/2026 10:10:57",
      usuario: "ROMINA",
      origen: "onEditManual",
      idPedido: "807",
      sucursal: "QUILMES",
      estadoPrevio: "ARMANDO PEDIDO",
      estadoActual: "ENVIADO",
      tipoEnvio: "RETIRO",
      web: "MINORISTA",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "28/01/2026 9:47:00",
      usuario: "ROMINA",
      origen: "onEditManual",
      idPedido: "793",
      sucursal: "AVELLANEDA",
      estadoPrevio: "ARMANDO PEDIDO",
      estadoActual: "ENVIADO",
      tipoEnvio: "ENVIO SHIPNOW",
      web: "MINORISTA",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "27/01/2026 13:10:00",
      usuario: "FLORENCIA",
      origen: "onEditManual",
      idPedido: "812",
      sucursal: "Avellaneda",
      estadoPrevio: "ESPERANDO PAGO",
      estadoActual: "PARA ARMAR",
      tipoEnvio: "ENVÍO SHIPNOW",
      web: "MINORISTA",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "27/01/2026 16:38:21",
      usuario: "FLORENCIA",
      origen: "onEditManual",
      idPedido: "812",
      sucursal: "AVELLANEDA",
      estadoPrevio: "PARA ARMAR",
      estadoActual: "ARMANDO PEDIDO",
      tipoEnvio: "ENVIO SHIPNOW",
      web: "MINORISTA",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "27/01/2026 16:11:14",
      usuario: "ENZO",
      origen: "onEditManual",
      idPedido: "280",
      sucursal: "AVELLANEDA",
      estadoPrevio: "ESPERANDO MERCA",
      estadoActual: "PICKEADO/ARMADO",
      tipoEnvio: "ENVIO SHIPNOW",
      web: "MAYORISTA",
      detalle: "Cambio manual en Sheets"
    },
    {
      fecha: "27/01/2026 15:50:16",
      usuario: "ORIANA",
      origen: "onEditManual",
      idPedido: "751",
      sucursal: "QUILMES",
      estadoPrevio: "EN SUCURSAL",
      estadoActual: "RETIRADO",
      tipoEnvio: "RETIRO",
      web: "MINORISTA",
      detalle: "Cambio manual en Sheets"
    }
  ];

  const $ = (selector) => document.querySelector(selector);

  const el = {
    refreshBtn: $("#refreshBtn"),
    fromDate: $("#fromDate"),
    toDate: $("#toDate"),
    branchFilter: $("#branchFilter"),
    stateFilter: $("#stateFilter"),
    shippingFilter: $("#shippingFilter"),
    webFilter: $("#webFilter"),
    userFilter: $("#userFilter"),
    searchInput: $("#searchInput"),
    totalEvents: $("#totalEvents"),
    uniqueOrders: $("#uniqueOrders"),
    avgBuildTime: $("#avgBuildTime"),
    measuredOrders: $("#measuredOrders"),
    activityHint: $("#activityHint"),
    cycleHint: $("#cycleHint"),
    tableHint: $("#tableHint"),
    cycleTableHint: $("#cycleTableHint"),
    cycleChart: $("#cycleChart"),
    dailyChart: $("#dailyChart"),
    stateChart: $("#stateChart"),
    branchChart: $("#branchChart"),
    shippingChart: $("#shippingChart"),
    webChart: $("#webChart"),
    cycleTable: $("#cycleTable"),
    logTable: $("#logTable")
  };

  const state = {
    rows: [],
    loading: false,
    demo: false
  };

  init();

  function init() {
    el.refreshBtn.addEventListener("click", loadData);
    [el.fromDate, el.toDate, el.branchFilter, el.stateFilter, el.shippingFilter, el.webFilter, el.userFilter, el.searchInput]
      .forEach((node) => node.addEventListener("input", render));

    loadData();
  }

  async function loadData() {
    if (state.loading) return;

    try {
      state.loading = true;
      el.refreshBtn.disabled = true;
      el.refreshBtn.textContent = "Actualizando...";

      if (!API_URL || API_URL.includes("PEGAR_URL")) {
        state.rows = normalizeRows(DEMO_ROWS);
        state.demo = true;
      } else {
        const data = await fetchJson(`${API_URL}?accion=listar_log`);
        state.rows = normalizeRows(data.data || []);
        state.demo = false;
      }

      setupDateDefaults();
      fillFilters();
      render();
    } catch (error) {
      console.error(error);
      state.rows = [];
      renderEmpty(error.message || "No se pudo cargar Pedidos_LOG.");
    } finally {
      state.loading = false;
      el.refreshBtn.disabled = false;
      el.refreshBtn.textContent = "Actualizar";
    }
  }

  function render() {
    const rows = getFilteredRows();
    const sortedRows = [...rows].sort((a, b) => b.timestamp - a.timestamp);
    const cycles = buildOrderCycles(rows);
    const measuredDurations = cycles.map((cycle) => cycle.durationMs).filter((value) => value > 0);

    el.totalEvents.textContent = String(rows.length);
    el.uniqueOrders.textContent = String(new Set(rows.map((row) => row.idPedido).filter(Boolean)).size);
    el.avgBuildTime.textContent = measuredDurations.length ? formatDuration(avg(measuredDurations)) : "-";
    el.measuredOrders.textContent = String(cycles.length);

    el.activityHint.textContent = state.demo
      ? "Vista demo hasta configurar la API"
      : `${rows.length} cambios filtrados`;
    el.cycleHint.textContent = `${cycles.length} pedidos con ingreso y armado/pickeado detectados`;
    el.tableHint.textContent = `${sortedRows.length} movimientos visibles`;
    el.cycleTableHint.textContent = `${cycles.length} pedidos medidos`;

    renderCycleChart(cycles);
    renderDailyChart(rows);
    renderStackList(el.stateChart, countBy(rows, "estadoActual"), "estado");
    renderStackList(el.branchChart, countBy(rows, "sucursal"), "sucursal");
    renderStackList(el.shippingChart, countBy(rows, "tipoEnvio"), "envio");
    renderStackList(el.webChart, countBy(rows, "web"), "web");
    renderCycleTable(cycles);
    renderTable(sortedRows);
  }

  function renderEmpty(message) {
    [el.cycleChart, el.dailyChart, el.stateChart, el.branchChart, el.shippingChart, el.webChart].forEach((node) => {
      node.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    });
    el.cycleTable.innerHTML = `<tr><td colspan="6">${escapeHtml(message)}</td></tr>`;
    el.logTable.innerHTML = `<tr><td colspan="8">${escapeHtml(message)}</td></tr>`;
    el.totalEvents.textContent = "0";
    el.uniqueOrders.textContent = "0";
    el.avgBuildTime.textContent = "-";
    el.measuredOrders.textContent = "0";
  }

  function setupDateDefaults() {
    const dates = state.rows.map((row) => row.timestamp).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length || el.fromDate.value || el.toDate.value) return;

    el.fromDate.value = toInputDate(dates[0]);
    el.toDate.value = toInputDate(dates[dates.length - 1]);
  }

  function fillFilters() {
    fillSelect(el.branchFilter, uniqueValues(state.rows, "sucursal"), "Todas");
    fillSelect(el.stateFilter, uniqueValues(state.rows, "estadoActual"), "Todos");
    fillSelect(el.shippingFilter, uniqueValues(state.rows, "tipoEnvio"), "Todos");
    fillSelect(el.webFilter, uniqueValues(state.rows, "web"), "Todas");
    fillSelect(el.userFilter, uniqueValues(state.rows, "usuario"), "Todos");
  }

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = `<option value="">${allLabel}</option>`;
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = values.includes(current) ? current : "";
  }

  function getFilteredRows() {
    const from = el.fromDate.value ? new Date(`${el.fromDate.value}T00:00:00`).getTime() : 0;
    const to = el.toDate.value ? new Date(`${el.toDate.value}T23:59:59`).getTime() : Infinity;
    const query = normalizeText(el.searchInput.value);

    return state.rows
      .filter((row) => row.timestamp >= from && row.timestamp <= to)
      .filter((row) => !el.branchFilter.value || row.sucursal === el.branchFilter.value)
      .filter((row) => !el.stateFilter.value || row.estadoActual === el.stateFilter.value)
      .filter((row) => !el.shippingFilter.value || row.tipoEnvio === el.shippingFilter.value)
      .filter((row) => !el.webFilter.value || row.web === el.webFilter.value)
      .filter((row) => !el.userFilter.value || row.usuario === el.userFilter.value)
      .filter((row) => {
        if (!query) return true;
        return normalizeText([
          row.fecha,
          row.usuario,
          row.idPedido,
          row.sucursal,
          row.estadoPrevio,
          row.estadoActual,
          row.tipoEnvio,
          row.web,
          row.detalle
        ].join(" ")).includes(query);
      });
  }

  function renderDailyChart(rows) {
    const counts = countByDate(rows);
    const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const visibleEntries = entries.slice(-21);
    const max = Math.max(1, ...visibleEntries.map(([, value]) => value));

    if (!visibleEntries.length) {
      el.dailyChart.innerHTML = `<div class="empty-state">Sin movimientos para este filtro.</div>`;
      return;
    }

    el.dailyChart.innerHTML = visibleEntries.map(([dateKey, value]) => {
      const height = Math.max(6, Math.round((value / max) * 190));
      return `
        <div class="day-bar" title="${escapeAttr(dateKey)}: ${value}">
          <div class="day-bar__value">${value}</div>
          <div class="day-bar__bar" style="height:${height}px"></div>
          <div class="day-bar__label">${escapeHtml(dateKey.slice(5))}</div>
        </div>
      `;
    }).join("");
  }

  function renderCycleChart(cycles) {
    if (!cycles.length) {
      el.cycleChart.innerHTML = `<div class="empty-state">Todavia no hay pedidos con ingreso y armado/pickeado detectados.</div>`;
      return;
    }

    const byBranch = new Map();
    cycles.forEach((cycle) => {
      const key = cycle.sucursal || "-";
      if (!byBranch.has(key)) byBranch.set(key, []);
      byBranch.get(key).push(cycle.durationMs);
    });

    const entries = Array.from(byBranch.entries())
      .map(([branch, durations]) => ({
        branch,
        count: durations.length,
        avg: avg(durations),
        median: median(durations)
      }))
      .sort((a, b) => b.avg - a.avg);

    el.cycleChart.innerHTML = entries.map((item) => `
      <article class="cycle-card">
        <div>
          <h3>${escapeHtml(item.branch)}</h3>
          <p>${item.count} pedido${item.count === 1 ? "" : "s"} medido${item.count === 1 ? "" : "s"}</p>
        </div>
        <div class="cycle-card__time">${escapeHtml(formatDuration(item.avg))}</div>
        <div class="cycle-card__meta">Mediana ${escapeHtml(formatDuration(item.median))}</div>
      </article>
    `).join("");
  }

  function renderStackList(container, map, emptyLabel) {
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 9);
    const max = Math.max(1, ...entries.map(([, value]) => value));

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state">Sin datos por ${escapeHtml(emptyLabel)}.</div>`;
      return;
    }

    container.innerHTML = entries.map(([label, value]) => {
      const width = Math.max(3, Math.round((value / max) * 100));
      return `
        <div class="stack-row">
          <div class="stack-row__top">
            <span class="stack-row__label">${escapeHtml(label || "-")}</span>
            <span>${value}</span>
          </div>
          <div class="stack-row__track"><div class="stack-row__bar" style="width:${width}%"></div></div>
        </div>
      `;
    }).join("");
  }

  function renderTable(rows) {
    const visible = rows.slice(0, 350);

    if (!visible.length) {
      el.logTable.innerHTML = `<tr><td colspan="8">Sin movimientos para estos filtros.</td></tr>`;
      return;
    }

    el.logTable.innerHTML = visible.map((row) => `
      <tr>
        <td>${escapeHtml(row.fecha || "-")}</td>
        <td>${escapeHtml(row.idPedido || "-")}</td>
        <td>${escapeHtml(row.sucursal || "-")}</td>
        <td>${escapeHtml(row.estadoPrevio || "-")}</td>
        <td>${escapeHtml(row.estadoActual || "-")}</td>
        <td>${escapeHtml(row.tipoEnvio || "-")}</td>
        <td>${escapeHtml(row.web || "-")}</td>
        <td>${escapeHtml(row.usuario || "-")}</td>
      </tr>
    `).join("");
  }

  function renderCycleTable(cycles) {
    const visible = [...cycles].sort((a, b) => b.durationMs - a.durationMs).slice(0, 250);

    if (!visible.length) {
      el.cycleTable.innerHTML = `<tr><td colspan="6">Sin pedidos medidos para estos filtros.</td></tr>`;
      return;
    }

    el.cycleTable.innerHTML = visible.map((cycle) => `
      <tr>
        <td>${escapeHtml(cycle.idPedido || "-")}</td>
        <td>${escapeHtml(cycle.sucursal || "-")}</td>
        <td>${escapeHtml(cycle.startRow.fecha || "-")}</td>
        <td>${escapeHtml(cycle.doneRow.fecha || "-")}</td>
        <td>${escapeHtml(formatDuration(cycle.durationMs))}</td>
        <td>${escapeHtml(cycle.doneRow.estadoActual || "-")}</td>
      </tr>
    `).join("");
  }

  async function fetchJson(url) {
    const response = await fetch(url);
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

  function normalizeRows(rows) {
    return rows
      .map((row) => {
        const fecha = String(row.fecha || row.fechaHora || "").trim();
        const estadoPrevio = normalizeValue(row.estadoPrevio, "estado");
        const estadoActual = normalizeValue(row.estadoActual, "estado");
        return {
          fecha,
          timestamp: parseDate(fecha),
          usuario: normalizeUser(row.usuario || row.modificadoPor),
          origen: clean(row.origen || row.evento),
          idPedido: clean(row.idPedido || row.id),
          sucursal: normalizeValue(row.sucursal, "sucursal"),
          estadoPrevio,
          estadoActual,
          tipoEnvio: normalizeValue(row.tipoEnvio, "tipoEnvio"),
          web: normalizeValue(row.web, "web"),
          detalle: clean(row.detalle || row.comoSeModifico)
        };
      })
      .filter((row) => row.fecha || row.idPedido || row.sucursal)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  function buildOrderCycles(rows) {
    const byOrder = new Map();

    rows
      .filter((row) => row.idPedido && row.timestamp)
      .forEach((row) => {
        if (!byOrder.has(row.idPedido)) byOrder.set(row.idPedido, []);
        byOrder.get(row.idPedido).push(row);
      });

    const cycles = [];

    byOrder.forEach((items, idPedido) => {
      const ordered = [...items].sort((a, b) => a.timestamp - b.timestamp);
      const startRow = ordered[0];
      const doneRow = ordered.find(isBuildDoneRow);

      if (!startRow || !doneRow || doneRow.timestamp < startRow.timestamp) return;

      cycles.push({
        idPedido,
        sucursal: doneRow.sucursal || startRow.sucursal,
        startRow,
        doneRow,
        durationMs: doneRow.timestamp - startRow.timestamp
      });
    });

    return cycles;
  }

  function isBuildDoneRow(row) {
    const stateText = normalizeText(row.estadoActual);
    return DONE_STATE_PATTERNS.some((pattern) => stateText.includes(normalizeText(pattern)));
  }

  function countBy(rows, key) {
    const map = new Map();
    rows.forEach((row) => {
      const value = row[key] || "-";
      map.set(value, (map.get(value) || 0) + 1);
    });
    return map;
  }

  function countByDate(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = toInputDate(row.timestamp);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function uniqueValues(rows, key) {
    return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function parseDate(value) {
    const text = String(value || "").trim();
    let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, dd, mm, yyyy, hh, min, ss = "00"] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)).getTime();
    }
    match = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, dd, mm, yyyy, hh, min, ss = "00"] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)).getTime();
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function toInputDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatShortDate(timestamp) {
    if (!timestamp) return "-";
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return "-";
    const totalMinutes = Math.round(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function avg(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function normalizeValue(value, type) {
    const raw = clean(value);
    if (!raw) return "";

    const normalized = normalizeText(raw);
    const dictionary = NORMALIZATION[type] || {};
    const canonical = Object.keys(dictionary).find((key) => (
      dictionary[key].some((variant) => normalizeText(variant) === normalized)
    ));

    if (canonical) return canonical;
    return raw.toUpperCase().replace(/\s+/g, " ");
  }

  function normalizeUser(value) {
    const raw = clean(value);
    if (!raw) return "OTROS";

    const normalized = normalizeText(raw);
    const dictionary = NORMALIZATION.usuario;
    const canonical = Object.keys(dictionary).find((key) => (
      dictionary[key].some((variant) => normalizeText(variant) === normalized)
    ));

    if (canonical) return canonical;
    if (USER_NOISE_VALUES.some((item) => normalizeText(item) === normalized)) return "OTROS";

    const florenciaScore = similarity(normalized, normalizeText("FLORENCIA"));
    const rominaScore = similarity(normalized, normalizeText("ROMINA"));
    const gabrielaScore = similarity(normalized, normalizeText("GABRIELA"));

    if (florenciaScore >= 0.74) return "FLORENCIA";
    if (rominaScore >= 0.78) return "ROMINA";
    if (gabrielaScore >= 0.78) return "GABRIELA";

    return "OTROS";
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    const distance = levenshtein(a, b);
    return 1 - (distance / Math.max(a.length, b.length));
  }

  function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[a.length][b.length];
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
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
