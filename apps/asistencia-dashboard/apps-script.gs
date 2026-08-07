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
const ZNUBE_SHEET_NAME = "ZNUBE_FICHAJES";
const AUDITORIA_SHEET_NAME = "AUDITORIA_ASISTENCIA";
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

  const eventosApp = leerEventos_(mes);
  const fichajesZnube = leerFichajesZnube_(mes);
  const eventos = cruzarAsistencia_(fichajesZnube, eventosApp);
  const auditoria = leerAuditoria_(mes);
  const padron = leerPadron_();
  const sucursales = leerSucursales_();
  const feriados = leerFeriados_();

  return jsonOut({
    ok: true,
    data: eventos,
    padron: padron,
    sucursales: sucursales,
    feriados: feriados,
    auditoria: auditoria,
    total: eventos.length,
    fuentes: {
      znube: fichajesZnube.length,
      eventos: eventosApp.length
    }
  });
}

/**
 * Lee los fichajes originales. Para el dashboard solo interesa la primera
 * marcacion de cada persona por dia (la entrada efectiva).
 */
function leerFichajesZnube_(mes) {
  const sh = sheetOrNull_(ZNUBE_SHEET_NAME);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  const displayValues = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = normalizarHeaders_(displayValues[0]);
  const porPersonaDia = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const display = displayValues[i];
    const fecha = pickDate_(row, display, headers, ["fecha", "dia"]);
    const fechaTexto = fecha
      ? Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM-dd")
      : normalizarFechaTexto_(pick_(display, headers, ["fecha", "dia"]));

    if (mes && fechaTexto.indexOf(mes) !== 0) continue;

    const vendedorId = pick_(display, headers, ["vendedor_id", "vendedor id", "id", "legajo", "codigo"]);
    if (!fechaTexto || !vendedorId) continue;

    const fichaje = {
      rowNumber: i + 1,
      fecha: fechaTexto,
      sucursal: pick_(display, headers, ["puesto_control", "puesto control", "sucursal", "local"]),
      vendedor_id: vendedorId,
      vendedor_nombre: pick_(display, headers, ["vendedor_nombre", "vendedor nombre", "nombre", "empleado"]),
      tipo_evento: "ENTRADA",
      hora_declarada: pick_(display, headers, ["hora_fichaje", "hora fichaje", "hora"]),
      timestamp_carga: pick_(display, headers, ["fecha_email", "fecha email"]),
      observacion: "Fichaje zNube",
      fuente: "ZNUBE",
      perfil_znube: pick_(display, headers, ["perfil"])
    };

    const key = clavePersonaDia_(fechaTexto, vendedorId);
    const actual = porPersonaDia[key];
    if (!actual || horaComparable_(fichaje.hora_declarada) < horaComparable_(actual.hora_declarada)) {
      porPersonaDia[key] = fichaje;
    }
  }

  return Object.keys(porPersonaDia).map(function(key) { return porPersonaDia[key]; });
}

/**
 * Prioridad del cruce: si existe zNube para fecha + legajo, se descartan los
 * EVENTOS de esa misma persona/dia. EVENTOS queda como respaldo cuando zNube
 * no tiene una marcacion.
 */
function cruzarAsistencia_(fichajesZnube, eventosApp) {
  const eventosPorClave = {};
  eventosApp.forEach(function(row) {
    const key = clavePersonaDia_(row.fecha, row.vendedor_id);
    if (!eventosPorClave[key]) eventosPorClave[key] = [];
    eventosPorClave[key].push(row);
  });

  const clavesZnube = {};
  fichajesZnube.forEach(function(row) {
    const key = clavePersonaDia_(row.fecha, row.vendedor_id);
    clavesZnube[key] = true;

    // zNube define presencia, hora y puesto. EVENTOS solo complementa los
    // campos administrativos que zNube no posee: observacion y comprobante.
    const complementos = eventosPorClave[key] || [];
    const conComprobante = complementos.find(function(item) { return cleanStr(item.comprobante_url); });
    const conObservacion = complementos.find(function(item) { return cleanStr(item.observacion); });
    const complemento = conComprobante || conObservacion || complementos[0];
    if (complemento) {
      row.observacion = cleanStr(complemento.observacion);
      row.comprobante_url = cleanStr(complemento.comprobante_url);
      row.comprobante_file_id = cleanStr(complemento.comprobante_file_id);
    }
  });

  const eventosRespaldo = eventosApp.filter(function(row) {
    return !clavesZnube[clavePersonaDia_(row.fecha, row.vendedor_id)];
  }).map(function(row) {
    row.fuente = "EVENTOS";
    return row;
  });

  return fichajesZnube.concat(eventosRespaldo).sort(function(a, b) {
    return cleanStr(b.fecha).localeCompare(cleanStr(a.fecha)) ||
      cleanStr(a.vendedor_id).localeCompare(cleanStr(b.vendedor_id));
  });
}

function leerAuditoria_(mes) {
  const sh = sheetOrNull_(AUDITORIA_SHEET_NAME);
  if (!sh) return [];
  const rows = sh.getDataRange().getDisplayValues();
  if (rows.length < 2) return [];
  const headers = normalizarHeaders_(rows[0]);

  return rows.slice(1).map(function(row, index) {
    const fecha = normalizarFechaTexto_(pick_(row, headers, ["fecha", "dia"]));
    return {
      rowNumber: index + 2,
      fecha: fecha,
      vendedor_id: pick_(row, headers, ["vendedor_id", "vendedor id", "legajo", "id"]),
      vendedor_nombre: pick_(row, headers, ["vendedor_nombre", "vendedor nombre", "nombre"]),
      estado_cruce: pick_(row, headers, ["estado_cruce", "estado cruce"]),
      sucursal_app: pick_(row, headers, ["sucursal_app", "sucursal app"]),
      puesto_control_znube: pick_(row, headers, ["puesto_control_znube", "puesto control znube"]),
      hora_declarada_app: pick_(row, headers, ["hora_declarada_app", "hora declarada app"]),
      hora_fichaje_znube: pick_(row, headers, ["hora_fichaje_znube", "hora fichaje znube"])
    };
  }).filter(function(row) {
    return row.fecha && (!mes || row.fecha.indexOf(mes) === 0);
  });
}

function clavePersonaDia_(fecha, vendedorId) {
  return normalizarFechaTexto_(fecha) + "|" + cleanStr(vendedorId);
}

function horaComparable_(value) {
  const match = cleanStr(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

function normalizarFechaTexto_(value) {
  const parsed = parseDate_(value);
  return parsed ? Utilities.formatDate(parsed, TIMEZONE, "yyyy-MM-dd") : cleanStr(value);
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
      observacion: pick_(display, headers, ["observacion", "observacion", "obs"]),
      comprobante_url: obtenerUrlComprobante_(display, headers),
      comprobante_file_id: pick_(display, headers, ["comprobante_file_id", "comprobante file id", "drive_file_id", "file_id"]),
      fuente: "EVENTOS"
    });
  }

  out.sort(function(a, b) {
    return cleanStr(b.fecha).localeCompare(cleanStr(a.fecha));
  });

  return out;
}

function obtenerUrlComprobante_(row, headers) {
  const url = pick_(row, headers, ["comprobante_url", "comprobante url", "url_comprobante", "url comprobante", "archivo_url", "archivo url"]);
  if (url) return url;
  const fileId = pick_(row, headers, ["comprobante_file_id", "comprobante file id", "drive_file_id", "file_id"]);
  return fileId ? "https://drive.google.com/file/d/" + encodeURIComponent(fileId) + "/view" : "";
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
