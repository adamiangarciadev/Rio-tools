(() => {
  'use strict';

  const SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbzGKHbA-H474RmyjTCd9CXrY6Tw0LpM-1K3UHDTBQiSFX6scwLoq9a5zyUE-zWIeBAB/exec';

  const tablaPedidos = document.getElementById('tablaPedidos');
  const estadoCarga = document.getElementById('estadoCarga');
  const btnWhatsapp = document.getElementById('btnWhatsapp');
  const whatsappModal = document.getElementById('whatsappModal');
  const whatsappForm = document.getElementById('whatsappForm');
  const btnCerrarWhatsapp = document.getElementById('btnCerrarWhatsapp');
  const btnCancelarWhatsapp = document.getElementById('btnCancelarWhatsapp');
  const wspTipoEnvio = document.getElementById('wspTipoEnvio');
  const wspSucursalRetiroWrap = document.getElementById('wspSucursalRetiroWrap');
  const wspSucursalRetiro = document.getElementById('wspSucursalRetiro');
  const btnGuardarWhatsapp = document.getElementById('btnGuardarWhatsapp');

  // Buscador (opcional, si existe en el HTML)
  const inputQ = document.getElementById('q');
  const btnLimpiar = document.getElementById('btnLimpiar');

  if (!tablaPedidos || !estadoCarga) {
    console.error(
      '[RIO] Faltan elementos en el DOM. Revisá los IDs: tablaPedidos, estadoCarga.',
    );
    return;
  }

  // =========================
  // CONFIG
  // =========================

  // Estados que NO deben verse en Ecommerce
  const ESTADOS_OCULTOS = new Set([
    'EN SUCURSAL',
    'RETIRADO',
    'ENVIADO',
    'CANCELADO',
    'ENTREGADO',
  ]);

  const ESTADOS_SIN_ACCIONES = new Set([
    'RETIRADO',
    'ENVIADO',
    'CANCELADO',
    'ENTREGADO',
  ]);

  const LS_WHATSAPP_PEDIDOS = 'rio_pedidos_whatsapp_v1';
  const CLAVE_EDICION_ENVIO_RETIRO_LOCAL = 'RIO2026';
  const PADRON_URLS = [
    '../../data/ASISTENCIA_RIO%20-%20PADRON.csv',
    '../asistencia/ASISTENCIA_RIO%20-%20PADRON.csv',
  ];

  const ENVIO_RETIRO_OPCIONES = [
    {
      label: 'RETIRO - AVELLANEDA',
      tipo_envio: 'RETIRO',
      sucursal_retiro: 'AVELLANEDA',
    },
    {
      label: 'RETIRO - CORRIENTES',
      tipo_envio: 'RETIRO',
      sucursal_retiro: 'CORRIENTES',
    },
    {
      label: 'RETIRO - QUILMES',
      tipo_envio: 'RETIRO',
      sucursal_retiro: 'QUILMES',
    },
    {
      label: 'RETIRO - SARMIENTO',
      tipo_envio: 'RETIRO',
      sucursal_retiro: 'SARMIENTO',
    },
    {
      label: 'RETIRO - WEB',
      tipo_envio: 'RETIRO',
      sucursal_retiro: 'WEB',
    },
    {
      label: 'RETIRO - OTRO',
      tipo_envio: 'RETIRO',
      sucursal_retiro: 'OTRO',
    },
    {
      label: 'ENVIO - SHIPNOW',
      tipo_envio: 'ENVIO SHIPNOW',
      sucursal_retiro: 'ENVIO A DOMICILIO',
    },
    {
      label: 'ENVIO - OTRO',
      tipo_envio: 'ENVIO',
      sucursal_retiro: 'ENVIO A DOMICILIO',
    },
  ];

  // Cache global para buscador
  let PEDIDOS_CACHE = [];
  let QUERY = '';
  let guardandoWhatsapp = false;
  let PADRON_USUARIOS = new Map();

  // =========================
  // FLUJO / TRANSICIONES
  // =========================
  // IMPORTANTE:
  // - Las claves tienen que coincidir EXACTO con lo que viene en la columna ESTADO.
  // - "CANCELADO" se agrega siempre desde accionesDisponibles_().
  // - "PENDIENTE DE ENVIO" debe existir también en ESTADOS_VALIDOS del Apps Script backend.
  const TRANSICIONES_BASE = {
    'ESPERANDO PAGO': ['ARMANDO PEDIDO', 'CANCELADO'],

    'PARA ARMAR': ['ARMANDO PEDIDO'],

    'ARMANDO PEDIDO': ['ARMADO', 'PICKEADO/ARMADO', 'ESPERANDO MERCADERIA'],

    ARMADO: ['PICKEADO/ARMADO', 'ESPERANDO MERCADERIA'],

    'PICKEADO/ARMADO': ['CONTROLADO', 'ESPERANDO MERCADERIA'],

    'ESPERANDO MERCADERIA': [
      'ARMANDO PEDIDO',
      'ARMADO',
      'PICKEADO/ARMADO',
      'CONTROLADO',
    ],

    CONTROLADO: [
      'ESPERANDO PAGO',
      'PENDIENTE DE ENVIO',
      'LISTO PARA RETIRO',
      'ENVIADO A SUCURSAL',
      'EN SUCURSAL',
      'ENVIADO',
      'RETIRADO',
    ],

    'PENDIENTE DE ENVIO': [
      'ENVIADO',
      'LISTO PARA RETIRO',
      'ENVIADO A SUCURSAL',
      'EN SUCURSAL',
      'RETIRADO',
    ],

    'LISTO PARA RETIRO': ['ENVIADO A SUCURSAL', 'EN SUCURSAL', 'RETIRADO'],
    'ENVIADO A SUCURSAL': ['EN SUCURSAL', 'RETIRADO'],
    'EN SUCURSAL': ['RETIRADO'],
  };

  const ORDEN_BOTONES = [
    'ARMANDO PEDIDO',
    'ARMADO',
    'PICKEADO/ARMADO',
    'ESPERANDO MERCADERIA',
    'CONTROLADO',
    'ESPERANDO PAGO',
    'PENDIENTE DE ENVIO',
    'LISTO PARA RETIRO',
    'ENVIADO A SUCURSAL',
    'EN SUCURSAL',
    'ENVIADO',
    'RETIRADO',
    'CANCELADO',
  ];

  // =========================
  // INIT
  // =========================

  function init() {
    // Listeners del buscador (si existe en el DOM)
    if (inputQ) {
      inputQ.addEventListener('input', () => {
        QUERY = String(inputQ.value || '')
          .toUpperCase()
          .trim();
        renderTabla(vistaPedidos_());
      });
    }

    if (btnLimpiar && inputQ) {
      btnLimpiar.addEventListener('click', () => {
        inputQ.value = '';
        QUERY = '';
        renderTabla(vistaPedidos_());
        inputQ.focus();
      });
    }

    // Cerrar dropdowns al clickear afuera o ESC
    document.addEventListener('click', () => cerrarTodosLosDropdowns_());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cerrarTodosLosDropdowns_();
        cerrarWhatsappModal_();
      }
    });

    btnWhatsapp?.addEventListener('click', abrirWhatsappModal_);
    btnCerrarWhatsapp?.addEventListener('click', cerrarWhatsappModal_);
    btnCancelarWhatsapp?.addEventListener('click', cerrarWhatsappModal_);
    whatsappModal?.addEventListener('click', (event) => {
      if (event.target === whatsappModal) cerrarWhatsappModal_();
    });
    whatsappForm?.addEventListener('submit', guardarPedidoWhatsapp_);
    wspTipoEnvio?.addEventListener('change', actualizarSucursalRetiroWhatsapp_);

    cargarPadronUsuarios_().then((ok) => {
      if (ok && PEDIDOS_CACHE.length) renderTabla(vistaPedidos_());
    });
    cargarPedidos(true);
    setInterval(() => cargarPedidos(false), 30 * 1000);
  }

  // =========================
  // API
  // =========================

  async function cargarPedidos(mostrarLoading = true) {
    if (mostrarLoading) estadoCarga.textContent = 'Cargando pedidos...';

    try {
      // Vista global sin selector: usamos listar+sucursal=WEB
      const url = `${SCRIPT_URL}?accion=listar&sucursal=WEB`;
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error('[RIO] Respuesta no JSON:', text);
        estadoCarga.textContent = 'Error: respuesta no válida del servidor.';
        return;
      }

      if (!data.ok) {
        estadoCarga.textContent =
          'Error: ' + (data.error || 'Error desconocido');
        console.error('[RIO] Error listar WEB:', data);
        return;
      }

      const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];

      // Orden: nuevos arriba / viejos abajo
      pedidos.sort((a, b) => {
        const da = toDate_(a?.fecha_venta);
        const db = toDate_(b?.fecha_venta);
        if (da && db) return db - da;
        if (da && !db) return -1;
        if (!da && db) return 1;

        const fa = Number(a?.fila);
        const fb = Number(b?.fila);
        if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) {
          return fa - fb;
        }

        const ia = Number(String(a?.id_pedido || '').replace(/\D/g, '')) || 0;
        const ib = Number(String(b?.id_pedido || '').replace(/\D/g, '')) || 0;
        return ib - ia;
      });

      // Cache para buscador
      PEDIDOS_CACHE = combinarPedidos_(
        pedidos,
        cargarPedidosWhatsapp_(),
      );

      // Render con búsqueda aplicada si corresponde
      renderTabla(vistaPedidos_());
      estadoCarga.textContent = `Actualizado: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error('[RIO] Error de red:', err);
      estadoCarga.textContent = 'Error al cargar pedidos (red).';
    }
  }

  async function postAccion(payload) {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload), // sin headers para evitar preflight
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Respuesta no válida del servidor (no JSON).');
    }
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    return data;
  }

  async function cargarPadronUsuarios_() {
    for (const url of PADRON_URLS) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        const rows = parseCsv_(text);
        const map = new Map();

        rows.forEach((row) => {
          const codigo = String(row.vendedor_id || row.id || row.codigo || '')
            .trim();
          const nombre = String(
            row.apellido_nombre || row.nombre || row.vendedor_nombre || '',
          ).trim();
          if (codigo && nombre) map.set(codigo, nombre);
        });

        if (map.size) {
          PADRON_USUARIOS = map;
          console.info(`[RIO] Padron usuarios cargado: ${map.size}`);
          return true;
        }
      } catch (err) {
        console.warn('[RIO] No se pudo cargar padron desde', url, err);
      }
    }
    return false;
  }

  function parseCsv_(text) {
    const lines = String(text || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (!lines.length) return [];

    const headers = splitCsvLine_(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = splitCsvLine_(line);
      return headers.reduce((row, header, index) => {
        row[header] = values[index] || '';
        return row;
      }, {});
    });
  }

  function splitCsvLine_(line) {
    const out = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"' && quoted && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out;
  }

  async function resolverUsuarioPorCodigo_() {
    if (!PADRON_USUARIOS.size) await cargarPadronUsuarios_();

    const codigo = prompt('Codigo de usuario');
    if (!codigo) return null;

    return resolverUsuarioCodigo_(codigo);
  }

  async function resolverUsuarioCodigo_(codigo) {
    if (!PADRON_USUARIOS.size) await cargarPadronUsuarios_();

    const codigoLimpio = String(codigo || '').trim();
    if (!codigoLimpio) return null;

    const nombre = PADRON_USUARIOS.get(codigoLimpio);
    if (!nombre) {
      alert('Codigo no encontrado en el padron.');
      return null;
    }

    return { codigo: codigoLimpio, nombre };
  }

  function usuarioDisplay_(valor) {
    const raw = String(valor || '').trim();
    if (!raw) return '-';
    return PADRON_USUARIOS.get(raw) || raw;
  }

  // =========================
  // WHATSAPP
  // =========================

  function abrirWhatsappModal_() {
    if (!whatsappModal || !whatsappForm) return;
    whatsappModal.hidden = false;
    whatsappForm.reset();
    setWhatsappFormSaving_(false);
    actualizarSucursalRetiroWhatsapp_();
    setTimeout(() => document.getElementById('wspCliente')?.focus(), 0);
  }

  function cerrarWhatsappModal_() {
    if (guardandoWhatsapp) return;
    if (whatsappModal) whatsappModal.hidden = true;
  }

  function actualizarSucursalRetiroWhatsapp_() {
    const tipoEnvio = String(wspTipoEnvio?.value || '')
      .toUpperCase()
      .trim();
    const esRetiro = tipoEnvio === 'RETIRO';

    if (wspSucursalRetiroWrap) wspSucursalRetiroWrap.hidden = !esRetiro;
    if (wspSucursalRetiro) {
      wspSucursalRetiro.required = esRetiro;
      if (!esRetiro) wspSucursalRetiro.value = '';
    }
  }

  function setWhatsappFormSaving_(saving) {
    guardandoWhatsapp = saving;
    if (whatsappForm) {
      whatsappForm
        .querySelectorAll('input, select, button')
        .forEach((control) => {
          control.disabled = saving;
        });
      whatsappForm.setAttribute('aria-busy', saving ? 'true' : 'false');
    }
    if (btnGuardarWhatsapp) {
      btnGuardarWhatsapp.textContent = saving ? 'Guardando...' : 'Guardar pedido';
    }
    if (btnCerrarWhatsapp) btnCerrarWhatsapp.disabled = saving;
    if (btnCancelarWhatsapp) btnCancelarWhatsapp.disabled = saving;
  }

  function cargarPedidosWhatsapp_() {
    try {
      const raw = localStorage.getItem(LS_WHATSAPP_PEDIDOS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function guardarPedidosWhatsappLS_(pedidos) {
    try {
      localStorage.setItem(LS_WHATSAPP_PEDIDOS, JSON.stringify(pedidos));
    } catch {}
  }

  function combinarPedidos_(webPedidos, whatsappPedidos) {
    return [...whatsappPedidos, ...webPedidos];
  }

  function ocultarEstadosDefault_(pedidos) {
    return pedidos.filter((p) => {
      const estado = String(p?.estado || '')
        .toUpperCase()
        .trim();
      return !ESTADOS_OCULTOS.has(estado);
    });
  }

  function vistaPedidos_() {
    if (QUERY) return aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY);
    return ocultarEstadosDefault_(PEDIDOS_CACHE);
  }

  async function guardarPedidoWhatsapp_(event) {
    event.preventDefault();
    if (guardandoWhatsapp) return;

    const cliente = document.getElementById('wspCliente')?.value.trim() || '';
    const dni = document.getElementById('wspDni')?.value.trim() || '';
    const tipoEnvio =
      document.getElementById('wspTipoEnvio')?.value.trim().toUpperCase() ||
      'RETIRO';
    const sucursalRetiro =
      document.getElementById('wspSucursalRetiro')?.value.trim().toUpperCase() ||
      '';
    const remito = document.getElementById('wspRemito')?.value.trim() || '';
    const codigoUsuario = document.getElementById('wspUsuario')?.value.trim() || '';

    if (!cliente || !codigoUsuario) {
      alert('Completa cliente y codigo de usuario que carga.');
      return;
    }

    const usuarioPadron = await resolverUsuarioCodigo_(codigoUsuario);
    if (!usuarioPadron) return;

    if (tipoEnvio === 'RETIRO' && !sucursalRetiro) {
      alert('Elegí la sucursal de retiro.');
      return;
    }

    const sucursalPedido =
      tipoEnvio === 'RETIRO' ? sucursalRetiro : 'ENVIO A DOMICILIO';

    const idPedido = `WSP-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const pedidoLocal = {
      origen_local: 'whatsapp',
      canal: 'WHATSAPP',
      id_pedido: idPedido,
      cliente,
      dni,
      remito,
      estado: 'PARA ARMAR',
      tipo_envio: tipoEnvio,
      sucursal_retiro: sucursalPedido,
      quien_registra: usuarioPadron.nombre,
      fecha_venta: new Date().toISOString(),
      ultima_actualizacion: new Date().toISOString(),
    };

    try {
      setWhatsappFormSaving_(true);
      estadoCarga.textContent = 'Guardando pedido de WhatsApp...';
      const data = await postAccion({
        accion: 'crearPedidoWhatsapp',
        cliente,
        dni,
        tipo_envio: tipoEnvio,
        sucursal_retiro: sucursalPedido,
        remito,
        usuario: usuarioPadron.nombre,
        usuario_codigo: usuarioPadron.codigo,
      });

      const pedidoApi = data.pedido || {};
      PEDIDOS_CACHE = combinarPedidos_(
        PEDIDOS_CACHE.filter((p) => p?.id_pedido !== pedidoApi.id_pedido),
        [
          {
            ...pedidoApi,
            canal: 'WHATSAPP',
            remito,
            origen_local: 'sheets',
          },
        ],
      );
      renderTabla(vistaPedidos_());
      estadoCarga.textContent = 'Pedido de WhatsApp guardado en Sheets.';
      setWhatsappFormSaving_(false);
      cerrarWhatsappModal_();
      return;
    } catch (err) {
      console.warn(
        '[RIO] No se pudo guardar WhatsApp en Sheets. Se guarda local.',
        err,
      );
    }

    const pedidos = cargarPedidosWhatsapp_();
    pedidos.unshift(pedidoLocal);

    guardarPedidosWhatsappLS_(pedidos);
    PEDIDOS_CACHE = combinarPedidos_(
      PEDIDOS_CACHE.filter((p) => p?.origen_local !== 'whatsapp'),
      pedidos,
    );
    renderTabla(vistaPedidos_());
    estadoCarga.textContent = 'Pedido de WhatsApp cargado localmente.';
    setWhatsappFormSaving_(false);
    cerrarWhatsappModal_();
  }

  function actualizarPedidoWhatsapp_(idPedido, nuevoEstado, usuario) {
    const pedidos = cargarPedidosWhatsapp_();
    const idx = pedidos.findIndex(
      (p) => String(p.id_pedido) === String(idPedido),
    );
    if (idx < 0) throw new Error('No se encontró el pedido de WhatsApp.');
    pedidos[idx] = {
      ...pedidos[idx],
      estado: nuevoEstado,
      quien_registra: usuario || pedidos[idx].quien_registra,
      ultima_actualizacion: new Date().toISOString(),
    };
    guardarPedidosWhatsappLS_(pedidos);
  }

  function actualizarEnvioRetiroWhatsapp_(idPedido, nuevoEnvio, usuario) {
    const pedidos = cargarPedidosWhatsapp_();
    const idx = pedidos.findIndex(
      (p) => String(p.id_pedido) === String(idPedido),
    );
    if (idx < 0) throw new Error('No se encontro el pedido de WhatsApp.');
    pedidos[idx] = {
      ...pedidos[idx],
      tipo_envio: nuevoEnvio.tipo_envio,
      sucursal_retiro: nuevoEnvio.sucursal_retiro,
      quien_registra: usuario || pedidos[idx].quien_registra,
      ultima_actualizacion: new Date().toISOString(),
    };
    guardarPedidosWhatsappLS_(pedidos);
  }

  async function editarEnvioRetiro_(p) {
    const opcionesTexto = ENVIO_RETIRO_OPCIONES.map(
      (op, idx) => `${idx + 1}. ${op.label}`,
    ).join('\n');
    const seleccion = prompt(
      `Nuevo envio / retiro:\n${opcionesTexto}\n\nEscribi el numero de opcion`,
    );
    if (!seleccion) return;

    const index = Number(seleccion.trim()) - 1;
    const nuevoEnvio = ENVIO_RETIRO_OPCIONES[index];
    if (!nuevoEnvio) {
      alert('Opcion no valida.');
      return;
    }

    const usuarioPadron = await resolverUsuarioPorCodigo_();
    if (!usuarioPadron) return;

    const clave = prompt('Clave para modificar envio / retiro');
    if (!clave) return;

    if (!confirm(`Cambiar a ${nuevoEnvio.label}?`)) return;

    const sucursalActual = String(p?.sucursal_retiro || '')
      .toUpperCase()
      .trim();
    if (!sucursalActual) {
      alert('Este pedido no tiene envio/retiro actual. No se puede actualizar.');
      return;
    }

    try {
      estadoCarga.textContent = 'Actualizando envio / retiro...';
      if (p?.origen_local === 'whatsapp') {
        if (clave !== CLAVE_EDICION_ENVIO_RETIRO_LOCAL) {
          throw new Error('Clave incorrecta para modificar envio/retiro.');
        }
        actualizarEnvioRetiroWhatsapp_(p?.id_pedido, nuevoEnvio, usuarioPadron.nombre);
        await cargarPedidos(false);
      } else {
        await postAccion({
          accion: 'cambiarEnvioRetiro',
          sucursal: sucursalActual,
          id_pedido: p?.id_pedido,
          tipo_envio: nuevoEnvio.tipo_envio,
          sucursal_retiro: nuevoEnvio.sucursal_retiro,
          usuario: usuarioPadron.nombre,
          usuario_codigo: usuarioPadron.codigo,
          clave,
        });
        await cargarPedidos(true);
      }
    } catch (err) {
      console.error('[RIO] Error cambiarEnvioRetiro:', err);
      alert('Error: ' + err.message);
      estadoCarga.textContent = 'Error al actualizar envio / retiro.';
    }
  }

  // =========================
  // ENVIO/RETIRO + ACCIONES
  // =========================

  function esShipnow_(p) {
    const tipo = String(p?.tipo_envio || '')
      .toUpperCase()
      .trim();
    const suc = String(p?.sucursal_retiro || '')
      .toUpperCase()
      .trim();

    return (
      tipo.includes('SHIPNOW') ||
      tipo.includes('ENVÍO') ||
      tipo.includes('ENVIO') ||
      suc.includes('ENVIO A DOMICILIO') ||
      suc.includes('ENVÍO A DOMICILIO')
    );
  }

  function envioRetiroLabel(p) {
    const tipo = String(p?.tipo_envio || '')
      .toUpperCase()
      .trim();
    const suc = String(p?.sucursal_retiro || '')
      .toUpperCase()
      .trim();

    if (tipo.includes('SHIPNOW')) return 'ENVÍO - SHIPNOW';
    if (tipo.includes('ENVÍO') || tipo.includes('ENVIO')) return 'ENVÍO';
    if (suc.includes('ENVIO A DOMICILIO') || suc.includes('ENVÍO A DOMICILIO'))
      return 'ENVÍO';
    if (tipo.includes('RETIRO')) return `RETIRO - ${suc || 'SIN SUCURSAL'}`;

    return suc ? `RETIRO - ${suc}` : tipo || 'SIN DATO';
  }

  function accionesDisponibles_(p) {
    const estado = String(p?.estado || '')
      .toUpperCase()
      .trim();
    if (ESTADOS_SIN_ACCIONES.has(estado)) return [];

    const acciones = new Set();

    const base = TRANSICIONES_BASE[estado] || [];
    base.forEach((x) => acciones.add(x));

    // CANCELADO siempre disponible, salvo que el pedido ya esté oculto/finalizado.
    acciones.add('CANCELADO');

    // Ajuste dinámico desde CONTROLADO / PENDIENTE DE ENVIO:
    // Si es envío a domicilio / Shipnow, priorizamos ENVIADO.
    // Si es retiro, priorizamos retiro/sucursal.
    if (estado === 'CONTROLADO' || estado === 'PENDIENTE DE ENVIO') {
      if (esShipnow_(p)) {
        acciones.add('ENVIADO');
        acciones.delete('LISTO PARA RETIRO');
        acciones.delete('ENVIADO A SUCURSAL');
        acciones.delete('EN SUCURSAL');
        acciones.delete('RETIRADO');
      } else {
        acciones.add('PENDIENTE DE ENVIO');
        acciones.add('LISTO PARA RETIRO');
        acciones.add('ENVIADO A SUCURSAL');
        acciones.add('EN SUCURSAL');
        acciones.add('RETIRADO');
        acciones.delete('ENVIADO');
      }
    }

    // No permitir setear "PARA ARMAR" desde la web
    acciones.delete('PARA ARMAR');

    const arr = Array.from(acciones);
    arr.sort((a, b) => {
      const ia = ORDEN_BOTONES.indexOf(a);
      const ib = ORDEN_BOTONES.indexOf(b);

      const aa = ia === -1 ? 999 : ia;
      const bb = ib === -1 ? 999 : ib;

      return aa - bb;
    });
    return arr;
  }

  // =========================
  // BUSCADOR
  // =========================

  function aplicarFiltroBusqueda_(pedidos, qUpper) {
    if (!qUpper) return pedidos;

    return pedidos.filter((p) => {
      const canal = String(p?.canal || '')
        .toUpperCase()
        .trim();
      const id = String(p?.id_pedido || '')
        .toUpperCase()
        .trim();
      const cliente = String(p?.cliente || '')
        .toUpperCase()
        .trim();
      const dni = String(p?.dni || '')
        .toUpperCase()
        .trim();
      const estado = String(p?.estado || '')
        .toUpperCase()
        .trim();
      const sucursal = String(p?.sucursal_retiro || '')
        .toUpperCase()
        .trim();
      const tipo = String(p?.tipo_envio || '')
        .toUpperCase()
        .trim();
      const quien = String(p?.quien_registra || '')
        .toUpperCase()
        .trim();
      const remito = String(p?.remito || '')
        .toUpperCase()
        .trim();
      const envioRet = String(envioRetiroLabel(p) || '')
        .toUpperCase()
        .trim();

      const texto = [
        canal,
        'WEB',
        id,
        cliente,
      dni,
      estado,
      sucursal,
      tipo,
      envioRet,
      quien,
      remito,
      formatDateTime_(p?.fecha_venta),
      formatDateTime_(p?.ultima_edicion || p?.ultima_actualizacion),
      ].join(' ');

      return texto.includes(qUpper);
    });
  }

  // =========================
  // DROPDOWN HELPERS
  // =========================

  function cerrarTodosLosDropdowns_() {
    document
      .querySelectorAll('.dd-menu.open')
      .forEach((m) => m.classList.remove('open'));
  }

  // =========================
  // RENDER
  // =========================
  // Orden final de columnas:
  // CANAL | ID | CLIENTE | DNI | ESTADO | ACCIONES | ÚLTIMO USUARIO | ENVIO/RETIRO
  function renderTabla(pedidos) {
    tablaPedidos.innerHTML = '';

    if (!pedidos.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 10;
      td.textContent = 'No hay pedidos pendientes.';
      tr.appendChild(td);
      tablaPedidos.appendChild(tr);
      return;
    }

    pedidos.forEach((p) => {
      const tr = document.createElement('tr');

      const estadoTxt = String(p?.estado || '')
        .toUpperCase()
        .trim();
      tr.classList.add('pedido-row');
      if (estadoTxt) tr.classList.add('st-' + slugEstado_(estadoTxt));

      const envioRet = envioRetiroLabel(p);
      const ultimoUsuario = usuarioDisplay_(p?.quien_registra);
      const fechaPedido = formatDateTime_(p?.fecha_venta) || '-';
      const fechaEdicion = formatDateTime_(
        p?.ultima_edicion || p?.ultima_actualizacion,
      );
      const ultimoUsuarioHtml = fechaEdicion
        ? `${escapeHtml_(ultimoUsuario)}<span class="cell-sub">Editado: ${escapeHtml_(fechaEdicion)}</span>`
        : escapeHtml_(ultimoUsuario);
      const canal = String(p?.canal || '')
        .toUpperCase()
        .trim();
      const canalLabel =
        p?.origen_local === 'whatsapp' || canal === 'WHATSAPP'
          ? 'WHATSAPP'
          : canal
            ? `WEB - ${canal}`
            : 'WEB';

      tr.innerHTML = `
        <td>${escapeHtml_(canalLabel)}</td>
        <td>${p?.id_pedido ?? ''}</td>
        <td class="date-cell">${escapeHtml_(fechaPedido)}</td>
        <td>${escapeHtml_(clienteLabel_(p))}</td>
        <td>${p?.dni ?? ''}</td>
        <td>${escapeHtml_(estadoTxt)}</td>
        <td class="acciones"></td>
        <td>${ultimoUsuarioHtml}</td>
        <td class="envio-retiro-cell">${escapeHtml_(envioRet)}</td>
        <td class="edit-envio-cell">
          <button class="edit-envio-btn" type="button" title="Editar envio / retiro">Editar</button>
        </td>
      `;

      const accionesTd = tr.querySelector('.acciones');
      const editarEnvioBtn = tr.querySelector('.edit-envio-btn');
      const acciones = accionesDisponibles_(p);

      editarEnvioBtn?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        editarEnvioRetiro_(p);
      });

      if (!acciones.length) {
        accionesTd.textContent = '-';
      } else {
        // Dropdown
        const wrap = document.createElement('div');
        wrap.className = 'dd';

        const btnToggle = document.createElement('button');
        btnToggle.className = 'dd-toggle';
        btnToggle.type = 'button';
        btnToggle.textContent = 'Modificar Estado ▾';

        const menu = document.createElement('div');
        menu.className = 'dd-menu';

        acciones.forEach((nuevoEstado) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'dd-item';

          // clase por estado para colorear desde CSS si querés
          item.classList.add('st-' + slugEstado_(nuevoEstado));
          if (nuevoEstado === 'CANCELADO') item.classList.add('cancelado');

          item.textContent = nuevoEstado;

          item.addEventListener('click', async () => {
            // cerrar menú al elegir
            menu.classList.remove('open');

            const usuarioPadron = await resolverUsuarioPorCodigo_();
            if (!usuarioPadron) return;

            const sucursalReal = String(p?.sucursal_retiro || '')
              .toUpperCase()
              .trim();
            if (!sucursalReal) {
              alert(
                'Este pedido no tiene SUCURSAL_RETIRO. No se puede actualizar por seguridad.',
              );
              return;
            }

            try {
              estadoCarga.textContent = 'Actualizando...';
              if (p?.origen_local === 'whatsapp') {
                actualizarPedidoWhatsapp_(p?.id_pedido, nuevoEstado, usuarioPadron.nombre);
                await cargarPedidos(false);
              } else {
                await postAccion({
                  accion: 'cambiarEstado',
                  sucursal: sucursalReal,
                  id_pedido: p?.id_pedido,
                  estado: nuevoEstado,
                  usuario: usuarioPadron.nombre,
                  usuario_codigo: usuarioPadron.codigo,
                });
                await cargarPedidos(true);
              }
            } catch (err) {
              console.error('[RIO] Error cambiarEstado:', err);
              alert('Error: ' + err.message);
              estadoCarga.textContent = 'Error al actualizar.';
            }
          });

          menu.appendChild(item);
        });

        btnToggle.addEventListener('click', (ev) => {
          ev.stopPropagation();
          cerrarTodosLosDropdowns_();
          menu.classList.toggle('open');
        });

        wrap.appendChild(btnToggle);
        wrap.appendChild(menu);
        accionesTd.appendChild(wrap);
      }

      tablaPedidos.appendChild(tr);
    });
  }

  // =========================
  // HELPERS
  // =========================

  function toDate_(v) {
    if (!v) return null;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  function formatDateTime_(v) {
    const d = toDate_(v);
    if (!d) return '';
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  function escapeHtml_(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clienteLabel_(p) {
    const cliente = String(p?.cliente || '').trim();
    if (p?.origen_local !== 'whatsapp') return cliente;
    const remito = String(p?.remito || '').trim();
    const partes = [cliente];
    if (remito) partes.push(`Remito: ${remito}`);
    return partes.join(' · ');
  }

  function slugEstado_(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // sin tildes
      .replace(/\//g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/\-+/g, '-');
  }

  init();
})();
