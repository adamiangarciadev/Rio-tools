/******************************************************
 * BAJADA + API PEDIDOS (TIENDANUBE -> SHEETS)
 *
 * - Importa pedidos desde Gmail (Tiendanube)
 * - Evita duplicados
 * - Marca threads procesados con label
 * - Resuelve Shipnow => AVELLANEDA + "ENVÍO SHIPNOW"
 * - API:
 *   GET  listar, webtodo, estados, debug, log
 *   POST marcarRecibido, marcarRetirado, cambiarEstado
 *
 * HOJA "Pedidos" headers exactos:
 * A  ID_PEDIDO
 * B  FECHA_VENTA
 * C  CLIENTE
 * D  DNI
 * E  MONTO
 * F  COSTO_ENVIO
 * G  SUCURSAL_RETIRO
 * H  ESTADO
 * I  FECHA_INGRESO_SUCURSAL
 * J  FECHA_RETIRO
 * K  HORAS_EN_SUCURSAL
 * L  ALERTA_36HS
 * M  QUIEN_REGISTRA
 * N  CANAL
 * O  METODO_PAGO
 * P  ESTADO_PAGO
 * Q  TIPO_ENVIO
 ******************************************************/

// ===============================
// CONFIG
// ===============================

const SPREADSHEET_ID = "1nzP_vqgJ8ZP_MZZtLBWj8mynYXb2MylwJXSv8hwz9UU";
const SHEET_NAME = "Pedidos";
const LOG_SHEET_NAME = "Pedidos_LOG";

const LABEL_PROCESADO = "RIO/Pedido Importado";

// Ajustá si cambia el remitente/asunto real
const GMAIL_QUERY =
  'from:(hola+ventas@tiendanube.com) subject:("ha realizado la compra") newer_than:30d -label:"RIO/Pedido Importado"';

// ================== ESTADOS (CATÁLOGO) ==================

const ESTADOS_VALIDOS = [
  "ESPERANDO PAGO",
  "PARA ARMAR",
  "ARMANDOSE",
  "PICKEADO",
  "CONTROLADO",
  "ENVIADO",
  "ENVIADO A SUCURSAL",
  "EN SUCURSAL",
  "LISTO PARA RETIRO",
  "RETIRADO",
  "CANCELADO",
  "ESPERANDO MERCADERIA"
];

function _estadoValido(estado) {
  const e = String(estado || "").trim().toUpperCase();
  return ESTADOS_VALIDOS.includes(e);
}

// ===============================
// SPREADSHEET / SHEETS (robusto)
// ===============================

function _getSS_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function _getSheet_() {
  const ss = _getSS_();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("No existe la hoja '" + SHEET_NAME + "'");
  _validarHeadersPedidos_(sh);
  return sh;
}

function _getLogSheet_() {
  const ss = _getSS_();
  let sh = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET_NAME);
    sh.appendRow([
      "TS",
      "USUARIO",
      "ACCION",
      "ID_PEDIDO",
      "SUCURSAL",
      "ESTADO_ANTES",
      "ESTADO_DESPUES",
      "TIPO_ENVIO",
      "CANAL",
      "OBS"
    ]);
  }
  return sh;
}

function _logCambioEstado_(payload) {
  const sh = _getLogSheet_();
  const now = new Date();
  sh.appendRow([
    now,
    payload.usuario || "",
    payload.accion || "",
    payload.id_pedido || "",
    payload.sucursal || "",
    payload.estado_antes || "",
    payload.estado_despues || "",
    payload.tipo_envio || "",
    payload.canal || "",
    payload.obs || ""
  ]);
}

// ================== IMPORTADOR DESDE GMAIL ==================

function importarPedidosDesdeGmail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    const sh = _getSheet_();

    // IDs existentes
    const lastRow = sh.getLastRow();
    const existentes = new Set();
    if (lastRow > 1) {
      const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      ids.forEach(r => r[0] && existentes.add(String(r[0]).trim()));
    }

    // label
    let label = GmailApp.getUserLabelByName(LABEL_PROCESADO);
    if (!label) label = GmailApp.createLabel(LABEL_PROCESADO);

    // threads
    const threads = GmailApp.search(GMAIL_QUERY, 0, 30);
    if (!threads.length) return;

    const nuevasFilas = [];

    threads.forEach(thread => {
      if (thread.getLabels().some(l => l.getName() === LABEL_PROCESADO)) return;

      const messages = thread.getMessages();
      const msg = messages[messages.length - 1];
      const subject = msg.getSubject() || "";
      const fecha = msg.getDate();
      const bodyText = msg.getPlainBody() || "";

      const idPedido = extraerIdPedido(bodyText, subject);
      if (!idPedido) {
        label.addToThread(thread);
        return;
      }

      if (existentes.has(String(idPedido).trim())) {
        label.addToThread(thread);
        return;
      }

      const cliente    = extraerCampo(bodyText, /Nombre completo:\s*(.+)/i);
      const dni        = extraerCampo(bodyText, /DNI:\s*(.+)/i);
      const montoTotal = extraerMontoTotal(bodyText);
      const costoEnvio = extraerCostoEnvio(bodyText);
      const medioEnvio = extraerMedioEnvio(bodyText);
      const canal      = extraerCanal(subject);
      const metodoPago = extraerMetodoPago(bodyText);
      const estadoPago = extraerEstadoTransaccion(bodyText);

      const resEnvio   = resolverSucursalYTipoEnvio(medioEnvio);
      const sucursal   = resEnvio.sucursal;
      const tipoEnvio  = resEnvio.tipoEnvio;

      const estadoPagoUpper = String(estadoPago || "").toUpperCase();
      const pagado = estadoPagoUpper.includes("PAGO RECIBIDO") || estadoPagoUpper.includes("APROBADO");
      const estadoInicial = pagado ? "PARA ARMAR" : "ESPERANDO PAGO";

      nuevasFilas.push([
        String(idPedido).trim(), // A
        fecha,                   // B
        cliente,                 // C
        dni,                     // D
        montoTotal,              // E
        costoEnvio,              // F
        sucursal,                // G
        estadoInicial,           // H
        "",                      // I
        "",                      // J
        "",                      // K
        "",                      // L
        "",                      // M
        canal,                   // N
        metodoPago,              // O
        estadoPago,              // P
        tipoEnvio                // Q
      ]);

      label.addToThread(thread);
    });

    if (nuevasFilas.length) {
      sh.insertRows(2, nuevasFilas.length);
      nuevasFilas.reverse();
      sh.getRange(2, 1, nuevasFilas.length, nuevasFilas[0].length).setValues(nuevasFilas);
    }
  } finally {
    lock.releaseLock();
  }
}

// ================== PARSEO EMAIL ==================

function extraerIdPedido(text, subject) {
  const s = (subject || "") + "\n" + (text || "");

  // Patrones típicos (ajustables)
  const patterns = [
    /Pedido\s*#\s*(\d+)/i,
    /N[úu]mero\s*de\s*pedido:\s*(\d+)/i,
    /ID\s*del\s*pedido:\s*(\d+)/i,
    /Orden\s*#\s*(\d+)/i,
    /Compra\s*#\s*(\d+)/i
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return m[1].trim();
  }

  // Fallback: cualquier línea que parezca "Pedido: 1234"
  const m2 = s.match(/Pedido[:\s]+(\d+)/i);
  return (m2 && m2[1]) ? m2[1].trim() : "";
}

function extraerMontoTotal(text) {
  if (!text) return "";
  let m = text.match(/Total:\s*\$?\s*([\d\.\,]+)/i);
  if (m) return m[1].trim();
  m = text.match(/Total[^\d\$]*\$?\s*([\d\.\,]+)/i);
  return m ? m[1].trim() : "";
}

function extraerCostoEnvio(text) {
  if (!text) return "";
  const m = text.match(/Costos?\s+de\s+En[víi]o[:\s]*\$?\s*([\d\.\,]+)/i);
  return m ? m[1].trim() : "";
}

function extraerMedioEnvio(text) {
  const m = (text || "").match(/Medio de envio:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

function resolverSucursalYTipoEnvio(medioEnvio) {
  const t = (medioEnvio || "").toUpperCase();

  if (t.includes("SHIPNOW")) {
    return { sucursal: "AVELLANEDA", tipoEnvio: "ENVÍO SHIPNOW" };
  }

  if (t.includes("AVELLANEDA")) return { sucursal: "AVELLANEDA", tipoEnvio: "RETIRO" };
  if (t.includes("SARMIENTO"))  return { sucursal: "SARMIENTO",  tipoEnvio: "RETIRO" };
  if (t.includes("QUILMES"))    return { sucursal: "QUILMES",    tipoEnvio: "RETIRO" };

  return { sucursal: "OTRO", tipoEnvio: "OTRO" };
}

function extraerCanal(subject) {
  const s = (subject || "").toUpperCase();
  if (s.includes("MAYORISTA")) return "MAYORISTA";
  return "MINORISTA";
}

function extraerMetodoPago(text) {
  const m = (text || "").match(/M[ée]todo de Pago:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

function extraerEstadoTransaccion(text) {
  const m = (text || "").match(/Estado de la transacci[oó]n:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

function extraerCampo(text, regex) {
  const m = (text || "").match(regex);
  return m ? m[1].trim() : "";
}

// ================== API WEB ==================

function doGet(e) {
  try {
    const params = e.parameter || {};
    const accion = String(params.accion || "").toLowerCase();

    if (accion === "listar") {
      const sucursal = (params.sucursal || "").toUpperCase();
      const tipoEnvioFiltro = (params.tipo_envio || "").toUpperCase();
      if (!sucursal) return _jsonError("Falta parámetro 'sucursal'");
      return _listarPedidosSucursal(sucursal, tipoEnvioFiltro);
    }

    if (accion === "webtodo") {
      const estado = (params.estado || "").toUpperCase().trim();
      const tipo   = (params.tipo_envio || "").toUpperCase().trim();
      const canal  = (params.canal || "").toUpperCase().trim();
      return _webtodo({ estado, tipoEnvio: tipo, canal });
    }

    if (accion === "estados") {
      return _jsonOk({ estados: ESTADOS_VALIDOS });
    }

    if (accion === "debug") {
      return _debugPedidos_();
    }

    if (accion === "log") {
      const idPedido = String(params.id_pedido || "").trim();
      if (!idPedido) return _jsonError("Falta parámetro 'id_pedido'");
      return _logPorPedido_(idPedido);
    }

    return _jsonError("Acción GET no reconocida: " + accion);
  } catch (err) {
    return _jsonError(err);
  }
}

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : "";
    if (!raw) return _jsonError("Body vacío");

    const data = JSON.parse(raw);
    const accion = data.accion || "";

    if (accion === "marcarRecibido") return _marcarRecibido(data);
    if (accion === "marcarRetirado") return _marcarRetirado(data);
    if (accion === "cambiarEstado")  return _cambiarEstado(data);

    return _jsonError("Acción POST no reconocida: " + accion);
  } catch (err) {
    return _jsonError(err);
  }
}

// ================== GET listar ==================

function _listarPedidosSucursal(sucursal, tipoEnvioFiltro) {
  const sh = _getSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return _jsonOk({ pedidos: [] });

  const headers = data[0];
  const rows = data.slice(1);

  const idx = {};
  headers.forEach((h, i) => (idx[String(h).trim()] = i));

  const result = [];
  const isWeb = String(sucursal || "").toUpperCase() === "WEB";

  rows.forEach((row, i) => {
    const suc    = String(row[idx["SUCURSAL_RETIRO"]] || "").toUpperCase();
    const estado = String(row[idx["ESTADO"]] || "").toUpperCase();
    const tipo   = String(row[idx["TIPO_ENVIO"]] || "").toUpperCase();

    const okSucursal = isWeb ? true : (suc === sucursal);
    const okEstado = isWeb ? true : (estado !== "RETIRADO" && estado !== "CANCELADO");
    const okTipo = (!tipoEnvioFiltro || tipo === tipoEnvioFiltro);

    if (okSucursal && okEstado && okTipo) {
      result.push(_rowToPedido_(row, idx, i));
    }
  });

  return _jsonOk({ pedidos: result });
}

// ================== GET webtodo ==================

function _webtodo(filters) {
  const sh = _getSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return _jsonOk({ pedidos: [] });

  const headers = data[0];
  const rows = data.slice(1);

  const idx = {};
  headers.forEach((h, i) => (idx[String(h).trim()] = i));

  const estadoFiltro = (filters && filters.estado) ? String(filters.estado).toUpperCase().trim() : "";
  const tipoFiltro   = (filters && filters.tipoEnvio) ? String(filters.tipoEnvio).toUpperCase().trim() : "";
  const canalFiltro  = (filters && filters.canal) ? String(filters.canal).toUpperCase().trim() : "";

  const result = [];

  rows.forEach((row, i) => {
    const estado = String(row[idx["ESTADO"]] || "").toUpperCase().trim();
    const tipo   = String(row[idx["TIPO_ENVIO"]] || "").toUpperCase().trim();
    const canal  = String(row[idx["CANAL"]] || "").toUpperCase().trim();

    if (estadoFiltro && estado !== estadoFiltro) return;
    if (tipoFiltro && tipo !== tipoFiltro) return;
    if (canalFiltro && canal !== canalFiltro) return;

    result.push(_rowToPedido_(row, idx, i));
  });

  return _jsonOk({ pedidos: result });
}

function _rowToPedido_(row, idx, i) {
  const suc = String(row[idx["SUCURSAL_RETIRO"]] || "").toUpperCase();
  return {
    fila: i + 2,
    id_pedido: row[idx["ID_PEDIDO"]] || "",
    cliente: row[idx["CLIENTE"]] || "",
    dni: row[idx["DNI"]] || "",
    monto: row[idx["MONTO"]] || "",
    costo_envio: row[idx["COSTO_ENVIO"]] || "",
    sucursal_retiro: suc,
    estado: String(row[idx["ESTADO"]] || "").toUpperCase(),
    tipo_envio: row[idx["TIPO_ENVIO"]] || "",
    canal: row[idx["CANAL"]] || "",
    metodo_pago: row[idx["METODO_PAGO"]] || "",
    estado_pago: row[idx["ESTADO_PAGO"]] || "",
    fecha_ingreso_sucursal: row[idx["FECHA_INGRESO_SUCURSAL"]] || "",
    fecha_retiro: row[idx["FECHA_RETIRO"]] || "",
    alerta_36hs: row[idx["ALERTA_36HS"]] || "",
    quien_registra: row[idx["QUIEN_REGISTRA"]] || ""
  };
}

// ================== POST endpoints + auditoría ==================

function _marcarRecibido(data) {
  const sh       = _getSheet_();
  const idPedido = String(data.id_pedido || "").trim();
  const sucursal = String(data.sucursal || "").toUpperCase();
  const usuario  = data.usuario || "";

  if (!idPedido || !sucursal) return _jsonError("Faltan datos (id_pedido / sucursal)");

  const values  = sh.getDataRange().getValues();
  const headers = values[0];
  const idx     = {};
  headers.forEach((h, i) => (idx[String(h).trim()] = i));

  for (let i = 1; i < values.length; i++) {
    const row     = values[i];
    const idHoja  = String(row[idx["ID_PEDIDO"]] || "").trim();
    const sucHoja = String(row[idx["SUCURSAL_RETIRO"]] || "").toUpperCase();

    if (idHoja === idPedido && sucHoja === sucursal) {
      const fila = i + 1;
      const now  = new Date();

      const estadoAntes = String(row[idx["ESTADO"]] || "").toUpperCase().trim();
      const estadoDespues = "EN SUCURSAL";

      sh.getRange(fila, idx["ESTADO"] + 1).setValue(estadoDespues);
      sh.getRange(fila, idx["FECHA_INGRESO_SUCURSAL"] + 1).setValue(now);
      sh.getRange(fila, idx["QUIEN_REGISTRA"] + 1).setValue(usuario);

      _logCambioEstado_({
        accion: "marcarRecibido",
        usuario,
        id_pedido: idPedido,
        sucursal,
        estado_antes: estadoAntes,
        estado_despues: estadoDespues,
        tipo_envio: row[idx["TIPO_ENVIO"]] || "",
        canal: row[idx["CANAL"]] || "",
        obs: ""
      });

      return _jsonOk({ ok: true, fila, estado: estadoDespues });
    }
  }

  return _jsonError("Pedido no encontrado para esa sucursal");
}

function _marcarRetirado(data) {
  const sh       = _getSheet_();
  const idPedido = String(data.id_pedido || "").trim();
  const sucursal = String(data.sucursal || "").toUpperCase();
  const usuario  = data.usuario || "";

  if (!idPedido || !sucursal) return _jsonError("Faltan datos (id_pedido / sucursal)");

  const values  = sh.getDataRange().getValues();
  const headers = values[0];
  const idx     = {};
  headers.forEach((h, i) => (idx[String(h).trim()] = i));

  for (let i = 1; i < values.length; i++) {
    const row     = values[i];
    const idHoja  = String(row[idx["ID_PEDIDO"]] || "").trim();
    const sucHoja = String(row[idx["SUCURSAL_RETIRO"]] || "").toUpperCase();

    if (idHoja === idPedido && sucHoja === sucursal) {
      const fila = i + 1;
      const now  = new Date();

      const estadoAntes = String(row[idx["ESTADO"]] || "").toUpperCase().trim();
      const estadoDespues = "RETIRADO";

      sh.getRange(fila, idx["ESTADO"] + 1).setValue(estadoDespues);
      sh.getRange(fila, idx["FECHA_RETIRO"] + 1).setValue(now);
      sh.getRange(fila, idx["QUIEN_REGISTRA"] + 1).setValue(usuario);

      _logCambioEstado_({
        accion: "marcarRetirado",
        usuario,
        id_pedido: idPedido,
        sucursal,
        estado_antes: estadoAntes,
        estado_despues: estadoDespues,
        tipo_envio: row[idx["TIPO_ENVIO"]] || "",
        canal: row[idx["CANAL"]] || "",
        obs: ""
      });

      return _jsonOk({ ok: true, fila, estado: estadoDespues });
    }
  }

  return _jsonError("Pedido no encontrado para esa sucursal");
}

function _cambiarEstado(data) {
  const sh       = _getSheet_();
  const idPedido = String(data.id_pedido || "").trim();
  const sucursal = String(data.sucursal || "").toUpperCase();
  const usuario  = data.usuario || "";
  const nuevo    = String(data.estado || "").toUpperCase().trim();

  if (!idPedido || !sucursal || !nuevo) {
    return _jsonError("Faltan datos (id_pedido / sucursal / estado)");
  }

  if (!_estadoValido(nuevo)) {
    return _jsonError("Estado no permitido: " + nuevo);
  }

  const values  = sh.getDataRange().getValues();
  const headers = values[0];
  const idx     = {};
  headers.forEach((h, i) => (idx[String(h).trim()] = i));

  for (let i = 1; i < values.length; i++) {
    const row     = values[i];
    const idHoja  = String(row[idx["ID_PEDIDO"]] || "").trim();
    const sucHoja = String(row[idx["SUCURSAL_RETIRO"]] || "").toUpperCase();

    if (idHoja === idPedido && sucHoja === sucursal) {
      const fila = i + 1;

      const estadoAntes = String(row[idx["ESTADO"]] || "").toUpperCase().trim();
      const estadoDespues = nuevo;

      sh.getRange(fila, idx["ESTADO"] + 1).setValue(estadoDespues);
      if (usuario && idx["QUIEN_REGISTRA"] != null) {
        sh.getRange(fila, idx["QUIEN_REGISTRA"] + 1).setValue(usuario);
      }

      _logCambioEstado_({
        accion: "cambiarEstado",
        usuario,
        id_pedido: idPedido,
        sucursal,
        estado_antes: estadoAntes,
        estado_despues: estadoDespues,
        tipo_envio: row[idx["TIPO_ENVIO"]] || "",
        canal: row[idx["CANAL"]] || "",
        obs: ""
      });

      return _jsonOk({ ok: true, fila, estado: estadoDespues });
    }
  }

  return _jsonError("Pedido no encontrado para esa sucursal");
}

// ================== GET debug + log ==================

function _debugPedidos_() {
  const sh = _getSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const countByEstado = {};
  rows.forEach(r => {
    const e = String(r[idx["ESTADO"]] || "").toUpperCase().trim() || "(VACIO)";
    countByEstado[e] = (countByEstado[e] || 0) + 1;
  });

  const sample = rows.slice(0, 8).map(r => ({
    id: r[idx["ID_PEDIDO"]],
    sucursal: String(r[idx["SUCURSAL_RETIRO"]] || "").toUpperCase(),
    estado: String(r[idx["ESTADO"]] || "").toUpperCase(),
    tipo_envio: String(r[idx["TIPO_ENVIO"]] || "").toUpperCase(),
    canal: String(r[idx["CANAL"]] || "").toUpperCase()
  }));

  return _jsonOk({
    spreadsheet_id: SPREADSHEET_ID,
    sheet: SHEET_NAME,
    totalRows: rows.length,
    headers,
    countByEstado,
    sample
  });
}

function _logPorPedido_(idPedido) {
  const sh = _getLogSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return _jsonOk({ logs: [] });

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const logs = [];
  rows.forEach(r => {
    const id = String(r[idx["ID_PEDIDO"]] || "").trim();
    if (id === idPedido) {
      logs.push({
        ts: r[idx["TS"]] || "",
        usuario: r[idx["USUARIO"]] || "",
        accion: r[idx["ACCION"]] || "",
        id_pedido: id,
        sucursal: r[idx["SUCURSAL"]] || "",
        estado_antes: r[idx["ESTADO_ANTES"]] || "",
        estado_despues: r[idx["ESTADO_DESPUES"]] || "",
        tipo_envio: r[idx["TIPO_ENVIO"]] || "",
        canal: r[idx["CANAL"]] || "",
        obs: r[idx["OBS"]] || ""
      });
    }
  });

  return _jsonOk({ logs });
}

// ================== RESPUESTAS JSON ==================

function _jsonOk(obj) {
  const out = Object.assign({ ok: true }, obj);
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function _jsonError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================== VALIDACIÓN DE HEADERS ==================

function _validarHeadersPedidos_(sh) {
  const required = [
    "ID_PEDIDO",
    "FECHA_VENTA",
    "CLIENTE",
    "DNI",
    "MONTO",
    "COSTO_ENVIO",
    "SUCURSAL_RETIRO",
    "ESTADO",
    "FECHA_INGRESO_SUCURSAL",
    "FECHA_RETIRO",
    "HORAS_EN_SUCURSAL",
    "ALERTA_36HS",
    "QUIEN_REGISTRA",
    "CANAL",
    "METODO_PAGO",
    "ESTADO_PAGO",
    "TIPO_ENVIO"
  ];

  const lastCol = sh.getLastColumn();
  if (lastCol < required.length) {
    throw new Error("La hoja '" + SHEET_NAME + "' tiene menos columnas que las requeridas (falta TIPO_ENVIO al final).");
  }

  const headers = sh.getRange(1, 1, 1, required.length).getValues()[0].map(h => String(h).trim());
  for (let i = 0; i < required.length; i++) {
    if (headers[i] !== required[i]) {
      throw new Error(
        "Header inválido en columna " + (i + 1) +
        ". Esperado: '" + required[i] + "' | Encontrado: '" + headers[i] + "'"
      );
    }
  }
}
