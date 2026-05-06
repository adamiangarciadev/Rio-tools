;(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbzzKML24eDQugWTMGJ2F4BdAkklj5twc8ISk4HwhB5gmUTWqOnoCW7fqBSVc4shgh8A/exec';

  const HOME_TRACKING_URL = location.href.split('#')[0].split('?')[0];
  const LOCALES_CSV_URL = './locales.csv';
  const PADRON_CSV_URL = './Padron.csv';

  const LOCALES_FALLBACK = [
    'CASTELLI',
    'CORRIENTES',
    'PUEYRREDON',
    'QUILMES',
    'SARMIENTO',
    'LAMARCA',
    'NAZCA',
    'AVELLANEDA',
    'AVELLANEDA (WEB)'
  ];

  let locales = [];
  let LOCALES = {};
  let PADRON = [];
  let cache = [];
  let ultimoEnvio = null;

  const HUB_ONCE = ['CASTELLI', 'CORRIENTES', 'PUEYRREDON', 'QUILMES', 'SARMIENTO'];
  const HUB_FLORES = ['LAMARCA', 'NAZCA', 'AVELLANEDA', 'AVELLANEDA (WEB)'];

  const ESTADOS = [
    'CARGADO EN LOCAL',
    'EN CAMINO A HUB',
    'RECIBIDO EN HUB',
    'ENVIADO A AVELLANEDA',
    'RECIBIDO EN LOGISTICA WEB',
    'DESPACHADO POR SHIPNOW',
    'DESPACHADO POR TRANSPORTE',
    'CANCELADO',
    'CON PROBLEMA'
  ];

  const ESTADO_FLOW = [
    'CARGADO EN LOCAL',
    'EN CAMINO A HUB',
    'RECIBIDO EN HUB',
    'ENVIADO A AVELLANEDA',
    'RECIBIDO EN LOGISTICA WEB',
    'DESPACHADO POR SHIPNOW'
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const apiStatus = $('#apiStatus');

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await loadLocalesCsv();
    await cargarPadron();
    fillSelects();
    bindTabs();
    bindCarga();
    bindPanel();
    bindDashboard();
    bindTracking();
    toggleTipoEnvio();
    setApiStatus();
    cargarPanel();
  }

  function setApiStatus() {
    if (!API_URL || API_URL.includes('PEGAR_URL')) {
      apiStatus.textContent = 'Configurar API_URL';
      apiStatus.className = 'status-pill err';
    } else {
      apiStatus.textContent = 'API conectada';
      apiStatus.className = 'status-pill ok';
    }
  }

  function normalizarTexto(v) {
    return String(v || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function parseCSV(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) return [];

    const delimiter = detectarSeparador(lines[0]);
    const headers = splitCSVLine(lines[0], delimiter).map(h => normalizarTexto(h));

    return lines.slice(1).map(line => {
      const values = splitCSVLine(line, delimiter);
      const obj = {};

      headers.forEach((h, i) => {
        obj[h] = (values[i] || '').trim();
      });

      return obj;
    });
  }

  function detectarSeparador(line) {
    const coma = (line.match(/,/g) || []).length;
    const puntoComa = (line.match(/;/g) || []).length;
    return puntoComa > coma ? ';' : ',';
  }

  function splitCSVLine(line, sep) {
    const out = [];
    let cur = '';
    let q = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const n = line[i + 1];

      if (c === '"') {
        if (q && n === '"') {
          cur += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (c === sep && !q) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }

    out.push(cur.trim());
    return out;
  }

  async function loadLocalesCsv() {
    try {
      const res = await fetch(LOCALES_CSV_URL, { cache: 'no-store' });

      if (!res.ok) {
        cargarLocalesFallback();
        return;
      }

      const text = await res.text();
      const rows = parseCSV(text);

      LOCALES = {};
      locales = [];

      rows.forEach(row => {
        const sucursal =
          row['SUCURSAL'] ||
          row['LOCAL'] ||
          row['NOMBRE'] ||
          row[Object.keys(row)[0]] ||
          '';

        const suc = normalizarTexto(sucursal);
        if (!suc) return;

        const calle =
          row['DIRECCION'] ||
          row['DIRECCIÓN'] ||
          row['DOMICILIO'] ||
          row['CALLE'] ||
          '';

        const altura =
          row['ALTURA'] ||
          row['NUMERO'] ||
          row['NÚMERO'] ||
          row['NRO'] ||
          '';

        const domicilio = `${calle} ${altura}`.trim();

        LOCALES[suc] = {
          sucursal: suc,
          domicilio,
          localidad: row['LOCALIDAD'] || '',
          provincia: row['PROVINCIA'] || '',
          cp: row['CP'] || row['CODIGO POSTAL'] || row['CÓDIGO POSTAL'] || '',
          telefono: row['TELEFONO'] || row['TELÉFONO'] || row['TEL'] || '',
          pais: row['PAIS'] || row['PAÍS'] || 'AR',
          hub: row['HUB'] || resolverHub(suc)
        };

        locales.push(suc);
      });

      locales = Array.from(new Set(locales)).sort((a, b) => a.localeCompare(b, 'es'));

      if (!locales.length) cargarLocalesFallback();

      console.log('LOCALES cargados:', LOCALES);
    } catch (err) {
      console.warn('No se pudo cargar locales.csv:', err);
      cargarLocalesFallback();
    }
  }

  function cargarLocalesFallback() {
    locales = [...LOCALES_FALLBACK];

    LOCALES = {};
    locales.forEach(s => {
      LOCALES[normalizarTexto(s)] = {
        sucursal: s,
        domicilio: '',
        localidad: '',
        provincia: '',
        cp: '',
        telefono: '',
        pais: 'AR',
        hub: resolverHub(s)
      };
    });

    console.warn('Usando locales fallback:', LOCALES);
  }

  async function cargarPadron() {
    try {
      const res = await fetch(PADRON_CSV_URL, { cache: 'no-store' });

      if (!res.ok) {
        console.warn('No se pudo cargar Padron.csv');
        PADRON = [];
        return;
      }

      const text = await res.text();
      const rows = parseCSV(text);

      PADRON = rows.map(row => {
        const id =
          row['VENDEDOR_ID'] ||
          row['ID'] ||
          row['CODIGO'] ||
          row['CÓDIGO'] ||
          '';

        let nombre =
          row['APELLIDO_NOMBRE'] ||
          row['APELLIDO Y NOMBRE'] ||
          row['NOMBRE Y APELLIDO'] ||
          row['NOMBRE_APELLIDO'] ||
          row['NOMBRE'] ||
          '';

        if (!nombre && row['APELLIDO']) {
          nombre = `${row['APELLIDO']} ${row['NOMBRE'] || ''}`.trim();
        }

        if (!nombre) {
          const vals = Object.values(row).filter(Boolean);
          nombre = vals[1] || vals[0] || '';
        }

        const telefono =
          row['TELEFONO'] ||
          row['TELÉFONO'] ||
          row['TEL'] ||
          row['CELULAR'] ||
          '';

        return {
          id: String(id || '').trim(),
          nombre: String(nombre || '').trim(),
          telefono: String(telefono || '').trim()
        };
      }).filter(r => r.nombre);

      PADRON.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      console.log('PADRON cargado:', PADRON);
    } catch (err) {
      console.warn('Error cargando Padron.csv:', err);
      PADRON = [];
    }
  }

  function fillSelects() {
    const sucursalSelect = $('#sucursalOrigen');
    if (sucursalSelect) {
      sucursalSelect.innerHTML =
        '<option value="">Seleccionar...</option>' +
        locales.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    }

    const responsableSelect = $('#responsableLocal');
    if (responsableSelect) {
      responsableSelect.innerHTML =
        '<option value="">Seleccionar responsable...</option>' +
        PADRON.map(r => {
          const label = r.id ? `${r.id} - ${r.nombre}` : r.nombre;
          return `<option value="${escapeHtml(r.nombre)}" data-id="${escapeHtml(r.id)}" data-telefono="${escapeHtml(r.telefono)}">${escapeHtml(label)}</option>`;
        }).join('');
    }

    const filtroEstado = $('#filtroEstado');
    if (filtroEstado) {
      filtroEstado.innerHTML =
        '<option value="TODOS">Todos los estados</option>' +
        ESTADOS.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    }
  }

  function bindTabs() {
    $$('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tab').forEach(b => b.classList.remove('active'));
        $$('.view').forEach(v => v.classList.remove('active'));

        btn.classList.add('active');
        $(`#view-${btn.dataset.view}`).classList.add('active');

        if (btn.dataset.view === 'panel') cargarPanel();
        if (btn.dataset.view === 'dashboard') cargarDashboard();
      });
    });
  }

  function bindCarga() {
    $('#tipoEnvio')?.addEventListener('change', toggleTipoEnvio);

    $('#btnLimpiar')?.addEventListener('click', () => {
      $('#formEnvio').reset();
      toggleTipoEnvio();
      $('#resultadoCard').classList.add('hidden');
      ultimoEnvio = null;
    });

    $('#btnPDF')?.addEventListener('click', () => {
      if (ultimoEnvio) generarPDFRotulo(ultimoEnvio);
    });

    $('#btnCopiarTracking')?.addEventListener('click', async () => {
      if (!ultimoEnvio) return;
      await navigator.clipboard.writeText(ultimoEnvio.idTracking);
      alert('Tracking copiado.');
    });

    $('#formEnvio')?.addEventListener('submit', async ev => {
      ev.preventDefault();

      const data = Object.fromEntries(new FormData(ev.target).entries());

      data.sucursalOrigen = normalizarTexto(data.sucursalOrigen);
      data.hubAsignado = resolverHub(data.sucursalOrigen);
      data.estado = 'CARGADO EN LOCAL';
      data.accion = 'crearEnvio';
      data.urlSeguimientoBase = HOME_TRACKING_URL;

      const responsableSelect = $('#responsableLocal');
      const opt = responsableSelect?.selectedOptions?.[0];

      data.responsable = data.responsable || responsableSelect?.value || '';
      data.responsableId = opt?.dataset?.id || '';
      data.responsableTelefono = opt?.dataset?.telefono || '';

      const remitente = obtenerRemitente(data.sucursalOrigen);

      if (!remitente) {
        alert('No se encontró el remitente para la sucursal: ' + data.sucursalOrigen);
        return;
      }

      data.remitenteSucursal = remitente.sucursal;
      data.remitenteDomicilio = remitente.domicilio;
      data.remitenteLocalidad = remitente.localidad;
      data.remitenteProvincia = remitente.provincia;
      data.remitenteCp = remitente.cp;
      data.remitenteTelefono = remitente.telefono;

      const faltan = validarPayload(data);
      if (faltan.length) {
        alert('Faltan datos: ' + faltan.join(', '));
        return;
      }

      const res = await api(data);

      if (!res.ok) {
        alert('Error: ' + (res.error || 'No se pudo crear el envío'));
        return;
      }

      ultimoEnvio = res.envio || data;

      if (!ultimoEnvio.idTracking) {
        ultimoEnvio.idTracking = generarTrackingInterno();
      }

      ultimoEnvio.remitente = remitente;

      $('#trackingGenerado').textContent = ultimoEnvio.idTracking;
      $('#hubGenerado').textContent = ultimoEnvio.hubAsignado || data.hubAsignado;
      $('#estadoGenerado').textContent = ultimoEnvio.estado || data.estado;
      $('#resultadoCard').classList.remove('hidden');

      await generarPDFRotulo(ultimoEnvio);
      cargarPanel();
    });
  }

  function obtenerRemitente(sucursal) {
    const key = normalizarTexto(sucursal);
    return LOCALES[key] || null;
  }

  function toggleTipoEnvio() {
    const tipo = $('#tipoEnvio')?.value || '';

    $$('.field-oca').forEach(e => e.classList.toggle('hidden', tipo !== 'SHIPNOW_OCA'));
    $$('.field-transporte').forEach(e => e.classList.toggle('hidden', tipo !== 'TRANSPORTE'));
    $$('.field-domicilio').forEach(e => e.classList.toggle('hidden', tipo === 'SHIPNOW_OCA'));
  }

  function validarPayload(d) {
    const base = [
      'sucursalOrigen',
      'tipoEnvio',
      'responsable',
      'cliente',
      'mail',
      'telefono',
      'dniCuil',
      'localidad',
      'provincia',
      'cp'
    ];

    if (d.tipoEnvio === 'SHIPNOW_OCA') base.push('sucursalOca');
    else base.push('domicilio');

    if (d.tipoEnvio === 'TRANSPORTE') base.push('transporte');

    return base.filter(k => !String(d[k] || '').trim());
  }

  function resolverHub(suc) {
    const s = normalizarTexto(suc);

    if (HUB_ONCE.includes(s)) return 'SARMIENTO';
    if (HUB_FLORES.includes(s)) return 'AVELLANEDA';

    return 'AVELLANEDA';
  }

  function bindPanel() {
    $('#btnActualizarPanel')?.addEventListener('click', cargarPanel);

    ['filtroHub', 'filtroEstado', 'buscarPanel'].forEach(id => {
      const el = $(`#${id}`);
      if (el) el.addEventListener('input', renderPanel);
    });
  }

  async function cargarPanel() {
    const res = await api({ accion: 'listarEnvios' });

    if (!res.ok) {
      $('#panelLista').innerHTML = `<div class="op-card">Error: ${escapeHtml(res.error || 'No se pudo listar')}</div>`;
      return;
    }

    cache = res.envios || [];
    renderPanel();
  }

  function renderPanel() {
    const hub = $('#filtroHub')?.value || 'TODOS';
    const estado = $('#filtroEstado')?.value || 'TODOS';
    const q = ($('#buscarPanel')?.value || '').toLowerCase().trim();

    let rows = cache.slice();

    if (hub !== 'TODOS') {
      rows = rows.filter(x => {
        if (hub === 'WEB') return /LOGISTICA WEB|DESPACHADO/.test(x.estado || '');
        return String(x.hubAsignado || '') === hub;
      });
    }

    if (estado !== 'TODOS') {
      rows = rows.filter(x => x.estado === estado);
    }

    if (q) {
      rows = rows.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    }

    $('#panelLista').innerHTML = rows.length
      ? rows.map(renderOpCard).join('')
      : '<div class="op-card">Sin envíos para el filtro seleccionado.</div>';

    $$('.op-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idTracking = btn.dataset.id;
        const nuevoEstado = btn.dataset.estado;
        const responsable = prompt('Responsable que actualiza el estado:');

        if (!responsable) return;

        const res = await api({
          accion: 'actualizarEstado',
          idTracking,
          tracking: idTracking,
          nuevoEstado,
          estado: nuevoEstado,
          responsable
        });

        if (!res.ok) {
          alert('Error: ' + (res.error || 'No se pudo actualizar'));
          return;
        }

        cargarPanel();
      });
    });
  }

  function renderOpCard(x) {
    const demora = calcularDemora(x);
    const next = siguientesEstados(x);

    return `<article class="op-card">
      <div class="op-top">
        <div>
          <strong>${escapeHtml(x.idTracking)}</strong>
          <span class="badge ${demora ? 'warn' : 'ok'}">${demora ? 'DEMORA' : 'OK'}</span>
        </div>
        <span class="badge">${escapeHtml(x.estado || '')}</span>
      </div>

      <div class="meta-grid">
        <div><span>Cliente</span>${escapeHtml(x.cliente || '')}</div>
        <div><span>Origen</span>${escapeHtml(x.sucursalOrigen || '')}</div>
        <div><span>Hub</span>${escapeHtml(x.hubAsignado || '')}</div>
        <div><span>Tipo</span>${escapeHtml(x.tipoEnvio || '')}</div>
      </div>

      <div class="actions">
        ${next.map(e => `<button class="btn op-action" data-id="${escapeHtml(x.idTracking)}" data-estado="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join('')}
      </div>
    </article>`;
  }

  function siguientesEstados(x) {
    const estado = x.estado || 'CARGADO EN LOCAL';
    const tipo = x.tipoEnvio || '';
    const arr = [];

    if (['CANCELADO', 'CON PROBLEMA', 'DESPACHADO POR SHIPNOW', 'DESPACHADO POR TRANSPORTE'].includes(estado)) {
      return [];
    }

    if (estado === 'CARGADO EN LOCAL') arr.push('EN CAMINO A HUB');

    if (estado === 'EN CAMINO A HUB') arr.push('RECIBIDO EN HUB');

    if (estado === 'RECIBIDO EN HUB') {
      if (x.hubAsignado === 'SARMIENTO') arr.push('ENVIADO A AVELLANEDA');
      else arr.push('RECIBIDO EN LOGISTICA WEB');
    }

    if (estado === 'ENVIADO A AVELLANEDA') arr.push('RECIBIDO EN LOGISTICA WEB');

    if (estado === 'RECIBIDO EN LOGISTICA WEB') {
      arr.push(tipo === 'TRANSPORTE' ? 'DESPACHADO POR TRANSPORTE' : 'DESPACHADO POR SHIPNOW');
    }

    arr.push('CON PROBLEMA', 'CANCELADO');

    return arr;
  }

  function bindDashboard() {
    $('#btnActualizarDashboard')?.addEventListener('click', cargarDashboard);
  }

  async function cargarDashboard() {
    const res = await api({ accion: 'listarEnvios' });
    if (!res.ok) return;

    cache = res.envios || [];

    const activos = cache.filter(x => !/^DESPACHADO|CANCELADO/.test(x.estado || ''));
    const demoras = activos.filter(calcularDemora);

    $('#mTotal').textContent = activos.length;
    $('#mPendientes').textContent = activos.filter(x => x.estado === 'CARGADO EN LOCAL').length;
    $('#mHubs').textContent = activos.filter(x => ['EN CAMINO A HUB', 'RECIBIDO EN HUB', 'ENVIADO A AVELLANEDA'].includes(x.estado)).length;
    $('#mWeb').textContent = activos.filter(x => x.estado === 'RECIBIDO EN LOGISTICA WEB').length;
    $('#mDemora').textContent = demoras.length;

    renderBars('#dashHub', groupCount(activos, 'hubAsignado'));
    renderBars('#dashEstado', groupCount(activos, 'estado'));

    $('#dashAlertas').innerHTML =
      demoras.slice(0, 20).map(renderOpCard).join('') ||
      '<div class="op-card">Sin alertas.</div>';
  }

  function groupCount(rows, key) {
    return rows.reduce((a, x) => {
      const k = x[key] || 'SIN DATO';
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {});
  }

  function renderBars(sel, obj) {
    const max = Math.max(1, ...Object.values(obj));

    $(sel).innerHTML = Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<div class="bar-row"><strong>${escapeHtml(k)}</strong> · ${v}<div class="line"><div class="fill" style="width:${(v / max) * 100}%"></div></div></div>`)
      .join('') || '<div class="bar-row">Sin datos</div>';
  }

  function calcularDemora(x) {
    if (/DESPACHADO|CANCELADO/.test(x.estado || '')) return false;

    const raw = x.fechaEstado || x.fecha || '';
    const t = new Date(raw).getTime();

    if (!t) return false;

    const hs = (Date.now() - t) / 36e5;

    if (x.estado === 'CARGADO EN LOCAL' && hs > 24) return true;

    if (['EN CAMINO A HUB', 'RECIBIDO EN HUB', 'ENVIADO A AVELLANEDA', 'RECIBIDO EN LOGISTICA WEB'].includes(x.estado) && hs > 12) {
      return true;
    }

    return false;
  }

  function bindTracking() {
    $('#btnBuscarTracking')?.addEventListener('click', buscarTracking);

    $('#trackingInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') buscarTracking();
    });

    const url = new URL(location.href);
    const id = url.searchParams.get('t') || url.searchParams.get('tracking');

    if (id) {
      $$('.tab').find(b => b.dataset.view === 'seguimiento')?.click();
      $('#trackingInput').value = id;
      buscarTracking();
    }
  }

  async function buscarTracking() {
    const idTracking = $('#trackingInput').value.trim();

    if (!idTracking) return;

    const res = await api({ accion: 'obtenerEnvio', idTracking, tracking: idTracking });

    if (!res.ok) {
      $('#trackingDetalle').innerHTML = `<div class="op-card">${escapeHtml(res.error || 'No encontrado')}</div>`;
      return;
    }

    renderTracking(res.envio);
  }

  function renderTracking(x) {
    const flow = x.tipoEnvio === 'TRANSPORTE'
      ? ['CARGADO EN LOCAL', 'EN CAMINO A HUB', 'RECIBIDO EN HUB', 'RECIBIDO EN LOGISTICA WEB', 'DESPACHADO POR TRANSPORTE']
      : (x.hubAsignado === 'SARMIENTO'
          ? ESTADO_FLOW
          : ['CARGADO EN LOCAL', 'EN CAMINO A HUB', 'RECIBIDO EN HUB', 'RECIBIDO EN LOGISTICA WEB', 'DESPACHADO POR SHIPNOW']);

    const idx = flow.indexOf(x.estado);

    $('#trackingDetalle').innerHTML = `<div class="op-card">
      <div class="op-top">
        <strong>${escapeHtml(x.idTracking)}</strong>
        <span class="badge">${escapeHtml(x.estado)}</span>
      </div>

      <div class="meta-grid">
        <div><span>Cliente</span>${escapeHtml(x.cliente)}</div>
        <div><span>Origen</span>${escapeHtml(x.sucursalOrigen)}</div>
        <div><span>Hub</span>${escapeHtml(x.hubAsignado)}</div>
        <div><span>Tipo</span>${escapeHtml(x.tipoEnvio)}</div>
      </div>

      <div class="timeline">
        ${flow.map((e, i) => `<div class="step ${i < idx ? 'done' : i === idx ? 'current' : ''}">
          <div class="dot">${i < idx ? '✓' : i + 1}</div>
          <div><strong>${escapeHtml(e)}</strong></div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  async function generarPDFRotulo(e) {
    const branchName = normalizarTexto(e.sucursalOrigen || e.remitenteSucursal || '');
    const branchData = e.remitente || obtenerRemitente(branchName) || {};

    const data = {
      tracking: e.idTracking,
      qrUrl: `${HOME_TRACKING_URL}?t=${encodeURIComponent(e.idTracking)}`,
      tipoEnvio: e.tipoEnvio,
      hub: e.hubAsignado,

      remitente: {
        sucursal: branchData.sucursal || branchName || e.remitenteSucursal || '',
        domicilio: branchData.domicilio || e.remitenteDomicilio || '',
        localidad: branchData.localidad || e.remitenteLocalidad || '',
        provincia: branchData.provincia || e.remitenteProvincia || '',
        cp: branchData.cp || e.remitenteCp || '',
        telefono: branchData.telefono || e.remitenteTelefono || ''
      },

      destinatario: {
        nombre: e.cliente || '',
        dni: e.dniCuil || '',
        telefono: e.telefono || '',
        domicilio: e.domicilio || '',
        entrecalles: e.entrecalles || '',
        localidad: e.localidad || '',
        cp: e.cp || '',
        provincia: e.provincia || ''
      },

      transporte: {
        nombre: e.transporte || (e.tipoEnvio === 'TRANSPORTE' ? '' : 'SHIPNOW'),
        sucursalOca: e.sucursalOca || '',
        guia: e.guia || e.numeroGuia || '',
        observaciones: e.observaciones || ''
      },

      fecha: e.fecha || fechaHoyAR(),
      impresoPor: e.responsable || '',
      etapas: e.etapas
    };

    await generarRotuloDespacho(data);
  }

  async function generarRotuloDespacho(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const W = 210;
    const H = 297;
    const M = 6;
    const negro = [0, 0, 0];

    function rect(x, y, w, h, fill = false) {
      if (fill) {
        doc.setFillColor(...negro);
        doc.rect(x, y, w, h, 'F');
      } else {
        doc.rect(x, y, w, h);
      }
    }

    function tituloBarra(texto, x, y, w) {
      rect(x, y, w, 8, true);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(texto, x + 3, y + 5.7);
      doc.setTextColor(0, 0, 0);
    }

    function campo(label, value, x, y, wLabel, wValue, h = 8, size = 10) {
      rect(x, y, wLabel, h);
      rect(x + wLabel, y, wValue, h);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      doc.text(label, x + 2, y + 5.3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size);
      const txt = String(value || '').toUpperCase();
      doc.text(txt, x + wLabel + 3, y + 5.3, { maxWidth: wValue - 5 });
    }

    async function qrDataUrl(text) {
      return await QRCode.toDataURL(text, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: 'M'
      });
    }

    const tracking = data.tracking || generarTrackingInterno();
    const qrText = data.qrUrl || `${location.origin}${location.pathname}?tracking=${encodeURIComponent(tracking)}`;
    const qr = await qrDataUrl(qrText);

    doc.setLineWidth(0.8);
    rect(M, M, W - M * 2, H - M * 2);

    rect(M, M, 142, 60);
    rect(148, M, 56, 60);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(27);
    doc.text('DESPACHO DE PEDIDOS', 13, 22);

    doc.setFontSize(10);
    doc.text('N° DE SEGUIMIENTO INTERNO:', 10, 37);

    doc.setFillColor(0, 0, 0);
    doc.rect(74, 31, 58, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(tracking, 77, 37.2);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(10);
    doc.text('TIPO DE ENVÍO:', 10, 47);
    doc.setFont('helvetica', 'normal');
    doc.text(String(data.tipoEnvio || '').toUpperCase(), 53, 47);

    doc.setFont('helvetica', 'bold');
    doc.text('HUB ASIGNADO:', 10, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(String(data.hub || '').toUpperCase(), 53, 56);

    doc.addImage(qr, 'PNG', 158, 10, 34, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('ESCANEA PARA SEGUIMIENTO', 153, 51);

    let y = 66;

    tituloBarra('REMITENTE', M, y, W - M * 2);
    y += 8;

    campo('SUCURSAL:', data.remitente?.sucursal, M, y, 40, 158); y += 8;
    campo('DOMICILIO:', data.remitente?.domicilio, M, y, 40, 158); y += 8;
    campo('LOCALIDAD:', data.remitente?.localidad, M, y, 40, 65);
    campo('CÓDIGO POSTAL:', data.remitente?.cp, 111, y, 42, 51); y += 8;
    campo('TELÉFONO:', data.remitente?.telefono, M, y, 40, 158); y += 13;

    tituloBarra('DESTINATARIO', M, y, W - M * 2);
    y += 8;

    campo('NOMBRE Y APELLIDO:', data.destinatario?.nombre, M, y, 50, 148); y += 8;
    campo('D.N.I. / C.U.I.L.:', data.destinatario?.dni, M, y, 50, 60);
    campo('TELÉFONO:', data.destinatario?.telefono, 116, y, 37, 51); y += 8;
    campo('DOMICILIO:', data.destinatario?.domicilio, M, y, 50, 148); y += 8;
    campo('ENTRE CALLES:', data.destinatario?.entrecalles, M, y, 50, 148); y += 8;
    campo('LOCALIDAD:', data.destinatario?.localidad, M, y, 50, 60);
    campo('CÓDIGO POSTAL:', data.destinatario?.cp, 116, y, 37, 51); y += 8;
    campo('PROVINCIA:', data.destinatario?.provincia, M, y, 50, 148); y += 13;

    tituloBarra('TRANSPORTE DE ENVÍO', M, y, W - M * 2);
    y += 8;

    campo('TRANSPORTE:', data.transporte?.nombre, M, y, 68, 130); y += 8;

    if (String(data.tipoEnvio || '').toUpperCase().includes('OCA')) {
      campo('SUCURSAL OCA:', data.transporte?.sucursalOca, M, y, 68, 130); y += 8;
    } else {
      campo('N° DE GUÍA / CÓDIGO:', data.transporte?.guia || 'A DESIGNAR', M, y, 68, 130); y += 8;
    }

    campo('OBSERVACIONES:', data.transporte?.observaciones, M, y, 68, 130); y += 13;

    tituloBarra('CONTROL INTERNO (CIRCUITO RIO)', M, y, W - M * 2);
    y += 8;

    const etapas = data.etapas || [
      'CARGADO EN\nSUCURSAL',
      'ENVIADO A HUB',
      'RECIBIDO EN HUB',
      'ENVIADO A\nAVELLANEDA (WEB)',
      'RECIBIDO EN\nLOGÍSTICA WEB'
    ];

    const boxW = (W - M * 2) / etapas.length;
    const boxH = 45;

    etapas.forEach((etapa, i) => {
      const x = M + i * boxW;
      rect(x, y, boxW, boxH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);

      const lines = etapa.split('\n');
      lines.forEach((line, idx) => {
        doc.text(line, x + boxW / 2, y + 8 + idx * 4, { align: 'center' });
      });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('□ FECHA: ___/___/___', x + 3, y + 29);
      doc.text('FIRMA: __________', x + 3, y + 39);

      if (i < etapas.length - 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('→', x + boxW - 3, y + 25);
      }
    });

    y += boxH + 7;

    campo('FECHA DE IMPRESIÓN:', data.fecha || fechaHoyAR(), M, y, 48, 55);
    campo('IMPRESO POR:', data.impresoPor || '', 120, y, 35, 49);

    doc.setFont('times', 'bold');
    doc.setFontSize(24);
    doc.text('LENCERÍA RÍO', W / 2, 286, { align: 'center' });

    doc.save(`${tracking}.pdf`);
  }

  function generarTrackingInterno() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rnd = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

    return `RIO-SN-${yy}${mm}${dd}-${rnd}`;
  }

  function fechaHoyAR() {
    return new Date().toLocaleDateString('es-AR');
  }

  async function api(payload) {
    if (!API_URL || API_URL.includes('PEGAR_URL')) return mockApi(payload);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      return await res.json();
    } catch (err) {
      return {
        ok: false,
        error: err.message
      };
    }
  }

  async function mockApi(payload) {
    const k = 'rio_shipnow_mock';
    const db = JSON.parse(localStorage.getItem(k) || '[]');

    if (payload.accion === 'crearEnvio') {
      const idTracking = payload.idTracking || generarTrackingInterno();

      const envio = {
        ...payload,
        idTracking,
        fecha: new Date().toISOString(),
        fechaEstado: new Date().toISOString()
      };

      delete envio.accion;

      db.unshift(envio);
      localStorage.setItem(k, JSON.stringify(db));

      return {
        ok: true,
        envio
      };
    }

    if (payload.accion === 'listarEnvios') {
      return {
        ok: true,
        envios: db
      };
    }

    if (payload.accion === 'actualizarEstado') {
      const id = payload.idTracking || payload.tracking;
      const x = db.find(e => e.idTracking === id);

      if (!x) {
        return {
          ok: false,
          error: 'No encontrado'
        };
      }

      x.estado = payload.nuevoEstado || payload.estado;
      x.fechaEstado = new Date().toISOString();
      x.responsableUltimoEstado = payload.responsable;

      localStorage.setItem(k, JSON.stringify(db));

      return {
        ok: true,
        envio: x
      };
    }

    if (payload.accion === 'obtenerEnvio') {
      const id = payload.idTracking || payload.tracking;
      const x = db.find(e => e.idTracking === id);

      return x
        ? { ok: true, envio: x }
        : { ok: false, error: 'Tracking no encontrado' };
    }

    return {
      ok: false,
      error: 'Acción no válida'
    };
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>'"]/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c]));
  }
})();