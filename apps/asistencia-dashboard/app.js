;(() => {
  "use strict";

  const API_URL = window.ASISTENCIA_DASHBOARD_API_URL || "";
  const LATE_TOLERANCE_MINUTES = 5;
  const HOLIDAY_OPEN_TIME = "09:00";
  const EXCLUDED_BRANCHES = new Set(["MORENO", "ADMINISTRACION", "DEPOSITO", "-"]);
  const BRANCH_ALIASES = {
    CORREINTES: "CORRIENTES",
    CORRIENTE: "CORRIENTES",
    NAZCAS: "NAZCA",
    NAZCA: "NAZCA"
  };
  const EXCLUDED_ROLES = new Set(["ADMINISTRACION", "SUPERVISOR"]);
  const DEMO_EVENTS = [
    { fecha: "2026-05-01", sucursal: "WEB", vendedor_id: "101", vendedor_nombre: "ROMINA", tipo_evento: "ENTRADA", hora_declarada: "09:01", observacion: "" },
    { fecha: "2026-05-01", sucursal: "AVELLANEDA", vendedor_id: "102", vendedor_nombre: "FLORENCIA", tipo_evento: "ENTRADA", hora_declarada: "08:18", observacion: "tarde" },
    { fecha: "2026-05-02", sucursal: "QUILMES", vendedor_id: "201", vendedor_nombre: "ENZO", tipo_evento: "FALTA", hora_declarada: "", observacion: "" },
    { fecha: "2026-05-02", sucursal: "QUILMES", vendedor_id: "202", vendedor_nombre: "SOLEDAD", tipo_evento: "ENTRADA", hora_declarada: "09:03", observacion: "" },
    { fecha: "2026-05-04", sucursal: "SARMIENTO", vendedor_id: "301", vendedor_nombre: "RODRIGO", tipo_evento: "ENTRADA", hora_declarada: "08:42", observacion: "" },
    { fecha: "2026-05-04", sucursal: "SARMIENTO", vendedor_id: "302", vendedor_nombre: "GABRIELA", tipo_evento: "FALTA", hora_declarada: "", observacion: "" }
  ];
  const DEMO_PADRON = [
    { vendedor_id: "101", apellido_nombre: "ROMINA", sucursal_base: "WEB", rol: "WEB", horario_teorico_entrada: "09:00" },
    { vendedor_id: "102", apellido_nombre: "FLORENCIA", sucursal_base: "AVELLANEDA", rol: "VENDEDOR", horario_teorico_entrada: "" },
    { vendedor_id: "201", apellido_nombre: "ENZO", sucursal_base: "QUILMES", rol: "VENDEDOR", horario_teorico_entrada: "" },
    { vendedor_id: "202", apellido_nombre: "SOLEDAD", sucursal_base: "QUILMES", rol: "CAJA", horario_teorico_entrada: "" },
    { vendedor_id: "301", apellido_nombre: "RODRIGO", sucursal_base: "SARMIENTO", rol: "ENCARGADO", horario_teorico_entrada: "" },
    { vendedor_id: "302", apellido_nombre: "GABRIELA", sucursal_base: "SARMIENTO", rol: "VENDEDOR", horario_teorico_entrada: "" }
  ];
  const DEMO_BRANCHES = [
    { sucursal: "AVELLANEDA", horario_apertura: "08:00" },
    { sucursal: "QUILMES", horario_apertura: "09:00" },
    { sucursal: "SARMIENTO", horario_apertura: "08:30" },
    { sucursal: "WEB", horario_apertura: "08:00" }
  ];

  const $ = (selector) => document.querySelector(selector);

  const el = {
    refreshBtn: $("#refreshBtn"),
    periodFilter: $("#periodFilter"),
    monthInput: $("#monthInput"),
    branchFilter: $("#branchFilter"),
    employeeFilter: $("#employeeFilter"),
    searchInput: $("#searchInput"),
    expectedCount: $("#eventsCount"),
    absencesCount: $("#absencesCount"),
    lateCount: $("#lateCount"),
    missingCount: $("#missingCount"),
    branchHint: $("#branchHint"),
    branchScoreList: $("#branchScoreList"),
    branchAbsencesList: $("#branchAbsencesList"),
    branchLateList: $("#branchLateList"),
    employeeAbsencesList: $("#employeeAbsencesList"),
    employeeLateList: $("#employeeLateList"),
    employeeHistoryHint: $("#employeeHistoryHint"),
    employeeHistory: $("#employeeHistory"),
    tableHint: $("#tableHint"),
    eventsTable: $("#eventsTable")
  };

  const state = {
    events: [],
    employees: [],
    branches: [],
    holidays: [],
    expectedRows: [],
    demo: false,
    loading: false
  };

  init();

  function init() {
    el.refreshBtn.addEventListener("click", loadData);
    el.periodFilter.addEventListener("input", () => {
      updatePeriodControls();
      loadData();
    });
    el.monthInput.addEventListener("input", () => {
      if (el.periodFilter.value === "month") loadData();
    });
    [el.branchFilter, el.employeeFilter, el.searchInput].forEach((node) => {
      node.addEventListener("input", render);
    });

    el.monthInput.value = currentMonthValue();
    updatePeriodControls();
    loadData();
  }

  async function loadData() {
    if (state.loading) return;

    try {
      state.loading = true;
      el.refreshBtn.disabled = true;
      el.refreshBtn.textContent = "Actualizando...";

      if (!API_URL || API_URL.includes("PEGAR_URL")) {
        state.events = normalizeEvents(DEMO_EVENTS);
        state.employees = normalizeEmployees(DEMO_PADRON);
        state.branches = normalizeBranches(DEMO_BRANCHES);
        state.holidays = [];
        state.demo = true;
      } else {
        const data = await fetchDashboardData();
        state.events = normalizeEvents(data.events);
        state.employees = normalizeEmployees(data.padron);
        state.branches = normalizeBranches(data.sucursales);
        state.holidays = normalizeHolidays(data.feriados);
        state.demo = false;
      }

      fillFilters();
      render();
    } catch (error) {
      console.error(error);
      state.events = [];
      state.employees = [];
      state.branches = [];
      state.holidays = [];
      state.expectedRows = [];
      renderEmpty(error.message || "No se pudo cargar asistencia.");
    } finally {
      state.loading = false;
      el.refreshBtn.disabled = false;
      el.refreshBtn.textContent = "Actualizar";
    }
  }

  function render() {
    const periodDays = getPeriodWorkingDays();
    state.expectedRows = buildExpectedRows(periodDays);
    const rows = getFilteredRows();
    const branchStats = buildBranchStats(rows);
    const employeeStats = buildEmployeeStats(rows);
    const totals = buildTotals(rows);

    el.expectedCount.textContent = String(periodDays.length);
    el.absencesCount.textContent = String(totals.absences);
    el.lateCount.textContent = String(totals.late);
    el.missingCount.textContent = String(totals.missing);

    el.branchHint.textContent = state.demo
      ? "Vista demo hasta configurar la API"
      : `${branchStats.length} locales filtrados - ${totals.expected} jornadas esperadas`;
    el.employeeHistoryHint.textContent = el.employeeFilter.value
      ? "Ultimos 30 dias del empleado seleccionado."
      : "Resumen de empleados con actividad esperada en los ultimos 30 dias.";
    el.tableHint.textContent = `${rows.length} jornadas visibles`;

    renderBranchScores(branchStats);
    renderRankList(el.branchAbsencesList, branchStats, "absences", "faltas");
    renderRankList(el.branchLateList, branchStats, "late", "tardes");
    renderRankList(el.employeeAbsencesList, employeeStats, "absences", "faltas");
    renderRankList(el.employeeLateList, employeeStats, "late", "tardes");
    renderHistory(rows, employeeStats);
    renderTable(rows);
  }

  function updatePeriodControls() {
    const monthMode = el.periodFilter.value === "month";
    el.monthInput.disabled = !monthMode;
    el.monthInput.parentElement.classList.toggle("is-disabled", !monthMode);
  }

  async function fetchDashboardData() {
    const months = monthsForCurrentPeriod();
    const responses = await Promise.all(months.map((month) => {
      return fetchJson(`${API_URL}?accion=listar_asistencia&mes=${encodeURIComponent(month)}`);
    }));

    return {
      events: responses.flatMap((data) => data.data || data.items || []),
      padron: responses[0]?.padron || [],
      sucursales: responses[0]?.sucursales || [],
      feriados: uniqueByDate(responses.flatMap((data) => data.feriados || []))
    };
  }

  function renderEmpty(message) {
    [el.branchScoreList, el.branchAbsencesList, el.branchLateList, el.employeeAbsencesList, el.employeeLateList, el.employeeHistory].forEach((node) => {
      node.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    });
    el.eventsTable.innerHTML = `<tr><td colspan="8">${escapeHtml(message)}</td></tr>`;
    el.expectedCount.textContent = "0";
    el.absencesCount.textContent = "0";
    el.lateCount.textContent = "0";
    el.missingCount.textContent = "0";
  }

  function fillFilters() {
    const branchValues = uniqueValues(state.employees, "sucursal").concat(uniqueValues(state.events, "sucursal"));
    const employeeValues = uniqueValues(state.employees, "empleadoLabel").concat(uniqueValues(state.events, "empleadoLabel"));
    fillSelect(el.branchFilter, uniqueSorted(branchValues), "Todos");
    fillSelect(el.employeeFilter, uniqueSorted(employeeValues), "Todos");
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
    const query = normalizeText(el.searchInput.value);

    return state.expectedRows
      .filter((row) => !el.branchFilter.value || row.sucursal === el.branchFilter.value)
      .filter((row) => !el.employeeFilter.value || row.empleadoLabel === el.employeeFilter.value)
      .filter((row) => {
        if (!query) return true;
        return normalizeText([
          row.fecha,
          row.sucursal,
          row.vendedorId,
          row.vendedorNombre,
          row.statusLabel,
          row.hora,
          row.expectedTime,
          row.observacion
        ].join(" ")).includes(query);
      })
      .sort((a, b) => b.timestamp - a.timestamp || a.empleadoLabel.localeCompare(b.empleadoLabel));
  }

  function buildExpectedRows(days) {
    const branchSchedule = buildBranchScheduleMap(state.branches);
    const holidaySet = new Set(state.holidays.map((holiday) => holiday.fecha).filter(Boolean));
    const eventMap = groupEventsByEmployeeAndDay(state.events);
    const employees = state.employees.length ? state.employees : inferEmployeesFromEvents();

    return employees.flatMap((employee) => {
      if (!employee.vendedorId && !employee.vendedorNombre) return [];

      return days.map((day) => {
        const key = employeeDayKey(employee, day.dateKey);
        const events = eventMap.get(key) || [];
        const eventBranch = getRecordBranch(events);
        const holiday = holidaySet.has(day.dateKey);
        const defaultTime = holiday ? HOLIDAY_OPEN_TIME : (getBranchSchedule(branchSchedule, eventBranch) || HOLIDAY_OPEN_TIME);
        const expectedTime = normalizeTime(employee.horarioEntrada) || defaultTime;
        return buildExpectedRecord(employee, day, expectedTime, holiday, events, eventBranch);
      });
    });
  }

  function buildExpectedRecord(employee, day, expectedTime, holiday, events, eventBranch) {
    const absence = events.find(isAbsence);
    const entries = events.filter(isPresent).sort((a, b) => timeToMinutes(a.hora) - timeToMinutes(b.hora));
    const firstEntry = entries[0];
    const fallback = events[0];
    let status = "missing";
    let statusLabel = "SIN REGISTRO";
    let hora = "";
    let observacion = "";

    if (absence) {
      status = "absent";
      statusLabel = "FALTA";
      hora = absence.hora;
      observacion = absence.observacion;
    } else if (firstEntry) {
      hora = firstEntry.hora;
      observacion = firstEntry.observacion;
      if (isLateAgainst(firstEntry, expectedTime)) {
        status = "late";
        statusLabel = "LLEGADA TARDE";
      } else {
        status = "onTime";
        statusLabel = "A HORARIO";
      }
    } else if (fallback) {
      status = "other";
      statusLabel = fallback.tipoEvento || "EVENTO";
      hora = fallback.hora;
      observacion = fallback.observacion;
    }

    return {
      fecha: day.label,
      dateKey: day.dateKey,
      timestamp: day.timestamp,
      month: monthKey(day.timestamp),
      sucursal: eventBranch,
      vendedorId: employee.vendedorId,
      vendedorNombre: employee.vendedorNombre,
      empleadoLabel: employee.empleadoLabel,
      rol: employee.rol,
      expectedTime,
      holiday,
      events,
      status,
      statusLabel,
      hora,
      observacion
    };
  }

  function groupEventsByEmployeeAndDay(events) {
    const map = new Map();
    events.forEach((event) => {
      const key = employeeDayKey(event, event.dateKey);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    });
    return map;
  }

  function getRecordBranch(events) {
    const event = events.find((item) => item.sucursal);
    return event ? event.sucursal : "";
  }

  function buildBranchScheduleMap(branches) {
    const map = new Map();
    branches.forEach((branch) => {
      branchScheduleKeys(branch.sucursal).forEach((key) => {
        map.set(key, branch.horarioApertura);
      });
    });
    return map;
  }

  function getBranchSchedule(map, sucursal) {
    const keys = branchScheduleKeys(sucursal);
    for (const key of keys) {
      if (map.has(key)) return map.get(key);
    }
    return "";
  }

  function branchScheduleKeys(sucursal) {
    const name = normalizeName(sucursal);
    const plain = normalizeText(name).toUpperCase();
    const keys = [name, plain];
    if (plain === "AVELLANEDA") keys.push("AV2");
    if (plain === "AV2") keys.push("AVELLANEDA");
    return Array.from(new Set(keys.filter(Boolean)));
  }

  function isExcludedBranch(sucursal) {
    const name = normalizeName(sucursal);
    return !name || EXCLUDED_BRANCHES.has(name);
  }

  function employeeDayKey(row, dateValue) {
    const employeeKey = row.vendedorId
      ? `id:${row.vendedorId}`
      : `name:${normalizeText(row.vendedorNombre)}`;
    return `${dateValue}|${employeeKey}`;
  }

  function buildTotals(rows) {
    return rows.reduce((acc, row) => {
      acc.expected += 1;
      if (row.status === "absent") acc.absences += 1;
      else if (row.status === "late") {
        acc.present += 1;
        acc.late += 1;
      } else if (row.status === "onTime") {
        acc.present += 1;
        acc.onTime += 1;
      } else if (row.status === "missing") acc.missing += 1;
      else acc.other += 1;
      return acc;
    }, createTotals());
  }

  function buildBranchStats(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!row.sucursal) return;
      const key = row.sucursal;
      if (!map.has(key)) map.set(key, createStats(key));
      applyExpectedStats(map.get(key), row);
    });
    return Array.from(map.values()).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  function buildEmployeeStats(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.empleadoLabel || "-";
      if (!map.has(key)) map.set(key, createStats(key, row.sucursal));
      applyExpectedStats(map.get(key), row);
    });
    return Array.from(map.values()).sort((a, b) => b.absences - a.absences || b.late - a.late || b.missing - a.missing || a.label.localeCompare(b.label));
  }

  function createTotals() {
    return {
      expected: 0,
      present: 0,
      onTime: 0,
      late: 0,
      absences: 0,
      missing: 0,
      other: 0
    };
  }

  function createStats(label, sub = "") {
    return {
      label,
      sub,
      ...createTotals(),
      score: 0
    };
  }

  function applyExpectedStats(stats, row) {
    stats.expected += 1;

    if (row.status === "absent") stats.absences += 1;
    else if (row.status === "late") {
      stats.present += 1;
      stats.late += 1;
    } else if (row.status === "onTime") {
      stats.present += 1;
      stats.onTime += 1;
    } else if (row.status === "missing") stats.missing += 1;
    else stats.other += 1;

    const attendanceRate = stats.expected ? stats.present / stats.expected : 0;
    stats.score = Math.round((attendanceRate * 100) - (stats.late * 3) - (stats.absences * 8) - (stats.missing * 6));
  }

  function renderBranchScores(items) {
    if (!items.length) {
      el.branchScoreList.innerHTML = `<div class="empty-state">Sin locales para este filtro.</div>`;
      return;
    }

    const best = [...items].sort((a, b) => b.score - a.score).slice(0, 1)[0];
    const worst = [...items].sort((a, b) => a.score - b.score).slice(0, 1)[0];

    el.branchScoreList.innerHTML = items.map((item) => {
      const rate = item.expected ? `${Math.round((item.present / item.expected) * 100)}%` : "-";
      const tag = item.label === best?.label ? "Mejor" : item.label === worst?.label ? "Peor" : "";
      return `
        <article class="branch-score">
          <strong>${escapeHtml(item.label)} ${tag ? `<span class="state ready">${tag}</span>` : ""}</strong>
          <div class="metric"><span>Asistencia</span><b>${rate}</b></div>
          <div class="metric danger"><span>Faltas</span><b>${item.absences}</b></div>
          <div class="metric warn"><span>Tardes</span><b>${item.late}</b></div>
          <div class="metric danger"><span>Sin registro</span><b>${item.missing}</b></div>
        </article>
      `;
    }).join("");
  }

  function renderRankList(container, items, key, suffix) {
    const visible = [...items].filter((item) => item[key] > 0).sort((a, b) => b[key] - a[key] || a.label.localeCompare(b.label)).slice(0, 8);

    if (!visible.length) {
      container.innerHTML = `<div class="empty-state">Sin ${escapeHtml(suffix)} para este filtro.</div>`;
      return;
    }

    container.innerHTML = visible.map((item) => `
      <div class="rank-row">
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          ${item.sub ? `<span>${escapeHtml(item.sub)}</span>` : ""}
        </div>
        <b>${item[key]} ${escapeHtml(suffix)}</b>
      </div>
    `).join("");
  }

  function renderHistory(rows, employeeStats) {
    const days = workingDaysLast30();
    const selected = el.employeeFilter.value;
    const employees = selected
      ? employeeStats.filter((item) => item.label === selected)
      : employeeStats.slice(0, 10);

    if (!employees.length) {
      el.employeeHistory.innerHTML = `<div class="empty-state">Sin empleados para mostrar.</div>`;
      return;
    }

    el.employeeHistory.innerHTML = employees.map((employee) => {
      const employeeRows = rows.filter((row) => row.empleadoLabel === employee.label);
      return `
        <article class="history-card">
          <div class="history-card__top">
            <div>
              <h3>${escapeHtml(employee.label)}</h3>
              <p>${employee.absences} faltas - ${employee.late} tardes - ${employee.missing} sin registro</p>
            </div>
          </div>
          <div class="days-strip">
            ${days.map((day) => renderDayDot(day.timestamp, employeeRows)).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderDayDot(day, rows) {
    const key = dateKey(day);
    const row = rows.find((item) => item.dateKey === key);
    let cls = "";
    let title = `${formatDate(day)}: sin jornada esperada`;

    if (row?.status === "absent") {
      cls = "absent";
      title = `${formatDate(day)}: falta`;
    } else if (row?.status === "late") {
      cls = "late";
      title = `${formatDate(day)}: llegada tarde`;
    } else if (row?.status === "onTime") {
      cls = "ok";
      title = `${formatDate(day)}: a horario`;
    } else if (row?.status === "missing") {
      cls = "missing";
      title = `${formatDate(day)}: sin registro`;
    } else if (row) {
      cls = "other";
      title = `${formatDate(day)}: otro evento`;
    }

    return `<span class="day-dot ${cls}" title="${escapeAttr(title)}"></span>`;
  }

  function renderTable(rows) {
    const visible = rows.slice(0, 500);

    if (!visible.length) {
      el.eventsTable.innerHTML = `<tr><td colspan="8">Sin jornadas para estos filtros.</td></tr>`;
      return;
    }

    el.eventsTable.innerHTML = visible.map((row) => `
      <tr>
        <td>${escapeHtml(row.fecha || "-")}</td>
        <td>${escapeHtml(row.sucursal || "-")}</td>
        <td>${escapeHtml(row.vendedorId || "-")}</td>
        <td>${escapeHtml(row.vendedorNombre || "-")}</td>
        <td><span class="state ${statusClass(row.status)}">${escapeHtml(row.statusLabel || "-")}</span></td>
        <td>${escapeHtml(row.hora || "-")}</td>
        <td>${escapeHtml(row.expectedTime || "-")}${row.holiday ? " - feriado" : ""}</td>
        <td>${escapeHtml(row.observacion || "-")}</td>
      </tr>
    `).join("");
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "La respuesta del servidor no es JSON valido.");
    }
    if (!data.ok) throw new Error(data.error || data.message || "La API devolvio un error.");
    return data;
  }

  function normalizeEvents(rows) {
    return rows.map((row) => {
      const fechaRaw = clean(row.fecha || row.fecha_operativa || row.fechaOperativa || row.dia);
      const fecha = normalizeDateText(fechaRaw);
      const timestamp = parseDate(fecha);
      const tipoEvento = normalizeEventType(row.tipo_evento || row.tipoEvento || row.tipo || row.evento);
      const hora = normalizeTime(row.hora_declarada || row.horaDeclarada || row.hora || "");
      const sucursal = normalizeBranch(row.sucursal || row.local || row.branch);
      const vendedorId = clean(row.vendedor_id || row.vendedorId || row.id || row.legajo);
      const vendedorNombre = normalizePerson(row.vendedor_nombre || row.vendedorNombre || row.apellido_nombre || row.nombre || row.vendedor);

      return {
        fecha,
        timestamp,
        dateKey: dateKey(timestamp),
        month: monthKey(timestamp),
        sucursal,
        vendedorId,
        vendedorNombre,
        empleadoLabel: makeEmployeeLabel(vendedorId, vendedorNombre),
        tipoEvento,
        hora,
        observacion: clean(row.observacion || row.obs || "")
      };
    }).filter((row) => (row.fecha || row.vendedorId || row.vendedorNombre) && !isExcludedBranch(row.sucursal));
  }

  function normalizeEmployees(rows) {
    return rows.map((row) => {
      const vendedorId = clean(row.vendedor_id || row.vendedorId || row.id || row.legajo);
      const vendedorNombre = normalizePerson(row.apellido_nombre || row.apellidoNombre || row.vendedor_nombre || row.vendedorNombre || row.nombre || row.empleado);
      const sucursal = normalizeBranch(row.sucursal_base || row.sucursalBase || row.sucursal || row.local);

      return {
        vendedorId,
        vendedorNombre,
        empleadoLabel: makeEmployeeLabel(vendedorId, vendedorNombre),
        sucursal,
        rol: normalizeName(row.rol || row.puesto || row.cargo),
        horarioEntrada: normalizeTime(row.horario_teorico_entrada || row.horarioTeoricoEntrada || row.hora_entrada || row.horario || ""),
        estado: normalizeName(row.estado || row.activo || row.situacion || row.situación || ""),
        fechaBaja: normalizeDateText(row.fecha_baja || row.fechaBaja || row.baja || "")
      };
    }).filter((row) => (row.vendedorId || row.vendedorNombre) && isAuditedEmployee(row) && isActiveEmployee(row));
  }

  function normalizeBranches(rows) {
    return rows.map((row) => ({
      sucursal: normalizeBranch(row.sucursal || row.local),
      horarioApertura: normalizeTime(row.horario_apertura || row.horarioApertura || row.apertura || row.hora_apertura || "")
    })).filter((row) => row.sucursal && !isExcludedBranch(row.sucursal));
  }

  function normalizeHolidays(rows) {
    return rows.map((row) => ({
      fecha: normalizeDateText(row.fecha || row.dia || row.feriado),
      descripcion: clean(row.descripcion || row.feriado || row.detalle || row.motivo || ""),
      tipo: normalizeName(row.tipo || "")
    })).filter((row) => row.fecha);
  }

  function inferEmployeesFromEvents() {
    const map = new Map();
    state.events.forEach((event) => {
      const key = event.vendedorId || `${event.vendedorNombre}-${event.sucursal}`;
      if (!key || map.has(key)) return;
      map.set(key, {
        vendedorId: event.vendedorId,
        vendedorNombre: event.vendedorNombre,
        empleadoLabel: event.empleadoLabel,
        sucursal: "",
        rol: "",
        horarioEntrada: ""
      });
    });
    return Array.from(map.values());
  }

  function workingDaysForMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) return [];

    const todayKey = dateKey(Date.now());
    const days = [];
    const date = new Date(year, monthNumber - 1, 1);

    while (date.getMonth() === monthNumber - 1) {
      const timestamp = startOfDay(date.getTime());
      const key = dateKey(timestamp);
      const day = date.getDay();
      if (day !== 0 && key <= todayKey) {
        days.push({
          timestamp,
          dateKey: key,
          label: formatDate(timestamp)
        });
      }
      date.setDate(date.getDate() + 1);
    }

    return days;
  }

  function getPeriodWorkingDays() {
    if (el.periodFilter.value === "month") {
      return workingDaysForMonth(el.monthInput.value || currentMonthValue());
    }
    return workingDaysLast30();
  }

  function workingDaysLast30() {
    const today = startOfDay(Date.now());
    const from = today - (29 * 24 * 60 * 60 * 1000);
    const days = [];

    for (let timestamp = from; timestamp <= today; timestamp += 24 * 60 * 60 * 1000) {
      const date = new Date(timestamp);
      if (date.getDay() === 0) continue;
      days.push({
        timestamp,
        dateKey: dateKey(timestamp),
        label: formatDate(timestamp)
      });
    }

    return days;
  }

  function monthsForCurrentPeriod() {
    if (el.periodFilter.value === "month") {
      return [el.monthInput.value || currentMonthValue()];
    }

    const days = workingDaysLast30();
    return uniqueSorted(days.map((day) => monthKey(day.timestamp)));
  }

  function isAbsence(row) {
    return normalizeText(row.tipoEvento).includes("falta");
  }

  function isPresent(row) {
    return normalizeText(row.tipoEvento).includes("entrada");
  }

  function isLateAgainst(row, expectedTime) {
    if (!isPresent(row)) return false;
    if (normalizeText(row.observacion).includes("tarde")) return true;
    const expected = timeToMinutes(expectedTime);
    const actual = timeToMinutes(row.hora);
    if (!expected || !actual) return false;
    return actual > expected + LATE_TOLERANCE_MINUTES;
  }

  function statusClass(status) {
    if (status === "onTime") return "ready";
    if (status === "late") return "warn";
    if (status === "absent" || status === "missing") return "danger";
    return "";
  }

  function normalizeEventType(value) {
    const text = normalizeName(value);
    if (normalizeText(text).includes("falta")) return "FALTA";
    if (normalizeText(text).includes("entrada")) return "ENTRADA";
    if (normalizeText(text).includes("salida")) return "SALIDA";
    if (normalizeText(text).includes("permiso")) return "PERMISO";
    if (normalizeText(text).includes("vacacion")) return "VACACIONES";
    return text || "EVENTO";
  }

  function normalizeDateText(value) {
    const text = clean(value);
    if (!text) return "";
    const parsed = parseDate(text);
    return parsed ? dateKey(parsed) : text;
  }

  function parseDate(value) {
    if (typeof value === "number") return value;
    const text = clean(value);
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
    match = text.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function normalizeTime(value) {
    const text = clean(value);
    if (!text) return "";

    let match = text.match(/^(\d{1,2}):(\d{1,2})/);
    if (match) return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;

    match = text.match(/^(\d{1,2})(?:[.,](\d{1,2}))?$/);
    if (match) return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}`;

    return "";
  }

  function timeToMinutes(value) {
    const match = clean(value).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    return (Number(match[1]) * 60) + Number(match[2]);
  }

  function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthKey(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function dateKey(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function startOfDay(timestamp) {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function uniqueValues(rows, key) {
    return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)));
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function uniqueByDate(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = normalizeDateText(row.fecha || row.dia || row.feriado);
      if (key && !map.has(key)) map.set(key, row);
    });
    return Array.from(map.values());
  }

  function makeEmployeeLabel(id, name) {
    if (id && name) return `${id} - ${name}`;
    return id || name || "";
  }

  function normalizeName(value) {
    return clean(value).toUpperCase().replace(/\s+/g, " ");
  }

  function normalizeBranch(value) {
    const name = normalizeName(value);
    return BRANCH_ALIASES[name] || name;
  }

  function isActiveEmployee(row) {
    const estado = normalizeText(row.estado);
    if (row.fechaBaja) return false;
    if (!estado) return true;
    if (["no", "n", "false", "0", "inactivo", "inactiva", "baja", "egresado", "egresada"].includes(estado)) return false;
    return true;
  }

  function isAuditedEmployee(row) {
    const role = normalizeName(row.rol);
    return !EXCLUDED_ROLES.has(role);
  }

  function normalizePerson(value) {
    return normalizeName(value);
  }

  function clean(value) {
    return String(value || "").trim();
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
