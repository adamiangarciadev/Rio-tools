;(() => {
  "use strict";

  const COLUMN_PATTERNS = {
    branch: [/^codigo$/, /^c[oó]digo$/, /^local$/, /^sucursal$/, /^locales$/],
    discontinuity: [/^discontinuidad$/],
    provider: [/^grupo$/, /^proveedor$/, /^marca$/, /^fabricante$/],
    product: [/^nombre$/, /^producto$/, /^descripcion$/, /^descripci[oó]n$/, /^articulo$/, /^art[ií]culo$/],
    category: [/^categoria$/, /^categor[ií]a$/, /^rubro$/, /^familia$/, /^linea$/, /^l[ií]nea$/, /^departamento$/],
    qty: [/^cantidad$/, /^cant\.?$/, /^unidades$/],
    cost: [/^valorizado/, /^costo$/, /^costo total$/],
    sales: [/^monto de ventas$/, /^venta$/, /^ventas$/, /^importe venta$/],
    profit: [/^ventas\s*-\s*valorizado/, /^ganancia$/, /^ganancias$/, /^margen de ganancias/],
  };

  const els = {
    fileInput: qs("#fileInput"),
    btnPick: qs("#btnPick"),
    btnDemo: qs("#btnDemo"),
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
    els.btnDemo.addEventListener("click", loadDemo);
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
      const files = [...(ev.dataTransfer?.files || [])];
      handleFiles(files);
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

    const pieces = [`${fmtInt(state.rows.length)} filas cargadas desde ${usable.length} archivo(s).`];
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
            const hasMinimum = map.qty && map.cost && map.sales && map.profit && (map.branch || map.provider);
            if (!hasMinimum) return;

            json.forEach((raw, index) => {
              const row = normalizeRawRow(raw, map, file.name, sheetName, index + 2);
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

  function normalizeRawRow(raw, map, fileName, sheetName, sourceRow) {
    const branch = String(raw[map.branch] || "").trim();
    const provider = String(raw[map.provider] || "").trim();
    const product = String(raw[map.product] || "").trim();
    const discontinuity = String(raw[map.discontinuity] || "").trim();
    const category = String(raw[map.category] || "").trim();
    const qty = toNumber(raw[map.qty]);
    const cost = toNumber(raw[map.cost]);
    const sales = toNumber(raw[map.sales]);
    const profit = toNumber(raw[map.profit]);

    return {
      branch: branch || "Sin sucursal",
      provider: provider || "Sin proveedor",
      product: product || discontinuity || "Sin producto",
      category: category || "Sin categoria",
      discontinuity,
      qty,
      cost,
      sales,
      profit,
      margin: cost ? profit / cost : 0,
      fileName,
      sheetName,
      sourceRow,
      isSubtotal: /^subtotal/i.test(discontinuity),
      isTotal: /^total$/i.test(branch) || /^total$/i.test(discontinuity),
    };
  }

  function buildAggregates(rows) {
    const detail = rows.filter((row) => !row.isTotal);
    const totals = sumRows(detail.filter((row) => !row.isSubtotal));
    const branches = grouped(detail, (row) => row.branch, { excludeSubtotal: true });
    const providers = grouped(detail, (row) => row.provider, { preferSubtotals: true });
    const categories = grouped(detail, (row) => row.category, { excludeSubtotal: true });
    const providerCategories = buildProviderCategoryRows(detail);

    return { totals, branches, providers, categories, providerCategories };
  }

  function grouped(rows, getKey, options = {}) {
    const useRows = options.preferSubtotals && rows.some((row) => row.isSubtotal)
      ? rows.filter((row) => row.isSubtotal)
      : rows.filter((row) => !(options.excludeSubtotal && row.isSubtotal));

    const map = new Map();
    useRows.forEach((row) => {
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
    const baseRows = rows.filter((row) => !row.isSubtotal && !row.isTotal);
    const byProviderCategory = new Map();
    baseRows.forEach((row) => {
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
          tooltip: {
            callbacks: {
              label: (ctx) => asPct ? fmtPct(ctx.raw) : fmtMoney(ctx.raw),
            },
          },
        },
        scales: {
          x: { ticks: { color: "#94a3b8", maxRotation: 45 }, grid: { color: "rgba(148,163,184,.08)" } },
          y: {
            ticks: {
              color: "#94a3b8",
              callback: (value) => asPct ? fmtPct(value) : compactMoney(value),
            },
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
    const sheetRows = rows.map((row) => ({ ...row }));
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    XLSX.writeFile(workbook, `${name}_${period}.xlsx`);
  }

  function loadDemo() {
    state.rows = [
      row("AVELLANEDA", "PROV A", "Zapatilla Run", "Calzado", 22, 710000, 1120000, 410000),
      row("NAZCA", "PROV A", "Remera Basic", "Indumentaria", 36, 310000, 520000, 210000),
      row("CORRIENTES", "PROV B", "Mochila Urbana", "Accesorios", 14, 420000, 690000, 270000),
      row("QUILMES", "PROV C", "Campera Soft", "Abrigo", 9, 580000, 830000, 250000),
      row("SARMIENTO", "PROV B", "Bolso Gym", "Accesorios", 18, 240000, 430000, 190000),
      row("LAMARCA", "PROV C", "Buzo Classic", "Indumentaria", 16, 390000, 620000, 230000),
      row("PUEYRREDON", "PROV D", "Media Pack", "Calzado", 42, 120000, 230000, 110000),
    ];
    state.files = ["demo"];
    state.aggregates = buildAggregates(state.rows);
    setStatus("Datos demo cargados. Cuando subas archivos reales se reemplazan.");
    render();
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

  function row(branch, provider, product, category, qty, cost, sales, profit) {
    return { branch, provider, product, category, qty, cost, sales, profit, margin: cost ? profit / cost : 0 };
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

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let text = String(value ?? "").trim().replace(/\$/g, "").replace(/%/g, "").replace(/\s/g, "");
    if (!text) return 0;
    if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
    const number = Number.parseFloat(text);
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

  function cleanFilePart(value) {
    return normalizeText(value).replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "reporte";
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
