;(() => {
  "use strict";

  const API_URL = window.PEDIDOS_DASHBOARD_API_URL || "";
  const PADRON_URL = "../../data/ASISTENCIA_RIO%20-%20PADRON.csv";
  const USER_CANONICAL_LEGAJO = {
    FLORENCIA: "124"
  };
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
        "ENZOP",
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
        ,"F,ORENCIA", "FDLOR", "FLKLR", "FLKOR", "FLLOR", "FLOERNCIA",
        "FLOORENCIA", "FLOPR", "FLOPRENCIA", "FLORCHU", "FLORECIA",
        "FLOREMNCIA", "FLORENC9IA", "FLORENCA", "FLORENCCIA", "FLORENCIAA",
        "FLORENCIAI", "FLORENCIIA", "FLORENCISA", "FLORENCIUA", "FLORENCOA",
        "FLORENXIA", "FLOREWNCIA", "FLORFENCIA", "FOLRENCIA", "FORENCIA",
        "LFOR", "FOR"
      ],
      FRANCO: [
        "FRANCO", "FRNACO", "FRSNCO"
      ],
      ROMINA: [
        "ROMINA",
        "ROMI",
        "ROM",
        "ROMINAROMINA",
        "ROMINS"
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
        "SOL",
        "SOLER",
        "SOOLE"
      ],
      ANGEL: ["ANGEL", "ANGEL, A MANO ESTA ANOTADO COMO 2285"],
      ALEJANDRA: ["ALEJANDRA", "ALEJANDRA (LOCAL)"],
      ANTONELLA: ["ANTONELLA LOPEZ"],
      BRENDA: ["BRE", "BREN", "BRENDA", "BRENDA GARCIA"],
      ERIKA: ["ERICA", "ERIKA"],
      GISEL: ["GISE", "GISE LOCAL"],
      JOEL: ["JOEL"],
      JOHA: ["JOHA"],
      KARINA: ["KARI", "KARINA", "KARINA SILVA"],
      LUCIANO: ["LUCCIANO", "LUCHI", "LUCIANO", "LUCIANO."],
      MAYRA: ["MAIRA", "MAITA", "MAYRA", "MIARA"],
      MATIAS: ["MATI", "MATIAAS", "MATIAS", "MATIASS", "MATIASSD", "MATII"],
      NICOLE: ["NIC0LE", "NICOLE", "NICOOLE"],
      ORIANA: ["ORIANA"],
      PATRICIA: ["PATRICIA ROMERO"],
      SELENA: ["SELENA"],
      VERONICA: ["VERONICA"]
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

  const DONE_STATE_PATTERNS = [
    "PICKEADO"
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
    userChart: $("#userChart"),
    cycleTable: $("#cycleTable"),
    logTable: $("#logTable")
  };

  const state = {
    rows: [],
    padron: [],
    loading: false,
    demo: false
  };

  Promise.resolve(window.PEDIDOS_DASHBOARD_ACCESS).then(init);

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
        state.padron = await loadLocalPadron();
        state.rows = normalizeRows(DEMO_ROWS);
        state.demo = true;
      } else {
        const data = await fetchJson(`${API_URL}?accion=listar_log`);
        state.padron = Array.isArray(data.padron) ? data.padron : await loadLocalPadron();
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
    el.cycleHint.textContent = `${cycles.length} pedidos con ingreso y pickeado/armado detectados`;
    el.tableHint.textContent = `${sortedRows.length} movimientos visibles`;
    el.cycleTableHint.textContent = `${cycles.length} pedidos medidos`;

    renderCycleChart(cycles);
    renderDailyChart(rows);
    renderStackList(el.stateChart, countBy(rows, "estadoActual"), "estado");
    renderStackList(el.branchChart, countBy(rows, "sucursal"), "sucursal");
    renderStackList(el.shippingChart, countBy(rows, "tipoEnvio"), "envio");
    renderStackList(el.webChart, countBy(rows, "web"), "web");
    renderStackList(el.userChart, countBy(rows, "usuario"), "usuario");
    renderCycleTable(cycles);
    renderTable(sortedRows);
  }

  function renderEmpty(message) {
    [el.cycleChart, el.dailyChart, el.stateChart, el.branchChart, el.shippingChart, el.webChart, el.userChart].forEach((node) => {
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
    if (el.fromDate.value || el.toDate.value) return;
    const now = new Date();
    el.fromDate.value = toInputDate(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
    el.toDate.value = toInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime());
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

    return getRowsUntilPicked(state.rows)
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

  function getRowsUntilPicked(rows) {
    const firstPickedByOrder = new Map();

    rows.forEach((row) => {
      if (!row.idPedido || !row.timestamp || !isBuildDoneRow(row)) return;
      const current = firstPickedByOrder.get(row.idPedido);
      if (!current || row.timestamp < current) firstPickedByOrder.set(row.idPedido, row.timestamp);
    });

    return rows.filter((row) => {
      if (normalizeText(row.estadoActual) === normalizeText("RETIRADO")) return false;
      const pickedAt = firstPickedByOrder.get(row.idPedido);
      return !pickedAt || !row.timestamp || row.timestamp <= pickedAt;
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
      el.cycleChart.innerHTML = `<div class="empty-state">Todavia no hay pedidos con ingreso y pickeado/armado detectados.</div>`;
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
        const normalizedRow = {
          fecha,
          timestamp: parseDate(fecha),
          origen: clean(row.origen || row.evento),
          idPedido: clean(row.idPedido || row.id),
          sucursal: normalizeValue(row.sucursal, "sucursal"),
          estadoPrevio,
          estadoActual,
          tipoEnvio: normalizeValue(row.tipoEnvio, "tipoEnvio"),
          web: normalizeValue(row.web, "web"),
          detalle: clean(row.detalle || row.comoSeModifico)
        };
        normalizedRow.usuario = resolveUser(row.usuario || row.modificadoPor, normalizedRow);
        return normalizedRow;
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

  function resolveUser(value, row = {}) {
    const raw = clean(value);
    if (!raw) return "SIN IDENTIFICAR";
    const byId = state.padron.find((person) => clean(person.vendedor_id) === raw);
    if (byId) return formatPadronUser(byId);

    const normalized = normalizeText(raw);
    const dictionary = NORMALIZATION.usuario;
    const canonical = Object.keys(dictionary).find((key) => (
      dictionary[key].some((variant) => normalizeText(variant) === normalized)
    ));

    if (canonical === "SOLEDAD") return resolveSoledad(row);

    const forcedLegajo = canonical && USER_CANONICAL_LEGAJO[canonical];
    const forcedPerson = forcedLegajo && state.padron.find((person) => clean(person.vendedor_id) === forcedLegajo);
    if (forcedPerson) return formatPadronUser(forcedPerson);

    const exactName = state.padron.find((person) => normalizeText(person.apellido_nombre) === normalized);
    if (exactName) return formatPadronUser(exactName);

    const lookupName = canonical || raw;
    const candidates = state.padron.filter((person) => {
      const name = normalizeText(person.apellido_nombre);
      const wanted = normalizeText(lookupName);
      return name === wanted || name.startsWith(`${wanted} `);
    });
    const webCandidate = candidates.find((person) => normalizeText(person.sucursal_base) === "web");
    if (webCandidate) return formatPadronUser(webCandidate);
    if (candidates.length === 1) return formatPadronUser(candidates[0]);

    return "UNKNOWN";
  }

  function resolveSoledad(row) {
    const movement = normalizeText([
      row.estadoPrevio,
      row.estadoActual,
      row.sucursal,
      row.detalle
    ].join(" "));
    const isReceivedAtBranch = movement.includes("recibido en sucursal");
    const isRetiredFromCorrientes = movement.includes("corrientes") && (
      movement.includes("retirado") || movement.includes("retiro")
    );

    if (isReceivedAtBranch || isRetiredFromCorrientes) {
      const sierra = state.padron.find((person) => clean(person.vendedor_id) === "186");
      return sierra ? formatPadronUser(sierra) : "SOLEDAD SIERRA (#186)";
    }

    const ayala = state.padron.find((person) => normalizeText(person.apellido_nombre) === "soledad ayala");
    return ayala ? formatPadronUser(ayala) : "SOLEDAD AYALA";
  }

  function formatPadronUser(person) {
    const legajo = clean(person.vendedor_id);
    return legajo ? `${clean(person.apellido_nombre)} (#${legajo})` : clean(person.apellido_nombre);
  }

  async function loadLocalPadron() {
    try {
      const response = await fetch(PADRON_URL, { cache: "no-store" });
      if (!response.ok) return [];
      return parseCsv(await response.text());
    } catch (error) {
      console.warn("No se pudo cargar el padron local", error);
      return [];
    }
  }

  function parseCsv(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      return headers.reduce((row, header, index) => {
        row[header.trim()] = clean(values[index]);
        return row;
      }, {});
    });
  }

  function splitCsvLine(line) {
    const values = [];
    let value = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        values.push(value);
        value = "";
      } else value += char;
    }
    values.push(value);
    return values;
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
