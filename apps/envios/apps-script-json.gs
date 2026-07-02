/************************************************************
 * RIO Tools - Seguimiento interno Shipnow
 * Backend Google Apps Script con almacenamiento JSON en Drive
 *
 * Mantiene la misma API que app.js:
 * - crearEnvio
 * - listarEnvios
 * - obtenerEnvio
 * - actualizarEstado
 *
 * Guarda los envios e historial en un archivo JSON de Google Drive.
 * El padron de responsables puede seguir viviendo en una hoja PADRON.
 ************************************************************/

const DATA_FILE_NAME = 'rio_shipnow_interno_db.json';
const DATA_FILE_ID_PROP = 'RIO_SHIPNOW_JSON_FILE_ID';
const PADRON_NAME = 'PADRON';
const TZ = 'America/Argentina/Buenos_Aires';

const HEADERS = [
  'ID_TRACKING',
  'FECHA',
  'SUCURSAL_ORIGEN',
  'CENTRO_ASIGNADO',
  'ULTIMA_UBICACION',
  'TIPO_ENVIO',
  'ESTADO',
  'CLIENTE',
  'MAIL',
  'TELEFONO',
  'DNI_CUIL',
  'DOMICILIO',
  'ENTRECALLES',
  'SUCURSAL_OCA',
  'DIRECCION_OCA',
  'LOCALIDAD',
  'PROVINCIA',
  'CP',
  'TRANSPORTE',
  'RESPONSABLE_CODIGO',
  'RESPONSABLE_NOMBRE',
  'RESPONSABLE_TELEFONO',
  'REMITO',
  'OBSERVACIONES',
  'FECHA_ESTADO',
  'RESPONSABLE_ULTIMO_ESTADO',
  'URL_SEGUIMIENTO'
];

function doGet(e) {
  const tracking = e && e.parameter && (e.parameter.tracking || e.parameter.t);

  if (tracking) {
    return json_(obtenerEnvio_(tracking));
  }

  return json_({
    ok: true,
    message: 'RIO Shipnow Interno JSON API OK',
    storage: DATA_FILE_NAME,
    actions: ['crearEnvio', 'listarEnvios', 'obtenerEnvio', 'actualizarEstado']
  });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const accion = String(data.accion || '').trim();

    if (accion === 'crearEnvio') return json_(crearEnvio_(data));
    if (accion === 'listarEnvios') return json_(listarEnvios_());
    if (accion === 'obtenerEnvio') return json_(obtenerEnvio_(data.idTracking || data.tracking));
    if (accion === 'actualizarEstado') return json_(actualizarEstado_(data));

    return json_({ ok: false, error: 'Accion no valida: ' + accion });
  } catch (err) {
    return json_({
      ok: false,
      error: err.message,
      stack: err.stack
    });
  }
}

function crearEnvio_(d) {
  return withDbLock_((db) => {
    const id = generarTracking_(db.envios);
    const now = now_();

    const sucursalOrigen = clean_(d.sucursalOrigen);
    const responsableCodigo = clean_(d.responsableCodigo || d.responsable);
    const responsableData = buscarResponsable_(responsableCodigo);
    const centroAsignado = clean_(d.centroAsignado || d.hubAsignado || resolverCentroInicial_(sucursalOrigen));
    const ultimaUbicacion = clean_(d.ultimaUbicacion || sucursalOrigen);

    const urlBase = clean_(d.urlSeguimientoBase);
    const urlSeguimiento = urlBase
      ? `${urlBase}?tracking=${encodeURIComponent(id)}`
      : '';

    const rowObj = {
      ID_TRACKING: id,
      FECHA: now,
      SUCURSAL_ORIGEN: sucursalOrigen,
      CENTRO_ASIGNADO: centroAsignado,
      ULTIMA_UBICACION: ultimaUbicacion,
      TIPO_ENVIO: clean_(d.tipoEnvio),
      ESTADO: 'CARGADO EN LOCAL',
      CLIENTE: clean_(d.cliente),
      MAIL: clean_(d.mail),
      TELEFONO: clean_(d.telefono),
      DNI_CUIL: clean_(d.dniCuil),
      DOMICILIO: clean_(d.domicilio),
      ENTRECALLES: clean_(d.entrecalles),
      SUCURSAL_OCA: clean_(d.sucursalOca),
      DIRECCION_OCA: clean_(d.direccionOca),
      LOCALIDAD: clean_(d.localidad),
      PROVINCIA: clean_(d.provincia),
      CP: clean_(d.cp),
      TRANSPORTE: clean_(d.transporte),
      RESPONSABLE_CODIGO: responsableCodigo,
      RESPONSABLE_NOMBRE: responsableData.nombre,
      RESPONSABLE_TELEFONO: responsableData.telefono,
      REMITO: clean_(d.remito),
      OBSERVACIONES: clean_(d.observaciones),
      FECHA_ESTADO: now,
      RESPONSABLE_ULTIMO_ESTADO: responsableData.nombre || responsableCodigo,
      URL_SEGUIMIENTO: urlSeguimiento
    };

    db.envios.unshift(normalizarRow_(rowObj));
    db.historial.unshift({
      TIMESTAMP: now,
      ID_TRACKING: id,
      ESTADO: 'CARGADO EN LOCAL',
      RESPONSABLE_CODIGO: responsableCodigo,
      RESPONSABLE_NOMBRE: responsableData.nombre,
      OBSERVACION: 'Alta de envio',
      ULTIMA_UBICACION: ultimaUbicacion
    });

    return {
      ok: true,
      envio: toFront_(rowObj)
    };
  });
}

function listarEnvios_() {
  const db = readDb_();
  const rows = (db.envios || []).slice();

  rows.sort((a, b) => {
    return String(b.FECHA || '').localeCompare(String(a.FECHA || ''));
  });

  return {
    ok: true,
    envios: rows.map(toFront_)
  };
}

function obtenerEnvio_(idTracking) {
  const id = clean_(idTracking);

  if (!id) {
    return {
      ok: false,
      error: 'Falta tracking'
    };
  }

  const db = readDb_();
  const item = (db.envios || []).find(r => clean_(r.ID_TRACKING) === id);

  if (!item) {
    return {
      ok: false,
      error: 'Tracking no encontrado'
    };
  }

  return {
    ok: true,
    envio: toFront_(item)
  };
}

function actualizarEstado_(d) {
  const id = clean_(d.idTracking || d.tracking);
  const nuevoEstado = clean_(d.nuevoEstado || d.estado);
  const responsableCodigo = clean_(d.responsableCodigo || d.responsable);
  const responsableData = buscarResponsable_(responsableCodigo);

  if (!id || !nuevoEstado) {
    return {
      ok: false,
      error: 'Falta idTracking o nuevoEstado'
    };
  }

  return withDbLock_((db) => {
    const rows = db.envios || [];
    const item = rows.find(r => clean_(r.ID_TRACKING) === id);

    if (!item) {
      return {
        ok: false,
        error: 'Tracking no encontrado'
      };
    }

    const now = now_();
    const sucursalOrigen = clean_(item.SUCURSAL_ORIGEN);
    const ultimaUbicacion = clean_(d.ultimaUbicacion || resolverUltimaUbicacionPorEstado_(nuevoEstado, sucursalOrigen));

    item.ESTADO = nuevoEstado;
    item.FECHA_ESTADO = now;
    item.ULTIMA_UBICACION = ultimaUbicacion;
    item.RESPONSABLE_ULTIMO_ESTADO = responsableData.nombre || responsableCodigo;

    db.historial.unshift({
      TIMESTAMP: now,
      ID_TRACKING: id,
      ESTADO: nuevoEstado,
      RESPONSABLE_CODIGO: responsableCodigo,
      RESPONSABLE_NOMBRE: responsableData.nombre,
      OBSERVACION: clean_(d.observacion),
      ULTIMA_UBICACION: ultimaUbicacion
    });

    return {
      ok: true,
      envio: toFront_(item)
    };
  });
}

function withDbLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const db = readDb_();
    const result = callback(db);
    saveDb_(db);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function readDb_() {
  const file = getDbFile_();
  const text = file.getBlob().getDataAsString('UTF-8');

  if (!text.trim()) {
    return emptyDb_();
  }

  try {
    const db = JSON.parse(text);
    return normalizeDb_(db);
  } catch (err) {
    throw new Error('El archivo JSON esta corrupto: ' + err.message);
  }
}

function saveDb_(db) {
  const file = getDbFile_();
  const cleanDb = normalizeDb_(db);
  cleanDb.updatedAt = now_();
  file.setContent(JSON.stringify(cleanDb, null, 2));
}

function getDbFile_() {
  const props = PropertiesService.getScriptProperties();
  const storedId = props.getProperty(DATA_FILE_ID_PROP);

  if (storedId) {
    try {
      return DriveApp.getFileById(storedId);
    } catch (err) {
      props.deleteProperty(DATA_FILE_ID_PROP);
    }
  }

  const files = DriveApp.getFilesByName(DATA_FILE_NAME);
  if (files.hasNext()) {
    const file = files.next();
    props.setProperty(DATA_FILE_ID_PROP, file.getId());
    return file;
  }

  const file = DriveApp.createFile(DATA_FILE_NAME, JSON.stringify(emptyDb_(), null, 2), MimeType.PLAIN_TEXT);
  props.setProperty(DATA_FILE_ID_PROP, file.getId());
  return file;
}

function emptyDb_() {
  return {
    version: 1,
    updatedAt: now_(),
    envios: [],
    historial: []
  };
}

function normalizeDb_(db) {
  const out = db && typeof db === 'object' ? db : emptyDb_();
  out.version = out.version || 1;
  out.updatedAt = out.updatedAt || '';
  out.envios = Array.isArray(out.envios) ? out.envios : [];
  out.historial = Array.isArray(out.historial) ? out.historial : [];
  return out;
}

function normalizarRow_(row) {
  const out = {};
  HEADERS.forEach(h => {
    out[h] = row[h] == null ? '' : row[h];
  });
  return out;
}

function generarTracking_(envios) {
  const date = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  const prefix = `RIO-SN-${date}-`;
  const ids = (envios || []).map(r => String(r.ID_TRACKING || ''));
  const todayIds = ids.filter(x => x.startsWith(prefix));
  const nums = todayIds
    .map(x => Number(x.slice(prefix.length)))
    .filter(n => Number.isFinite(n));
  const next = nums.length ? Math.max.apply(null, nums) + 1 : 1;

  return prefix + String(next).padStart(4, '0');
}

function buscarResponsable_(codigo) {
  const code = clean_(codigo);

  if (!code) {
    return {
      codigo: '',
      nombre: '',
      telefono: ''
    };
  }

  let ss = null;
  try {
    ss = SpreadsheetApp.getActive();
  } catch (err) {
    ss = null;
  }

  const sh = ss ? ss.getSheetByName(PADRON_NAME) : null;
  if (!sh) {
    return {
      codigo: code,
      nombre: '',
      telefono: ''
    };
  }

  const values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return {
      codigo: code,
      nombre: '',
      telefono: ''
    };
  }

  const headers = values[0].map(h => normalizar_(h));
  const idxId = findHeader_(headers, ['VENDEDOR_ID', 'ID', 'CODIGO', 'CODIGO_RESPONSABLE', 'LEGAJO']);
  const idxNombre = findHeader_(headers, ['APELLIDO_NOMBRE', 'NOMBRE_Y_APELLIDO', 'NOMBRE', 'RESPONSABLE']);
  const idxTel = findHeader_(headers, ['TELEFONO', 'TEL', 'CELULAR']);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowId = idxId >= 0 ? clean_(row[idxId]) : '';

    if (rowId && rowId === code) {
      return {
        codigo: code,
        nombre: idxNombre >= 0 ? clean_(row[idxNombre]) : '',
        telefono: idxTel >= 0 ? clean_(row[idxTel]) : ''
      };
    }
  }

  return {
    codigo: code,
    nombre: '',
    telefono: ''
  };
}

function resolverCentroInicial_(sucursal) {
  const s = normalizar_(sucursal);
  const pasanPorSarmiento = [
    'CASTELLI',
    'CORRIENTES',
    'PUEYRREDON',
    'QUILMES'
  ];

  return pasanPorSarmiento.includes(s)
    ? 'SARMIENTO'
    : 'AVELLANEDA';
}

function resolverUltimaUbicacionPorEstado_(estado, sucursalOrigen) {
  const e = normalizar_(estado);

  if (e.indexOf('SARMIENTO') >= 0) return 'SARMIENTO';
  if (e.indexOf('AVELLANEDA') >= 0) return 'AVELLANEDA';
  if (e.indexOf('LOGISTICA_WEB') >= 0 || e.indexOf('DESPACHADO') >= 0) return 'LOGISTICA WEB';

  return clean_(sucursalOrigen);
}

function toFront_(r) {
  const centro = r.CENTRO_ASIGNADO || r.HUB_ASIGNADO || resolverCentroInicial_(r.SUCURSAL_ORIGEN);
  const ubicacion = r.ULTIMA_UBICACION || resolverUltimaUbicacionPorEstado_(r.ESTADO, r.SUCURSAL_ORIGEN);

  return {
    idTracking: String(r.ID_TRACKING || ''),
    fecha: String(r.FECHA || ''),
    sucursalOrigen: String(r.SUCURSAL_ORIGEN || ''),
    centroAsignado: String(centro || ''),
    hubAsignado: String(centro || ''),
    ultimaUbicacion: String(ubicacion || ''),
    tipoEnvio: String(r.TIPO_ENVIO || ''),
    estado: String(r.ESTADO || ''),
    cliente: String(r.CLIENTE || ''),
    mail: String(r.MAIL || ''),
    telefono: String(r.TELEFONO || ''),
    dniCuil: String(r.DNI_CUIL || ''),
    domicilio: String(r.DOMICILIO || ''),
    entrecalles: String(r.ENTRECALLES || ''),
    sucursalOca: String(r.SUCURSAL_OCA || ''),
    direccionOca: String(r.DIRECCION_OCA || ''),
    localidad: String(r.LOCALIDAD || ''),
    provincia: String(r.PROVINCIA || ''),
    cp: String(r.CP || ''),
    transporte: String(r.TRANSPORTE || ''),
    responsable: String(r.RESPONSABLE_CODIGO || r.RESPONSABLE || ''),
    responsableCodigo: String(r.RESPONSABLE_CODIGO || r.RESPONSABLE || ''),
    responsableNombre: String(r.RESPONSABLE_NOMBRE || ''),
    responsableTelefono: String(r.RESPONSABLE_TELEFONO || ''),
    remito: String(r.REMITO || ''),
    observaciones: String(r.OBSERVACIONES || ''),
    fechaEstado: String(r.FECHA_ESTADO || ''),
    responsableUltimoEstado: String(r.RESPONSABLE_ULTIMO_ESTADO || ''),
    urlSeguimiento: String(r.URL_SEGUIMIENTO || '')
  };
}

function migrarSheetsAJson_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss && ss.getSheetByName('SHIPNOW_INTERNO');
  const hist = ss && ss.getSheetByName('SHIPNOW_HISTORIAL');

  if (!sh) {
    throw new Error('No existe la hoja SHIPNOW_INTERNO para migrar');
  }

  const db = emptyDb_();
  db.envios = sheetToObjects_(sh).map(normalizarRow_);
  db.historial = hist ? sheetToObjects_(hist) : [];
  saveDb_(db);

  return {
    ok: true,
    envios: db.envios.length,
    historial: db.historial.length,
    fileId: getDbFile_().getId()
  };
}

function sheetToObjects_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  return values
    .slice(1)
    .filter(r => r.some(Boolean))
    .map(row => {
      const o = {};
      headers.forEach((h, i) => {
        o[h] = row[i];
      });
      return o;
    });
}

function findHeader_(headers, names) {
  const normalized = names.map(normalizar_);
  return headers.findIndex(h => normalized.includes(h));
}

function normalizar_(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
