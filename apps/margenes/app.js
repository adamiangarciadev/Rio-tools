;(() => {
  "use strict";

  const COLUMN_PATTERNS = {
    branch: [/^codigo$/, /^local$/, /^sucursal$/, /^locales$/],
    discontinuity: [/^discontinuidad$/],
    group: [/^grupo$/],
    name: [/^nombre$/],
    provider: [/^proveedor$/, /^marca$/, /^fabricante$/],
    category: [/^categoria$/, /^rubro$/, /^familia$/, /^linea$/, /^departamento$/],
    product: [/^producto$/, /^descripcion$/, /^articulo$/],
    qty: [/^cantidad$/, /^cant\.?$/, /^unidades$/],
    cost: [/^valorizado/, /^costo$/, /^costo total$/],
    sales: [/^monto de ventas$/, /^venta$/, /^ventas$/, /^importe venta$/],
    profit: [/^ventas\s*-\s*valorizado/, /^ganancia$/, /^ganancias$/, /^margen de ganancias/],
  };

  const els = {
    fileInput: qs("#fileInput"),
    btnPick: qs("#btnPick"),
    btnExportAll: qs("#btnExportAll"),
    btnReset: qs("#btnReset"),
    dropzone: qs("#dropzone"),
    status: qs("#status"),
    periodInput: qs("#periodInput"),
    viewMode: qs("#viewMode"),
    searchInput: qs("#searchInput"),
    kpiSales: qs("#kpiSales"),
    kpiCost: qs("#kpiCost"),
    kpiProfit: qs("#kpiProfit"),
    kpiMargin: qs("#kpiMargin"),
    kpiQty: qs("#kpiQty"),
    branchCount: qs("#branchCount"),
    branchesTable: qs("#branchesTable"),
    providersTable: qs("#providersTable"),
    providerCategoryTable: qs("#providerCategoryTable"),
    exportBranches: qs("#exportBranches"),
    exportProviders: qs("#exportProviders"),
    exportProviderCategories: qs("#exportProviderCategories"),
  };

  const state = {
    rows: [],
    files: [],
    charts: {},
    aggregates: emptyAggregates(),
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.btnPick.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", () => handleFiles([...els.fileInput.files]));
    els.btnExportAll.addEventListener("click", exportAllReports);
    els.btnReset.addEventListener("click", resetAll);
    els.searchInput.addEventListener("input", render);
    els.viewMode.addEventListener("change", render);
    els.exportBranches.addEventListener("click", () => exportRows("reporte_sucursales", state.aggregates.branches));
    els.exportProviders.addEventListener("click", () => exportRows("reporte_proveedores", state.aggregates.providers));
    els.exportProviderCategories.addEventListener("click", () => exportRows("categoria_por_proveedor", state.aggregates.providerCategories));

    ["dragenter", "dragover"].forEach((eventName) => {
      els.dropzone.addEventListener(eventName, (ev) => {
        ev.preventDefault();
        els.dropzone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      els.dropzone.addEventListener(eventName, (ev) => {
        ev.preventDefault();
        els.dropzone.classList.remove("is-dragging");
      });
    });

    els.dropzone.addEventListener("drop", (ev) => {
      handleFiles([...(ev.dataTransfer?.files || [])]);
    });

    render();
  }

  async function handleFiles(files) {
    const usable = files.filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name));
    if (!usable.length) {
      setStatus("No encontre archivos Excel o CSV para procesar.");
      return;
    }

    setStatus(`Leyendo ${usable.length} archivo(s)...`);
    const parsed = [];
    const warnings = [];

    for (const file of usable) {
      try {
        const rows = await parseWorkbook(file);
        parsed.push(...rows);
      } catch (error) {
        warnings.push(`${file.name}: ${error.message}`);
      }
    }

    state.rows = parsed;
    state.files = usable.map((file) => file.name);
    state.aggregates = buildAggregates(state.rows);

    const localesCount = state.rows.filter((row) => row.reportType === "locales").length;
    const proveedorCount = state.rows.filter((row) => row.reportType === "proveedor").length;
    const pieces = [
      `${fmtInt(state.rows.length)} filas cargadas.`,
      `Locales: ${fmtInt(localesCount)}.`,
      `Proveedor: ${fmtInt(proveedorCount)}.`,
    ];
    if (warnings.length) pieces.push(`Avisos: ${warnings.join(" | ")}`);
    setStatus(pieces.join(" "));
    render();
  }

  function parseWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.onload = () => {
        try {
          const data = new Uint8Array(reader.result);
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          const rows = [];

          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
            if (!json.length) return;

            const columns = Object.keys(json[0]);
            const map = detectColumns(columns);
            const reportType = detectReportType(map);
            const hasMetrics = map.qty && map.cost && map.sales && map.profit;
            if (!reportType || !hasMetrics) return;

            json.forEach((raw, index) => {
              const row = normalizeRawRow(raw, map, reportType, file.name, sheetName, index + 2);
              if (row.qty || row.cost || row.sales || row.profit) rows.push(row);
            });
          });

          if (!rows.length) {
            reject(new Error("No encontre columnas compatibles con el reporte."));
            return;
          }

          resolve(rows);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function detectColumns(columns) {
    const cleaned = columns.map((name) => ({ original: name, clean: cleanColumn(name) }));
    const out = {};
    Object.entries(COLUMN_PATTERNS).forEach(([key, patterns]) => {
      const found = cleaned.find((col) => patterns.some((pattern) => pattern.test(col.clean)));
      out[key] = found?.original || "";
    });
    return out;
  }

  function detectReportType(map) {
    if (map.discontinuity && map.group && map.name) return "proveedor";
    if (map.branch && !map.discontinuity) return "locales";
    return "";
  }

  function normalizeRawRow(raw, map, reportType, fileName, sheetName, sourceRow) {
    const discontinuity = text(raw[map.discontinuity]);
    const isSubtotal = /^subtotal/i.test(discontinuity);
    const isTotal = /^total$/i.test(discontinuity) || /^total$/i.test(text(raw[map.branch]));
    const qty = toNumber(raw[map.qty]);
    const cost = toNumber(raw[map.cost]);
    const sales = toNumber(raw[map.sales]);
    const profit = toNumber(raw[map.profit]);

    if (reportType === "locales") {
      return {
        reportType,
        branch: text(raw[map.branch]) || "Sin sucursal",
        provider: "",
        product: "",
        category: "",
        discontinuity,
        qty,
        cost,
        sales,
        profit,
        margin: cost ? profit / cost : 0,
        fileName,
        sheetName,
        sourceRow,
        isSubtotal: false,
        isTotal,
      };
    }

    const groupValue = text(raw[map.group]);
    const nameValue = text(raw[map.name]);
    const provider = isSubtotal ? groupValue : (nameValue || text(raw[map.provider]) || "Sin proveedor");
    const category = isSubtotal ? "" : (groupValue || text(raw[map.category]) || "Sin categoria");
    const product = text(raw[map.product]) || nameValue || provider;

    return {
      reportType,
      branch: "",
      provider,
      product,
      category,
      discontinuity,
      qty,
      cost,
      sales,
      profit,
      margin: cost ? profit / cost : 0,
      fileName,
      sheetName,
      sourceRow,
      isSubtotal,
      isTotal,
    };
  }

  function buildAggregates(rows) {
    const localRows = rows.filter((row) => row.reportType === "locales" && !row.isTotal);
    const providerRows = rows.filter((row) => row.reportType === "proveedor" && !row.isTotal);
    const providerDetailRows = providerRows.filter((row) => !row.isSubtotal);
    const providerSubtotalRows = providerRows.filter((row) => row.isSubtotal);

    const branches = grouped(localRows, (row) => row.branch);
    const providers = grouped(
      providerSubtotalRows.length ? providerSubtotalRows : providerDetailRows,
      (row) => row.provider
    );
    const categories = grouped(providerDetailRows, (row) => row.category);
    const providerCategories = buildProviderCategoryRows(providerDetailRows);

    const totalsSource = localRows.length ? localRows : providerDetailRows;
    const totals = sumRows(totalsSource);

    return { totals, branches, providers, categories, providerCategories };
  }

  function grouped(rows, getKey) {
    const map = new Map();
    rows.forEach((row) => {
      const key = getKey(row) || "Sin dato";
      const item = map.get(key) || { nombre: key, cantidad: 0, costo: 0, venta: 0, ganancia: 0, margen: 0 };
      item.cantidad += row.qty;
      item.costo += row.cost;
      item.venta += row.sales;
      item.ganancia += row.profit;
      map.set(key, item);
    });

    return [...map.values()]
      .map(addMargin)
      .sort((a, b) => b.venta - a.venta);
  }

  function buildProviderCategoryRows(rows) {
    const byProviderCategory = new Map();
    rows.forEach((row) => {
      const key = `${row.provider}|||${row.category}`;
      const item = byProviderCategory.get(key) || {
        proveedor: row.provider || "Sin proveedor",
        categoria: row.category || "Sin categoria",
        cantidad: 0,
        costo: 0,
        venta: 0,
        ganancia: 0,
        margen: 0,
      };
      item.cantidad += row.qty;
      item.costo += row.cost;
      item.venta += row.sales;
      item.ganancia += row.profit;
      byProviderCategory.set(key, item);
    });

    const best = new Map();
    [...byProviderCategory.values()].map(addMargin).forEach((item) => {
      const current = best.get(item.proveedor);
      if (!current || item.venta > current.venta) best.set(item.proveedor, item);
    });

    return [...best.values()].sort((a, b) => b.venta - a.venta);
  }

  function render() {
    const query = normalizeText(els.searchInput.value);
    const view = els.viewMode.value;
    const filtered = filterAggregates(state.aggregates, query);
    renderViews(view);
    renderKpis(state.aggregates.totals);
    renderCharts(filtered);
    renderTables(filtered);
  }

  function filterAggregates(aggregates, query) {
    if (!query) return aggregates;
    const matches = (value) => normalizeText(value).includes(query);
    return {
      totals: aggregates.totals,
      branches: aggregates.branches.filter((row) => matches(row.nombre)),
      providers: aggregates.providers.filter((row) => matches(row.nombre)),
      categories: aggregates.categories.filter((row) => matches(row.nombre)),
      providerCategories: aggregates.providerCategories.filter((row) => matches(`${row.proveedor} ${row.categoria}`)),
    };
  }

  function renderViews(view) {
    document.querySelectorAll("[data-view]").forEach((node) => {
      const target = node.getAttribute("data-view");
      node.classList.toggle("hidden-view", view !== "all" && target !== view);
    });
  }

  function renderKpis(totals) {
    els.kpiSales.textContent = fmtMoney(totals.venta);
    els.kpiCost.textContent = fmtMoney(totals.costo);
    els.kpiProfit.textContent = fmtMoney(totals.ganancia);
    els.kpiMargin.textContent = fmtPct(totals.margen);
    els.kpiQty.textContent = fmtInt(totals.cantidad);
  }

  function renderCharts(data) {
    els.branchCount.textContent = `${data.branches.length} sucursales`;
    drawBar("branchChart", data.branches.slice(0, 12), "Venta", "venta", [34, 199, 184]);
    drawBar("providerChart", data.providers.slice(0, 12), "Venta", "venta", [90, 167, 255]);
    drawBar("categoryChart", data.categories.slice(0, 12), "Venta", "venta", [52, 211, 153]);
    drawBar("marginChart", data.providers.slice(0, 12), "Margen", "margen", [245, 158, 11], true);
  }

  function drawBar(canvasId, rows, label, key, rgb, asPct = false) {
    const canvas = qs(`#${canvasId}`);
    if (!canvas || !window.Chart) return;
    const context = canvas.getContext("2d");
    const values = rows.map((row) => row[key]);
    const labels = rows.map((row) => row.nombre || row.proveedor || row.categoria);

    if (state.charts[canvasId]) state.charts[canvasId].destroy();
    state.charts[canvasId] = new Chart(context, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          borderColor: `rgb(${rgb.join(",")})`,
          backgroundColor: `rgba(${rgb.join(",")}, .56)`,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => asPct ? fmtPct(ctx.raw) : fmtMoney(ctx.raw) } },
        },
        scales: {
          x: { ticks: { color: "#94a3b8", maxRotation: 45 }, grid: { color: "rgba(148,163,184,.08)" } },
          y: {
            ticks: { color: "#94a3b8", callback: (value) => asPct ? fmtPct(value) : compactMoney(value) },
            grid: { color: "rgba(148,163,184,.08)" },
          },
        },
      },
    });
  }

  function renderTables(data) {
    renderMetricTable(els.branchesTable, data.branches, "Sucursal");
    renderMetricTable(els.providersTable, data.providers, "Proveedor");
    renderProviderCategoryTable(data.providerCategories);
  }

  function renderMetricTable(table, rows, firstLabel) {
    table.innerHTML = `
      <thead>
        <tr>
          <th>${escapeHtml(firstLabel)}</th>
          <th class="num">Cantidad</th>
          <th class="num">Costo</th>
          <th class="num">Venta</th>
          <th class="num">Ganancia</th>
          <th class="num">Margen</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.nombre)}</td>
            <td class="num">${fmtInt(row.cantidad)}</td>
            <td class="num">${fmtMoney(row.costo)}</td>
            <td class="num">${fmtMoney(row.venta)}</td>
            <td class="num">${fmtMoney(row.ganancia)}</td>
            <td class="num ${marginClass(row.margen)}">${fmtPct(row.margen)}</td>
          </tr>
        `).join("") : emptyTableRow(6)}
      </tbody>
    `;
  }

  function renderProviderCategoryTable(rows) {
    els.providerCategoryTable.innerHTML = `
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Categoria mas vendida</th>
          <th class="num">Cantidad</th>
          <th class="num">Venta</th>
          <th class="num">Ganancia</th>
          <th class="num">Margen</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.proveedor)}</td>
            <td>${escapeHtml(row.categoria)}</td>
            <td class="num">${fmtInt(row.cantidad)}</td>
            <td class="num">${fmtMoney(row.venta)}</td>
            <td class="num">${fmtMoney(row.ganancia)}</td>
            <td class="num ${marginClass(row.margen)}">${fmtPct(row.margen)}</td>
          </tr>
        `).join("") : emptyTableRow(6)}
      </tbody>
    `;
  }

  function exportRows(name, rows) {
    if (!rows.length) {
      setStatus("No hay datos para exportar.");
      return;
    }

    const period = cleanFilePart(els.periodInput.value || "sin_periodo");
    const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({ ...row })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    XLSX.writeFile(workbook, `${name}_${period}.xlsx`);
  }

  function exportAllReports() {
    if (!window.XLSX) {
      setStatus("No se cargo la libreria para exportar Excel.");
      return;
    }

    const localRows = state.rows.filter((row) => row.reportType === "locales" && !row.isTotal);
    const providerRows = state.rows.filter((row) => row.reportType === "proveedor" && !row.isTotal);

    if (!localRows.length && !providerRows.length) {
      setStatus("Primero carga los archivos crudos de locales y proveedor.");
      return;
    }

    const period = cleanFilePart(els.periodInput.value || guessPeriodFromFiles() || "sin_periodo");
    let exported = 0;

    if (localRows.length) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(buildLocalesSheet(localRows));
      ws["!cols"] = [{ wch: 28 }, { wch: 19 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 12 }];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      ];
      applyNumberFormats(ws, 7, ["B"], ["C", "D", "E"], ["F"]);
      styleExecutiveSheet(ws, "locales");
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, `MARGEN_LOCALES_${period}_PROCESADO_LOCALES.xlsx`);
      exported++;
    }

    if (providerRows.length) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(buildProveedorSheet(providerRows));
      ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      ];
      applyNumberFormats(ws, 7, ["D"], ["E", "F", "G"], ["H"]);
      styleExecutiveSheet(ws, "proveedor");
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, `MARGEN_PROVEEDOR_${period}_PROCESADO_PROVEEDOR.xlsx`);
      exported++;
    }

    setStatus(`Exportacion lista: ${exported} archivo${exported === 1 ? "" : "s"} generado${exported === 1 ? "" : "s"}.`);
  }

  function buildLocalesSheet(rows) {
    const detail = rows.map((row) => [
      row.branch,
      row.qty,
      round2(row.cost),
      round2(row.sales),
      round2(row.profit),
      row.cost ? row.profit / row.cost : 0,
    ]);
    const totals = sumRows(rows);
    return [
      ["REPORTE EJECUTIVO - VENTA Y GANANCIAS POR LOCALES", "", "", "", "", ""],
      [`Formato ejecutivo - Generado automaticamente - ${formatDateTimeForExport()} - Fuente: ${state.files.join(", ")}`, "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["LOCALES", "Cantidad DE ART.", "COSTO", "VENTAS", "MARGEN DE GANANCIAS $", "MARGENES %"],
      ...detail,
      ["TOTAL", totals.cantidad, round2(totals.costo), round2(totals.venta), round2(totals.ganancia), totals.margen],
    ];
  }

  function buildProveedorSheet(rows) {
    const detailRows = rows.filter((row) => !row.isSubtotal);
    const body = rows.map((row) => [
      row.discontinuity,
      row.isSubtotal ? row.provider : row.category,
      row.isSubtotal ? "" : row.provider,
      row.qty,
      round2(row.cost),
      round2(row.sales),
      round2(row.profit),
      row.isSubtotal && row.cost ? row.profit / row.cost : "",
    ]);
    const totals = sumRows(detailRows);
    return [
      ["REPORTE EJECUTIVO - VENTAS Y GANANCIAS POR MARCA", "", "", "", "", "", "", ""],
      [`Formato ejecutivo - Generado automaticamente - ${formatDateTimeForExport()} - Fuente: ${state.files.join(", ")}`, "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["Discontinuidad", "Grupo", "Nombre", "Cantidad", "Costo", "Venta", "Ganancias", "% Ganancias"],
      ...body,
      ["TOTAL", "", "", totals.cantidad, round2(totals.costo), round2(totals.venta), round2(totals.ganancia), totals.margen],
    ];
  }

  function applyNumberFormats(sheet, startRow, intCols, moneyCols, pctCols) {
    if (!sheet["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let r = startRow - 1; r <= range.e.r; r++) {
      intCols.forEach((col) => setCellFormat(sheet, `${col}${r + 1}`, "#,##0"));
      moneyCols.forEach((col) => setCellFormat(sheet, `${col}${r + 1}`, '$ #,##0.00'));
      pctCols.forEach((col) => setCellFormat(sheet, `${col}${r + 1}`, "0%"));
    }
  }

  function setCellFormat(sheet, address, format) {
    if (!sheet[address] || sheet[address].v === "") return;
    sheet[address].z = format;
  }

  function styleExecutiveSheet(sheet, mode) {
    if (!sheet["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const lastCol = range.e.c;
    const headerRow = 5;
    const bodyStart = 6;

    sheet["!rows"] = [
      { hpt: 28 },
      { hpt: 22 },
      { hpt: 10 },
      { hpt: 10 },
      { hpt: 10 },
      { hpt: 24 },
    ];
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: range.e }) };

    for (let c = 0; c <= lastCol; c++) {
      ensureCell(sheet, 0, c).s = styleTitle();
      ensureCell(sheet, 1, c).s = styleSubtitle();
      ensureCell(sheet, headerRow, c).s = styleHeader();
    }

    for (let r = bodyStart; r <= range.e.r; r++) {
      const first = text(sheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v);
      const isTotal = first.toUpperCase() === "TOTAL";
      const isSubtotal = first.toUpperCase().startsWith("SUBTOTAL");
      const fill = isTotal ? "D9EAD3" : isSubtotal ? "FCE5CD" : (r % 2 === 0 ? "FFFFFF" : "F8FAFC");

      for (let c = 0; c <= lastCol; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = ensureCell(sheet, r, c);
        const isNumeric = typeof cell.v === "number";
        cell.s = {
          fill: { fgColor: { rgb: fill } },
          font: {
            name: "Calibri",
            sz: 11,
            bold: isTotal || isSubtotal,
            color: { rgb: isTotal ? "0F5132" : "111827" },
          },
          alignment: {
            vertical: "center",
            horizontal: isNumeric ? "right" : "left",
          },
          border: thinBorder("D0D5DD"),
        };
      }

      if (isTotal || isSubtotal) {
        sheet["!rows"][r] = { hpt: 22 };
      }

      const pctCol = mode === "locales" ? 5 : 7;
      const pctCell = sheet[XLSX.utils.encode_cell({ r, c: pctCol })];
      if (pctCell && typeof pctCell.v === "number") {
        pctCell.s = {
          ...pctCell.s,
          fill: { fgColor: { rgb: marginFill(pctCell.v) } },
          font: { ...pctCell.s.font, bold: true, color: { rgb: "111827" } },
        };
      }
    }
  }

  function ensureCell(sheet, r, c) {
    const address = XLSX.utils.encode_cell({ r, c });
    if (!sheet[address]) sheet[address] = { t: "s", v: "" };
    return sheet[address];
  }

  function styleTitle() {
    return {
      fill: { fgColor: { rgb: "1F4E78" } },
      font: { name: "Calibri", sz: 16, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: thinBorder("1F4E78"),
    };
  }

  function styleSubtitle() {
    return {
      fill: { fgColor: { rgb: "D9EAF7" } },
      font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "1F2937" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: thinBorder("B7D7EA"),
    };
  }

  function styleHeader() {
    return {
      fill: { fgColor: { rgb: "FFD966" } },
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "111827" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: thinBorder("9CA3AF"),
    };
  }

  function thinBorder(color) {
    return {
      top: { style: "thin", color: { rgb: color } },
      bottom: { style: "thin", color: { rgb: color } },
      left: { style: "thin", color: { rgb: color } },
      right: { style: "thin", color: { rgb: color } },
    };
  }

  function marginFill(value) {
    if (value >= .8) return "E8F5E9";
    if (value >= .55) return "FFF4CC";
    return "FDECEC";
  }

  function resetAll() {
    state.rows = [];
    state.files = [];
    state.aggregates = emptyAggregates();
    els.fileInput.value = "";
    els.searchInput.value = "";
    setStatus("Esperando archivos.");
    render();
  }

  function emptyAggregates() {
    return {
      totals: { cantidad: 0, costo: 0, venta: 0, ganancia: 0, margen: 0 },
      branches: [],
      providers: [],
      categories: [],
      providerCategories: [],
    };
  }

  function sumRows(rows) {
    return addMargin(rows.reduce((acc, row) => {
      acc.cantidad += row.qty;
      acc.costo += row.cost;
      acc.venta += row.sales;
      acc.ganancia += row.profit;
      return acc;
    }, { cantidad: 0, costo: 0, venta: 0, ganancia: 0, margen: 0 }));
  }

  function addMargin(item) {
    item.margen = item.costo ? item.ganancia / item.costo : 0;
    return item;
  }

  function cleanColumn(value) {
    return normalizeText(String(value).replace(/\s+/g, " ").trim());
  }

  function normalizeText(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let raw = String(value ?? "").trim().replace(/\$/g, "").replace(/%/g, "").replace(/\s/g, "");
    if (!raw) return 0;

    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
    else raw = raw.replace(/,/g, "");

    const number = Number.parseFloat(raw);
    return Number.isFinite(number) ? number : 0;
  }

  function fmtMoney(value) {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value || 0);
  }

  function compactMoney(value) {
    return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
  }

  function fmtPct(value) {
    return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(value || 0);
  }

  function fmtInt(value) {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value || 0);
  }

  function round2(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function cleanFilePart(value) {
    return normalizeText(value).replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "reporte";
  }

  function guessPeriodFromFiles() {
    const text = state.files.join(" ");
    const match = text.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{1,2}/i);
    return match ? match[0] : "";
  }

  function formatDateTimeForExport() {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function emptyTableRow(cols) {
    return `<tr><td colspan="${cols}">Sin datos cargados.</td></tr>`;
  }

  function marginClass(value) {
    if (value >= .4) return "margin-good";
    if (value >= .2) return "margin-mid";
    return "margin-bad";
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }
})();
