// app.js — Categorizador RÍO (XLS/XLSX/CSV) + Asignación de Ramas + Modo CYBER
// Calcula códigos por nivel siguiendo "Es subcategoría de" (no necesita codcat1..4)

const EL = (id) => document.getElementById(id);

// ===================== Utils =====================
const normalizeHeader = (s = "") =>
  String(s)
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const segNorm = (s = "") =>
  String(s)
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function csvCell(v) {
  if (v === undefined || v === null) return "";
  const s = String(v).replaceAll('"', '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function renderTable(el, rows, limit = 100) {
  if (!rows?.length) { el.innerHTML = '<div class="small">(sin filas)</div>'; return; }
  const keys = Object.keys(rows[0]);
  const head = "<tr>" + keys.map((k) => `<th>${k}</th>`).join("") + "</tr>";
  const body = rows.slice(0, limit).map((r) =>
    "<tr>" + keys.map((k) => `<td>${String(r[k]).replaceAll("<","&lt;")}</td>`).join("") + "</tr>"
  ).join("");
  el.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`
    + (rows.length > limit ? `<div class="small">Mostrando ${limit} de ${rows.length} filas…</div>` : "");
}

// === Lector robusto (XLS/XLSX/CSV) ===
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCSV = /\.csv$/i.test(file.name);

    reader.onload = (e) => {
      try {
        let wb;
        if (isCSV) {
          wb = XLSX.read(e.target.result, { type: "string" }); // texto plano (autodetecta ; ,)
        } else {
          const data = new Uint8Array(e.target.result);        // .xls / .xlsx
          wb = XLSX.read(data, { type: "array" });
        }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
        resolve(json);
      } catch (err) { reject(err); }
    };

    if (isCSV) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

// ===================== Categorías =====================
let categoriaRows = [];
let rutaToCodes = {};           // "Mujer > Ropa..." -> ["1","120","12","103"]
let byCodeIdx = new Map();      // codigo -> nodo

const headerAliases = {
  codigo: ["codigo", "código", "code", "id"],
  categoria: ["categoria", "categoría", "name", "nombre"],
  es_subcategoria_de: [
    "es subcategoria de", "es subcategoría de", "padre", "parent", "parent_id", "es_subcategoria_de",
  ],
  rama: ["rama", "ruta", "path"],
};

function mapHeaders(row) {
  const mapped = {};
  for (const [std, aliases] of Object.entries(headerAliases)) {
    const found = Object.keys(row).find((k) => aliases.includes(normalizeHeader(k)));
    if (found) mapped[std] = row[found];
  }
  return mapped;
}

EL("fileCategorias").addEventListener("change", async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  EL("summaryCategorias").textContent = "Leyendo…";
  try {
    const rows = await readFile(f);
    renderTable(EL("previewCategorias"), rows, 60);

    // Normalizo y armo índice por código
    categoriaRows = rows.map(mapHeaders).map((r) => ({
      codigo: String(r.codigo || "").trim(),
      categoria: String(r.categoria || "").trim(),
      es_subcategoria_de: String(r.es_subcategoria_de || "").trim(),
      rama: String(r.rama || "").trim(),
    })).filter((r) => r.codigo && r.categoria);

    // Índice por código
    byCodeIdx = new Map(categoriaRows.map((r) => [r.codigo, { ...r, children: [] }]));

    // Enlazar hijos
    for (const node of byCodeIdx.values()) {
      const p = node.es_subcategoria_de;
      if (p && p !== "0" && p !== "-" && byCodeIdx.has(p)) byCodeIdx.get(p).children.push(node);
    }

    // Helper: trail de códigos (root -> nodo)
    function codesTrailFrom(node) {
      const seen = new Set();
      const trail = [];
      let cur = node;
      while (cur && cur.codigo && !seen.has(cur.codigo)) {
        trail.push(String(cur.codigo).trim());
        seen.add(cur.codigo);
        const parentCode = (cur.es_subcategoria_de || "").trim();
        cur = parentCode && byCodeIdx.get(parentCode) ? byCodeIdx.get(parentCode) : null;
      }
      return trail.reverse();
    }

    // Helper: si no viene RAMA, la construyo por nombres
    function rutaFrom(node) {
      const seen = new Set();
      const parts = [];
      let cur = node;
      while (cur && cur.codigo && !seen.has(cur.codigo)) {
        parts.push(cur.categoria);
        seen.add(cur.codigo);
        const parentCode = (cur.es_subcategoria_de || "").trim();
        cur = parentCode && byCodeIdx.get(parentCode) ? byCodeIdx.get(parentCode) : null;
      }
      return parts.reverse().join(" > ");
    }

    // Construyo mapping ruta -> codes
    rutaToCodes = {};
    for (const node of byCodeIdx.values()) {
      const trailCodes = codesTrailFrom(node);
      const ruta = node.rama ? node.rama : rutaFrom(node);
      if (ruta) rutaToCodes[ruta] = trailCodes;
    }

    // Recalcular combos si ya había artículos
    buildRamasPorGenero();
    renderTablaArticulos(EL("buscarArt")?.value || "");

    EL("summaryCategorias").innerHTML = `Archivo: <b>${f.name}</b> · Filas: <b>${rows.length}</b>`;
  } catch (err) {
    EL("summaryCategorias").innerHTML = `<span class="err">Error: ${err.message}</span>`;
  }
});

// ===================== Modo CYBER =====================
let cyberOnly = false; // toggle

// Acepta variantes: "CYBER RÍO", "CYBER RIO", "CYBER", "CYBER-RIO", espacios múltiples, etc.
function isCyberRuta(ruta = "") {
  const parts = String(ruta).split(">").map((s) => segNorm(s).replace(/[-_]+/g, " "));
  if (!parts.length) return false;
  const root = parts[0];
  return root === "cyber rio" || root === "cyber";
}

// Género dominante de la ruta:
// - Normal: 1er segmento (Mujer/Hombre/Niños).
// - CYBER: 2º segmento (CYBER RIO > Mujer/Hombre/Niños > …).
function generoFromRuta(ruta = "") {
  const partsRaw = String(ruta).split(">").map((s) => s.trim());
  if (!partsRaw.length) return "";
  const idx = isCyberRuta(ruta) ? 1 : 0;
  const g = segNorm(partsRaw[idx] || "");
  if (/(mujer|fem|damas?)/.test(g)) return "Mujer";
  if (/(hombre|masc|caballeros?)/.test(g)) return "Hombre";
  if (/(nin|nene|nena|nino|nina|chico|chica|kids|infantil|ninos|ninas)/.test(g)) return "Niños";
  return "";
}

// Botón toggle (si existe en el HTML)
EL("btnCyber")?.addEventListener("click", () => {
  cyberOnly = !cyberOnly;
  EL("btnCyber").classList.toggle("active", cyberOnly);
  EL("btnCyber").textContent = cyberOnly ? "Modo CYBER: ON" : "Modo CYBER: OFF";

  // Si está activo, limpio selecciones no CYBER
  if (cyberOnly) {
    articulos.forEach((a) => {
      if (a.ramaSeleccionada && !isCyberRuta(a.ramaSeleccionada)) a.ramaSeleccionada = "";
    });
  }

  buildRamasPorGenero();
  renderTablaArticulos(EL("buscarArt")?.value || "");
});

// ===================== Artículos =====================
let articulos = [];
let ramasPorGenero = { Mujer: [], Hombre: [], Niños: [] };

const headerAliasesArt = {
  codigo: ["codigo", "código", "cod", "id", "articulo", "artículo", "a"],
  descripcion: ["descripcion", "descripción", "detalle", "nombre", "desc", "b"],
  genero: ["genero", "género", "sexo", "l", "rubro", "target"],
};

function mapHeadersArt(row) {
  const out = {};
  for (const [std, aliases] of Object.entries(headerAliasesArt)) {
    const key = Object.keys(row).find((k) => aliases.includes(normalizeHeader(k)));
    if (key) out[std] = row[key];
  }
  return out;
}

function normalizeGenero(g) {
  const s = segNorm(g);
  if (/mujer|fem/.test(s)) return "Mujer";
  if (/hombre|masc|caballero/.test(s)) return "Hombre";
  if (/nene|nena|nino|nina|niño|niña|kids|infantil|menor|chico|chica/.test(s)) return "Niños";
  return "Niños";
}

function normalizeArticulo(r) {
  return {
    codigo: String(r.codigo || "").trim(),
    descripcion: String(r.descripcion || "").trim(),
    genero: normalizeGenero(r.genero),
    ramaSeleccionada: "",
  };
}

// Construye listas de rutas por género (aplica filtro CYBER si está activo)
function buildRamasPorGenero() {
  ramasPorGenero = { Mujer: [], Hombre: [], Niños: [] };
  const sets = { Mujer: new Set(), Hombre: new Set(), Niños: new Set() };

  Object.keys(rutaToCodes).forEach((ruta) => {
    if (cyberOnly && !isCyberRuta(ruta)) return; // sólo CYBER si ON
    const g = generoFromRuta(ruta);
    if (g && sets[g]) sets[g].add(ruta);
  });

  Object.keys(sets).forEach((k) => (ramasPorGenero[k] = Array.from(sets[k]).sort()));
}

function optionListForGenero(g) {
  if (!ramasPorGenero.Mujer.length && !ramasPorGenero.Hombre.length && !ramasPorGenero.Niños.length)
    buildRamasPorGenero();
  const list = ramasPorGenero[g] || [];
  return ["", "— Seleccionar Rama —", ...list];
}

function renderTablaArticulos(filter = "") {
  const tableEl = EL("tablaArticulos");
  if (!articulos.length) {
    tableEl.innerHTML = '<div class="small">(subí el archivo de artículos)</div>';
    EL("btnExportArt").disabled = true;
    EL("btnExportArtSemi").disabled = true;
    return;
  }
  const rows = articulos.filter((a) =>
    !filter || (a.codigo + " " + a.descripcion).toLowerCase().includes(filter.toLowerCase())
  );
  const head = "<tr><th>Código</th><th>Descripción</th><th>Género</th><th>Rama</th></tr>";
  const body = rows.map((a) => {
    const opts = optionListForGenero(a.genero).map(
      (v, i) =>
        `<option value="${String(v).replaceAll('"', "&quot;")}" ${
          a.ramaSeleccionada === v ? "selected" : ""
        }>${i === 0 ? "" : v}</option>`
    ).join("");
    return `<tr>
      <td>${a.codigo}</td>
      <td>${a.descripcion}</td>
      <td><span class="pill">${a.genero}</span></td>
      <td><select data-code="${a.codigo}" class="selRama" style="width:100%">${opts}</select></td>
    </tr>`;
  }).join("");
  tableEl.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  document.querySelectorAll(".selRama").forEach((sel) =>
    sel.addEventListener("change", (e) => {
      const code = e.target.getAttribute("data-code");
      const it = articulos.find((x) => x.codigo === code);
      if (it) it.ramaSeleccionada = e.target.value;
      const anySel = articulos.some((x) => x.ramaSeleccionada);
      EL("btnExportArt").disabled = !anySel;
      EL("btnExportArtSemi").disabled = !anySel;
    })
  );
}

// Cargar artículos
EL("fileSecundario").addEventListener("change", async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  EL("summarySecundario").textContent = "Leyendo…";
  try {
    const rows = await readFile(f);
    renderTable(EL("previewSecundario"), rows, 60);
    articulos = rows.map(mapHeadersArt).map(normalizeArticulo);
    buildRamasPorGenero();
    renderTablaArticulos();
    EL("summarySecundario").innerHTML = `Archivo: <b>${f.name}</b> · Filas: <b>${rows.length}</b>`;
  } catch (err) {
    EL("summarySecundario").innerHTML = `<span class="err">Error: ${err.message}</span>`;
  }
});

// Buscar artículos
EL("buscarArt").addEventListener("input", (e) =>
  renderTablaArticulos(e.target.value || "")
);

// ===================== Exportaciones =====================
// CSV simple con coma (opcional)
EL("btnExportArt").addEventListener("click", () => {
  const cols = ["codigo", "descripcion", "genero", "rama"];
  const lines = [cols.join(",")].concat(
    articulos
      .filter((a) => a.ramaSeleccionada)
      .map((a) => cols.map((c) => csvCell(c === "rama" ? a.ramaSeleccionada : a[c])).join(","))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "articulos_ramas.csv";
  a.click();
});

// CSV requerido (punto y coma) — una línea por cada nivel de la rama seleccionada
EL("btnExportArtSemi").addEventListener("click", () => {
  const selected = articulos.filter((a) => a.ramaSeleccionada);
  if (!selected.length) return;

  const outLines = [];
  selected.forEach((a) => {
    const ruta = a.ramaSeleccionada;
    const codes = (rutaToCodes && rutaToCodes[ruta]) || [];
    codes.filter((x) => x && String(x).trim() !== "").forEach((codeCat) => {
      outLines.push([a.codigo, a.codigo, codeCat].join(";"));
    });
  });

  const blob = new Blob([outLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "asignacion_categorias_por_nivel.csv";
  a.click();
});
