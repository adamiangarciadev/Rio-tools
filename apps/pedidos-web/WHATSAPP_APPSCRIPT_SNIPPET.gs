// =====================================================
// AGREGAR A TU APPS SCRIPT ACTUAL PARA PEDIDOS WHATSAPP
// =====================================================

// 1) En doPost(e), agregar esta linea antes de:
// return _jsonError("Accion POST no reconocida: " + accion);
//
// if (accion === "crearPedidoWhatsapp") return _crearPedidoWhatsapp(data);


// 2) Pegar esta funcion antes de _marcarRecibido(data).
// Usa las mismas variables y helpers de tu script actual:
// _getSheet_, _jsonError, _jsonOk, _logCambioEstado_.

function _crearPedidoWhatsapp(data) {
  const sh = _getSheet_();

  const cliente = String(data.cliente || "").trim();
  const dni = String(data.dni || "").trim();
  const tipoEnvio = String(data.tipo_envio || "RETIRO").toUpperCase().trim();
  const remito = String(data.remito || "").trim();
  const usuario = String(data.usuario || "").trim();

  if (!cliente || !usuario) {
    return _jsonError("Faltan datos obligatorios (cliente / usuario)");
  }

  const idPedido = remito
    ? "WSP-" + remito
    : "WSP-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss");

  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  // Respeta la logica nueva de duplicados por CANAL + ID_PEDIDO.
  const canal = "WHATSAPP";
  const claveNueva = `${canal}|${idPedido}`;

  for (let i = 1; i < values.length; i++) {
    const idHoja = String(values[i][idx["ID_PEDIDO"]] || "").trim();
    const canalHoja = String(values[i][idx["CANAL"]] || "").trim().toUpperCase();
    const claveHoja = `${canalHoja}|${idHoja}`;

    if (claveHoja === claveNueva) {
      return _jsonError("Ya existe un pedido WhatsApp con ese remito/id: " + idPedido);
    }
  }

  const row = new Array(headers.length).fill("");
  row[idx["ID_PEDIDO"]] = idPedido;
  row[idx["FECHA_VENTA"]] = new Date();
  row[idx["CLIENTE"]] = cliente;
  row[idx["DNI"]] = dni;
  row[idx["SUCURSAL_RETIRO"]] = "WEB";
  row[idx["ESTADO"]] = "PARA ARMAR";
  row[idx["QUIEN_REGISTRA"]] = usuario;
  row[idx["CANAL"]] = canal;
  row[idx["TIPO_ENVIO"]] = tipoEnvio;

  sh.insertRowBefore(2);
  sh.getRange(2, 1, 1, row.length).setValues([row]);

  _logCambioEstado_({
    accion: "crearPedidoWhatsapp",
    usuario,
    id_pedido: idPedido,
    sucursal: "WEB",
    estado_antes: "",
    estado_despues: "PARA ARMAR",
    tipo_envio: tipoEnvio,
    canal,
    obs: remito ? "Remito informado: " + remito : "Alta manual desde Pedidos Web"
  });

  return _jsonOk({
    pedido: {
      id_pedido: idPedido,
      cliente,
      dni,
      sucursal_retiro: "WEB",
      estado: "PARA ARMAR",
      tipo_envio: tipoEnvio,
      canal,
      quien_registra: usuario,
      fecha_venta: new Date()
    }
  });
}
