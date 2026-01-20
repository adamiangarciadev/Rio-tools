/******************************************************
 * BAJADA + API PEDIDOS (TIENDANUBE -> SHEETS)
 * - Importa pedidos desde Gmail (Tiendanube)
 * - Evita duplicados
 * - Marca threads procesados con label
 * - Resuelve Shipnow => AVELLANEDA + "ENVÍO SHIPNOW"
 * - Expone API (GET listar, POST marcarRecibido, marcarRetirado, cambiarEstado)
 *
 * REQUISITOS EN LA HOJA "Pedidos" (headers exactos):
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
 * Q  TIPO_ENVIO   (NUEVO - obligatorio)
 ******************************************************/

const SHEET_NAME = "Pedidos";
const LABEL_PROCESADO = "RIO/Pedido Importado";

// Leo TODOS los mails de Tiendanube (mayorista y minorista) de los últimos 30 días
const GMAIL_QUERY = 'from:(hola+ventas@tiendanube.com) subject:("ha realizado la compra") newer_than:30d -label:"RIO/Pedido Importado"';

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

// ================== IMPORTADOR DESDE GMAIL ==================

function importarPedidosDesdeGmail() {
  // Evita ejecuciones solapadas (muy importante con triggers)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sh) throw new Error("No existe la hoja '" + SHEET_NAME + "'");

    _validarHeadersPedidos_(sh);

    // IDs de pedido ya registrados para no duplicar
    const lastRow = sh.getLastRow();
    const existentes = new Set();
    if (lastRow > 1) {
      const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues(); // col A
      ids.forEach(r => {
        if (r[0]) existentes.add(String(r[0]).trim());
      });
    }

    // Etiqueta para marcar threads ya procesados
    let label = GmailApp.getUserLabelByName(LABEL_PROCESADO);
    if (!label) label = GmailApp.createLabel(LABEL_PROCESADO);

    // Importante: limitar cantidad de hilos por corrida para cuidar cuota
    const threads = GmailApp.search(GMAIL_QUERY, 0, 30);
    if (!threads.length) return;

    const nuevasFilas = [];

    threads.forEach(thread => {
      // Por seguridad: si ya tiene label (aunque el query lo evita), lo saltamos
      if (thread.getLabels().some(l => l.getName() === LABEL_PROCESADO)) return;

      const messages = thread.getMessages();
      const msg = messages[messages.length - 1]; // último mensaje del hilo
      const subject = msg.getSubject() || "";
      const fecha = msg.getDate();
      const bodyText = msg.getPlainBody(); // sin normalizar

      const idPedido = extraerIdPedido(bodyText, subject);
      if (!idPedido) {
        label.addToThread(thread);
        return;
      }

      if (existentes.has(String(idPedido))) {
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

      // Estado inicial:
      // - Si pago recibido/aprobado => PARA ARMAR
      // - Si no => ESPERANDO PAGO
      const estadoPagoUpper = String(estadoPago || "").toUpperCase();
      const pagado = estadoPagoUpper.includes("PAGO RECIBIDO") || estadoPagoUpper.includes("APROBADO");
      const estadoInicial = pagado ? "PARA ARMAR" : "ESPERANDO PAGO";

      nuevasFilas.push([
        idPedido,        // A ID_PEDIDO
        fecha,           // B FECHA_VENTA
        cliente,         // C CLIENTE
        dni,             // D DNI
        montoTotal,      // E MONTO
        costoEnvio,      // F COSTO_ENVIO
        sucursal,        // G SUCURSAL_RETIRO
        estadoInicial,   // H ESTADO
        "",              // I FECHA_INGRESO_SUCURSAL
        "",              // J FECHA_RETIRO
        "",              // K HORAS_EN_SUCURSAL
        "",              // L ALERTA_36HS
        "",              // M QUIEN_REGISTRA
        canal,           // N CANAL
        metodoPago,      // O METODO_PAGO
        estadoPago,      // P ESTADO_PAGO
        tipoEnvio        // Q TIPO_ENVIO
      ]);

      // Marco el hilo como procesado (doble seguridad)
      label.addToThread(thread);
    });

    if (nuevasFilas.length) {
      sh.insertRows(2, nuevasFilas.length);

      // Más nuevo primero
      nuevasFilas.reverse();

      sh.getRange(2, 1, nuevasFilas.length, nuevasFilas[0].length).setValues(nuevasFilas);
    }

  } finally {
    lock.releaseLock();
  }
}

// Monto total (TOTAL de la orden)
function extraerMontoTotal(text) {
  if (!text) return "";
  let m = text.match(/Total:\s*\$?\s*([\d\.\,]+)/i);
  if (m) return m[1].trim();

  m = text.match(/Total[^\d\$]*\$?\s*([\d\.\,]+)/i);
  return m ? m[1].trim() : "";
}

// Costo de envío
function extraerCostoEnvio(text) {
  if (!text) return "";
  const m = text.match(/Costos?\s+de\s+En[víi]o[:\s]*\$?\s*([\d\.\,]+)/i);
  return m ? m[1].trim() : "";
}

// Línea “Medio de envio”
function extraerMedioEnvio(text) {
  const m = (text || "").match(/Medio de envio:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

/*
  Reglas:
  - Shipnow => AVELLANEDA + "ENVÍO SHIPNOW"
  - Retiro en sucursal => misma sucursal + "RETIRO"
  - Otros => "OTRO"
*/
function resolverSucursalYTipoEnvio(medioEnvio) {
  const t = (medioEnvio || "").toUpperCase();

  if (t.includes("SHIPNOW")) {
    return { sucursal: "AVELLANEDA", tipoEnvio: "ENVÍO SHIPNOW" };
  }

  if (t.includes("AVELLANEDA")) return { sucursal: "AVELLANEDA", tipoEnvio: "RETIRO" };
  if (t.includes("SARMIENTO"))  return { sucursal: "SARMIENTO",  tipoEnvio: "RETIRO" };
  if (t.includes("QUILMES"))    return { sucursal: "QUILMES",    tipoEnvio: "RETIRO" };

  // Podés sumar más sucursales acá si aparecen en el texto del medio de envío

  return { sucursal: "OTRO", tipoEnvio: "OTRO" };
}

// Canal
function extraerCanal(subject) {
  const s = (subject || "").toUpperCase();
  if (s.includes("MAYORISTA")) return "MAYORISTA";
  return "MINORISTA";
}

// Método de pago
function extraerMetodoPago(text) {
  const m = (text || "").match(/M[ée]todo de Pago:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

// Estado de transacción
function extraerEstadoTransaccion(text) {
  const m = (text || "").match(/Estado de la transacci[oó]n:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

// Campo genérico
function extraerCampo(text, regex) {
  const m = (text || "").match(regex);
  return m ? m[1].trim() : "";
}

// ================== API WEB PARA LA HOJA "Pedidos" ==================

function doGet(e) {
  try {
    const params   = e.parameter || {};
    const accion   = params.accion || "";
    const sucursal = (params.sucursal || "").toUpperCase();
    const tipoEnvioFiltro = (params.tipo_envio || "").toUpperCase(); // opcional: "ENVÍO SHIPNOW" / "RETIRO" etc.

    if (accion === "listar") {
      if (!sucursal) return _jsonError("Falta parámetro 'sucursal'");
      return _listarPedidosSucursal(sucursal, tipoEnvioFiltro);
    }

    if (accion === "estados") {
      return _jsonOk({ estados: ESTADOS_VALIDOS });
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

    const data   = JSON.parse(raw);
    const accion = data.accion || "";

    if (accion === "marcarRecibido") return _marcarRecibido(data);
    if (accion === "marcarRetirado") return _marcarRetirado(data);
    if (accion === "cambiarEstado")  return _cambiarEstado(data);

    return _jsonError("Acción POST no reconocida: " + accion);
  } catch (err) {
    return _jsonError(err);
  }
}

function _getSheet() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("No existe la hoja '" + SHEET_NAME + "'");
  _validarHeadersPedidos_(sh);
  return sh;
}

function _listarPedidosSucursal(sucursal, tipoEnvioFiltro) {
  const sh   = _getSheet();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return _jsonOk({ pedidos: [] });

  const headers = data[0];
  const rows    = data.slice(1);

  const idx = {};
  headers.forEach((h, i) => (idx[String(h).trim()] = i));

  const result = [];
  const isWeb = String(sucursal || "").toUpperCase() === "WEB";

  rows.forEach((row, i) => {
    const suc    = String(row[idx["SUCURSAL_RETIRO"]] || "").toUpperCase();
    const estado = String(row[idx["ESTADO"]] || "").toUpperCase();
    const tipo   = String(row[idx["TIPO_ENVIO"]] || "").toUpperCase();

    // WEB: no filtra por sucursal (muestra todo)
    // Sucursal normal: filtra por la sucursal pedida
    const okSucursal = isWeb ? true : (suc === sucursal);

    const okEstado = isWeb
      ? true
      : (estado !== "RETIRADO" && estado !== "CANCELADO");

    const okTipo = (!tipoEnvioFiltro || tipo === tipoEnvioFiltro);

    if (okSucursal && okEstado && okTipo) {
      result.push({
        fila: i + 2,
        id_pedido: row[idx["ID_PEDIDO"]] || "",
        cliente: row[idx["CLIENTE"]] || "",
        dni: row[idx["DNI"]] || "",
        monto: row[idx["MONTO"]] || "",
        costo_envio: row[idx["COSTO_ENVIO"]] || "",
        sucursal_retiro: suc,
        estado: estado,
        tipo_envio: row[idx["TIPO_ENVIO"]] || "",
        canal: row[idx["CANAL"]] || "",
        metodo_pago: row[idx["METODO_PAGO"]] || "",
        estado_pago: row[idx["ESTADO_PAGO"]] || "",
        fecha_ingreso_sucursal: row[idx["FECHA_INGRESO_SUCURSAL"]] || "",
        fecha_retiro: row[idx["FECHA_RETIRO"]] || "",
        alerta_36hs: row[idx["ALERTA_36HS"]] || "",
        quien_registra: row[idx["QUIEN_REGISTRA"]] || ""
      });
    }
  });

  return _jsonOk({ pedidos: result });
}


function _marcarRecibido(data) {
  const sh       = _getSheet();
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

      sh.getRange(fila, idx["ESTADO"] + 1).setValue("EN SUCURSAL");
      sh.getRange(fila, idx["FECHA_INGRESO_SUCURSAL"] + 1).setValue(now);
      sh.getRange(fila, idx["QUIEN_REGISTRA"] + 1).setValue(usuario);

      return _jsonOk({ ok: true, fila: fila, estado: "EN SUCURSAL" });
    }
  }

  return _jsonError("Pedido no encontrado para esa sucursal");
}

function _marcarRetirado(data) {
  const sh       = _getSheet();
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

      sh.getRange(fila, idx["ESTADO"] + 1).setValue("RETIRADO");
      sh.getRange(fila, idx["FECHA_RETIRO"] + 1).setValue(now);
      sh.getRange(fila, idx["QUIEN_REGISTRA"] + 1).setValue(usuario);

      return _jsonOk({ ok: true, fila: fila, estado: "RETIRADO" });
    }
  }

  return _jsonError("Pedido no encontrado para esa sucursal");
}

/*
  Endpoint genérico para setear estados del flujo:
  body JSON:
  {
    "accion": "cambiarEstado",
    "id_pedido": "746",
    "sucursal": "AVELLANEDA",
    "estado": "PICKEADO",
    "usuario": "Enzo"
  }
*/
function _cambiarEstado(data) {
  const sh       = _getSheet();
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

      sh.getRange(fila, idx["ESTADO"] + 1).setValue(nuevo);
      if (usuario && idx["QUIEN_REGISTRA"] != null) {
        sh.getRange(fila, idx["QUIEN_REGISTRA"] + 1).setValue(usuario);
      }

      return _jsonOk({ ok: true, fila: fila, estado: nuevo });
    }
  }

  return _jsonError("Pedido no encontrado para esa sucursal");
}

// ================== RESPUESTAS JSON ==================

function _jsonOk(obj) {
  const out = Object.assign({ ok: true }, obj);
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function _jsonError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const out = { ok: false, error: msg };
  return ContentService
    .createTextOutput(JSON.stringify(out))
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
    throw new Error("La hoja '" + SHEET_NAME + "' tiene menos columnas que las requeridas. Falta TIPO_ENVIO al final.");
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