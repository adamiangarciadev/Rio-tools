/*********************************************************
 * DASHBOARD ASISTENCIA - RIO
 * Apps Script independiente y solo lectura.
 *
 * Fuente:
 * https://docs.google.com/spreadsheets/d/1IQ7azWM1GO7wMwuD9KIu0z-dchH5yixEYJBGXVfA7XI
 * Acciones:
 * - GET ?accion=listar_asistencia&mes=YYYY-MM
 * - GET ?accion=ping
 *********************************************************/

const SPREADSHEET_ID = "1IQ7azWM1GO7wMwuD9KIu0z-dchH5yixEYJBGXVfA7XI";
const EVENTOS_SHEET_NAME = "EVENTOS";
const PADRON_SHEET_NAME = "PADRON";
const SUCURSALES_SHEET_NAME = "SUCURSALES";
const FERIADOS_SHEET_NAME = "FERIADOS";
const TIMEZONE = "America/Argentina/Buenos_Aires";

function doGet(e) {
  try {
    const accion = cleanStr(e && e.parameter && e.parameter.accion);

    if (accion === "ping") {
      return jsonOut({
        ok: true,
        app: "asistencia-dashboard",
        ts: new Date().toISOString()
      });
    }

    if (accion === "listar_asistencia") {
      return listarAsistencia_(e);
    }

    return jsonOut({
      ok: true,
      app: "asistencia-dashboard",
      msg: "API asistencia dashboard activa"
    });

  } catch (err) {
    Logger.log("ERROR asistencia-dashboard: " + (err.stack || err.message || err));
    return jsonOut({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function listarAsistencia_(e) {
  const mes = cleanStr(e && e.parameter && e.parameter.mes);

  const eventos = leerEventos_(mes);
  const padron = leerPadron_();
  const sucursales = leerSucursales_();
  const feriados = leerFeriados_();

  return jsonOut({
    ok: true,
    data: eventos,
    padron: padron,
    sucursales: sucursales,
    feriados: feriados,
    total: eventos.length
  });
}

function leerEventos_(mes) {
  const sh = getSheet_(EVENTOS_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  const displayValues = sh.getDataRange().getDisplayValues();

  if (values.length < 2) return [];

  const headers = normalizarHeaders_(displayValues[0]);
  const out = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const display = displayValues[i];
    const fecha = pickDate_(row, display, headers, ["fecha", "fecha_operativa", "fecha operativa", "dia"]);
    const fechaTexto = fecha
      ? Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM-dd")
      : pick_(display, headers, ["fecha", "fecha_operativa", "fecha operativa", "dia"]);

    if (mes && fechaTexto.indexOf(mes) !== 0) continue;

    const vendedorId = pick_(display, headers, ["vendedor_id", "vendedor id", "id", "legajo", "codigo"]);
    const vendedorNombre = pick_(display, headers, ["vendedor_nombre", "vendedor nombre", "apellido_nombre", "apellido nombre", "nombre", "empleado"]);
    const sucursal = pick_(display, headers, ["sucursal", "local"]);
    const tipoEvento = pick_(display, headers, ["tipo_evento", "tipo evento", "tipo", "evento"]);

    if (!fechaTexto && !vendedorId && !vendedorNombre && !sucursal && !tipoEvento) continue;

    out.push({
      rowNumber: i + 1,
      fecha: fechaTexto,
      sucursal: sucursal,
      vendedor_id: vendedorId,
      vendedor_nombre: vendedorNombre,
      tipo_evento: tipoEvento,
      hora_declarada: pick_(display, headers, ["hora_declarada", "hora declarada", "hora"]),
      timestamp_carga: pick_(display, headers, ["timestamp_carga", "timestamp carga", "timestamp", "carga"]),
      observacion: pick_(display, headers, ["observacion", "observacion", "obs"])
    });
  }

  out.sort(function(a, b) {
    return cleanStr(b.fecha).localeCompare(cleanStr(a.fecha));
  });

  return out;
}

function leerPadron_() {
  const sh = sheetOrNull_(PADRON_SHEET_NAME);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  const displayValues = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = normalizarHeaders_(displayValues[0]);
  const out = [];

  for (let i = 1; i < values.length; i++) {
    const display = displayValues[i];
    const vendedorId = pick_(display, headers, ["vendedor_id", "vendedor id", "id", "legajo", "codigo"]);
    const nombre = pick_(display, headers, ["apellido_nombre", "apellido nombre", "vendedor_nombre", "vendedor nombre", "nombre", "empleado"]);
    const sucursal = pick_(display, headers, ["sucursal_base", "sucursal base", "sucursal", "local"]);
    const rol = pick_(display, headers, ["rol", "puesto", "cargo"]);
    const horarioEntrada = pick_(display, headers, ["horario_teorico_entrada", "horario teorico entrada", "horario_teórico_entrada", "hora entrada", "horario"]);
    const estado = pick_(display, headers, ["estado", "activo", "activa", "situacion", "situación"]);
    const fechaBaja = pick_(display, headers, ["fecha_baja", "fecha baja", "baja"]);

    if (!vendedorId && !nombre && !sucursal) continue;

    out.push({
      rowNumber: i + 1,
      vendedor_id: vendedorId,
      apellido_nombre: nombre,
      sucursal_base: sucursal,
      rol: rol,
      horario_teorico_entrada: horarioEntrada,
      estado: estado,
      fecha_baja: fechaBaja
    });
  }

  return out;
}

function leerSucursales_() {
  const sh = sheetOrNull_(SUCURSALES_SHEET_NAME);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  const displayValues = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = normalizarHeaders_(displayValues[0]);
  const out = [];

  for (let i = 1; i < values.length; i++) {
    const display = displayValues[i];
    const sucursal = pick_(display, headers, ["sucursal", "local"]);
    const horarioApertura = pick_(display, headers, ["horario_apertura", "horario apertura", "apertura", "hora_apertura", "hora apertura"]);

    if (!sucursal) continue;

    out.push({
      rowNumber: i + 1,
      sucursal: sucursal,
      horario_apertura: horarioApertura
    });
  }

  return out;
}

function leerFeriados_() {
  const sh = sheetOrNull_(FERIADOS_SHEET_NAME);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  const displayValues = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = normalizarHeaders_(displayValues[0]);
  const out = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const display = displayValues[i];
    const fecha = pickDate_(row, display, headers, ["fecha", "dia", "feriado"]);
    const fechaTexto = fecha
      ? Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM-dd")
      : pick_(display, headers, ["fecha", "dia", "feriado"]);

    if (!fechaTexto) continue;

    out.push({
      fecha: fechaTexto,
      descripcion: pick_(display, headers, ["feriado", "descripcion", "detalle", "motivo", "observacion", "obs"]),
      tipo: pick_(display, headers, ["tipo"]),
      anio: pick_(display, headers, ["año", "anio", "ano"])
    });
  }

  return out;
}

function getSheet_(name) {
  const sh = sheetOrNull_(name);
  if (!sh) throw new Error("No existe la hoja " + name);
  return sh;
}

function sheetOrNull_(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(name);
}

function normalizarHeaders_(row) {
  const out = {};
  row.forEach(function(header, index) {
    out[normalizarTexto_(header)] = index;
  });
  return out;
}

function pick_(row, headers, names) {
  for (let i = 0; i < names.length; i++) {
    const index = headers[normalizarTexto_(names[i])];
    if (index != null) return cleanStr(row[index]);
  }
  return "";
}

function pickDate_(row, display, headers, names) {
  for (let i = 0; i < names.length; i++) {
    const index = headers[normalizarTexto_(names[i])];
    if (index == null) continue;
    const raw = row[index];
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
    const parsed = parseDate_(display[index]);
    if (parsed) return parsed;
  }
  return null;
}

function parseDate_(value) {
  const text = cleanStr(value);
  if (!text) return null;

  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = text.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function normalizarTexto_(value) {
  return cleanStr(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function cleanStr(value) {
  return String(value == null ? "" : value).trim();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
