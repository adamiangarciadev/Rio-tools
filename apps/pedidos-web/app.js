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
    'RETIRADO',
    'ENVIADO',
    'CANCELADO',
    'ENTREGADO',
  ]);

  const LS_WHATSAPP_PEDIDOS = 'rio_pedidos_whatsapp_v1';

  // Cache global para buscador
  let PEDIDOS_CACHE = [];
  let QUERY = '';

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

    'ARMANDO PEDIDO': ['PICKEADO/ARMADO', 'ESPERANDO MERCADERIA'],

    'PICKEADO/ARMADO': ['CONTROLADO', 'ESPERANDO MERCADERIA'],

    'ESPERANDO MERCADERIA': ['ARMANDO PEDIDO', 'PICKEADO/ARMADO', 'CONTROLADO'],

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
        renderTabla(aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY));
      });
    }

    if (btnLimpiar && inputQ) {
      btnLimpiar.addEventListener('click', () => {
        inputQ.value = '';
        QUERY = '';
        renderTabla(PEDIDOS_CACHE);
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

      // 1) FILTRO FRONT (oculta estados finales)
      const pedidosFiltrados = pedidos.filter((p) => {
        const estado = String(p?.estado || '')
          .toUpperCase()
          .trim();
        return !ESTADOS_OCULTOS.has(estado);
      });

      // 2) ORDEN: nuevos arriba / viejos abajo
      pedidosFiltrados.sort((a, b) => {
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
        pedidosFiltrados,
        cargarPedidosWhatsapp_(),
      );

      // Render con búsqueda aplicada si corresponde
      const vista = QUERY
        ? aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY)
        : PEDIDOS_CACHE;

      renderTabla(vista);
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

  // =========================
  // WHATSAPP
  // =========================

  function abrirWhatsappModal_() {
    if (!whatsappModal || !whatsappForm) return;
    whatsappModal.hidden = false;
    whatsappForm.reset();
    setTimeout(() => document.getElementById('wspCliente')?.focus(), 0);
  }

  function cerrarWhatsappModal_() {
    if (whatsappModal) whatsappModal.hidden = true;
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
    return [...whatsappPedidos, ...webPedidos].filter((p) => {
      const estado = String(p?.estado || '')
        .toUpperCase()
        .trim();
      return !ESTADOS_OCULTOS.has(estado);
    });
  }

  async function guardarPedidoWhatsapp_(event) {
    event.preventDefault();

    const cliente = document.getElementById('wspCliente')?.value.trim() || '';
    const dni = document.getElementById('wspDni')?.value.trim() || '';
    const tipoEnvio =
      document.getElementById('wspTipoEnvio')?.value.trim().toUpperCase() ||
      'RETIRO';
    const remito = document.getElementById('wspRemito')?.value.trim() || '';
    const usuario = document.getElementById('wspUsuario')?.value.trim() || '';

    if (!cliente || !usuario) {
      alert('Completá cliente y usuario que carga.');
      return;
    }

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
      sucursal_retiro: 'WEB',
      quien_registra: usuario,
      fecha_venta: new Date().toISOString(),
    };

    try {
      estadoCarga.textContent = 'Guardando pedido de WhatsApp...';
      const data = await postAccion({
        accion: 'crearPedidoWhatsapp',
        cliente,
        dni,
        tipo_envio: tipoEnvio,
        remito,
        usuario,
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
      renderTabla(
        QUERY ? aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY) : PEDIDOS_CACHE,
      );
      estadoCarga.textContent = 'Pedido de WhatsApp guardado en Sheets.';
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
    renderTabla(
      QUERY ? aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY) : PEDIDOS_CACHE,
    );
    estadoCarga.textContent = 'Pedido de WhatsApp cargado localmente.';
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
    if (ESTADOS_OCULTOS.has(estado)) return [];

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
      td.colSpan = 8;
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
      const envioRet = envioRetiroLabel(p);
      const ultimoUsuario = String(p?.quien_registra || '').trim() || '-';
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
        <td>${escapeHtml_(clienteLabel_(p))}</td>
        <td>${p?.dni ?? ''}</td>
        <td>${escapeHtml_(estadoTxt)}</td>
        <td class="acciones"></td>
        <td>${escapeHtml_(ultimoUsuario)}</td>
        <td>${escapeHtml_(envioRet)}</td>
      `;

      const accionesTd = tr.querySelector('.acciones');
      const acciones = accionesDisponibles_(p);

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

            const usuario = prompt('¿Quién realiza la acción? (nombre)');
            if (!usuario) return;

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
                actualizarPedidoWhatsapp_(p?.id_pedido, nuevoEstado, usuario);
                await cargarPedidos(false);
              } else {
                await postAccion({
                  accion: 'cambiarEstado',
                  sucursal: sucursalReal,
                  id_pedido: p?.id_pedido,
                  estado: nuevoEstado,
                  usuario,
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
