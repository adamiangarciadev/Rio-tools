/************************************************************
 * RIO Tools · Seguimiento interno Shipnow
 * Backend Google Apps Script
 *
 * 1) Crear Google Sheet.
 * 2) Extensiones > Apps Script.
 * 3) Pegar este archivo.
 * 4) Implementar como Aplicación Web:
 *    - Ejecutar como: vos
 *    - Acceso: cualquiera con el enlace
 * 5) Copiar la URL /exec y pegarla en app.js => API_URL.
 ************************************************************/

const SHEET_NAME = 'SHIPNOW_INTERNO';
const HIST_NAME = 'SHIPNOW_HISTORIAL';
const TZ = 'America/Argentina/Buenos_Aires';

const HEADERS = [
  'ID_TRACKING','FECHA','SUCURSAL_ORIGEN','HUB_ASIGNADO','TIPO_ENVIO','ESTADO',
  'CLIENTE','MAIL','TELEFONO','DNI_CUIL','DOMICILIO','ENTRECALLES','SUCURSAL_OCA',
  'LOCALIDAD','PROVINCIA','CP','TRANSPORTE','RESPONSABLE','REMITO','OBSERVACIONES',
  'FECHA_ESTADO','RESPONSABLE_ULTIMO_ESTADO','URL_SEGUIMIENTO'
];

const HIST_HEADERS = ['TIMESTAMP','ID_TRACKING','ESTADO','RESPONSABLE','OBSERVACION'];

function doGet() {
  return json_({ ok:true, message:'RIO Shipnow Interno API OK. Usar POST.' });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const accion = String(data.accion || '').trim();

    setup_();

    if (accion === 'crearEnvio') return json_(crearEnvio_(data));
    if (accion === 'listarEnvios') return json_(listarEnvios_());
    if (accion === 'obtenerEnvio') return json_(obtenerEnvio_(data.idTracking));
    if (accion === 'actualizarEstado') return json_(actualizarEstado_(data));

    return json_({ ok:false, error:'Acción no válida: ' + accion });
  } catch (err) {
    return json_({ ok:false, error: err.message, stack: err.stack });
  }
}

function setup_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sh, HEADERS);

  let hist = ss.getSheetByName(HIST_NAME);
  if (!hist) hist = ss.insertSheet(HIST_NAME);
  ensureHeaders_(hist, HIST_HEADERS);
}

function ensureHeaders_(sh, headers) {
  const lastCol = Math.max(sh.getLastColumn(), headers.length);
  const first = sh.getRange(1,1,1,lastCol).getValues()[0];
  let changed = false;
  headers.forEach((h,i) => {
    if (first[i] !== h) { first[i] = h; changed = true; }
  });
  if (changed || sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function crearEnvio_(d) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const id = generarTracking_();
  const now = now_();
  const urlBase = String(d.urlSeguimientoBase || '').trim();
  const urlSeguimiento = urlBase ? `${urlBase}?t=${encodeURIComponent(id)}` : '';

  const rowObj = {
    ID_TRACKING: id,
    FECHA: now,
    SUCURSAL_ORIGEN: clean_(d.sucursalOrigen),
    HUB_ASIGNADO: clean_(d.hubAsignado),
    TIPO_ENVIO: clean_(d.tipoEnvio),
    ESTADO: 'CARGADO EN LOCAL',
    CLIENTE: clean_(d.cliente),
    MAIL: clean_(d.mail),
    TELEFONO: clean_(d.telefono),
    DNI_CUIL: clean_(d.dniCuil),
    DOMICILIO: clean_(d.domicilio),
    ENTRECALLES: clean_(d.entrecalles),
    SUCURSAL_OCA: clean_(d.sucursalOca),
    LOCALIDAD: clean_(d.localidad),
    PROVINCIA: clean_(d.provincia),
    CP: clean_(d.cp),
    TRANSPORTE: clean_(d.transporte),
    RESPONSABLE: clean_(d.responsable),
    REMITO: clean_(d.remito),
    OBSERVACIONES: clean_(d.observaciones),
    FECHA_ESTADO: now,
    RESPONSABLE_ULTIMO_ESTADO: clean_(d.responsable),
    URL_SEGUIMIENTO: urlSeguimiento
  };

  sh.appendRow(HEADERS.map(h => rowObj[h] || ''));
  appendHist_(id, 'CARGADO EN LOCAL', clean_(d.responsable), 'Alta de envío');

  return { ok:true, envio: toFront_(rowObj) };
}

function listarEnvios_() {
  const rows = readObjects_();
  rows.sort((a,b) => String(b.FECHA).localeCompare(String(a.FECHA)));
  return { ok:true, envios: rows.map(toFront_) };
}

function obtenerEnvio_(idTracking) {
  const item = readObjects_().find(r => r.ID_TRACKING === String(idTracking || '').trim());
  if (!item) return { ok:false, error:'Tracking no encontrado' };
  return { ok:true, envio: toFront_(item) };
}

function actualizarEstado_(d) {
  const id = String(d.idTracking || '').trim();
  const nuevoEstado = clean_(d.nuevoEstado);
  const responsable = clean_(d.responsable);
  if (!id || !nuevoEstado) return { ok:false, error:'Falta idTracking o nuevoEstado' };

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('ID_TRACKING');
  const estadoCol = headers.indexOf('ESTADO');
  const fechaEstadoCol = headers.indexOf('FECHA_ESTADO');
  const responsableCol = headers.indexOf('RESPONSABLE_ULTIMO_ESTADO');
  const now = now_();

  for (let r=1; r<values.length; r++) {
    if (String(values[r][idCol]).trim() === id) {
      sh.getRange(r+1, estadoCol+1).setValue(nuevoEstado);
      sh.getRange(r+1, fechaEstadoCol+1).setValue(now);
      sh.getRange(r+1, responsableCol+1).setValue(responsable);
      appendHist_(id, nuevoEstado, responsable, clean_(d.observacion));
      return obtenerEnvio_(id);
    }
  }
  return { ok:false, error:'Tracking no encontrado' };
}

function readObjects_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(Boolean)).map(row => {
    const o = {};
    headers.forEach((h,i) => o[h] = row[i]);
    return o;
  });
}

function appendHist_(id, estado, responsable, obs) {
  const hist = SpreadsheetApp.getActive().getSheetByName(HIST_NAME);
  hist.appendRow([now_(), id, estado, responsable || '', obs || '']);
}

function generarTracking_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const date = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  const prefix = `RIO-SN-${date}-`;
  const ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues().flat().map(String) : [];
  const todayIds = ids.filter(x => x.startsWith(prefix));
  const next = todayIds.length + 1;
  return prefix + String(next).padStart(4,'0');
}

function toFront_(r) {
  return {
    idTracking: String(r.ID_TRACKING || ''),
    fecha: String(r.FECHA || ''),
    sucursalOrigen: String(r.SUCURSAL_ORIGEN || ''),
    hubAsignado: String(r.HUB_ASIGNADO || ''),
    tipoEnvio: String(r.TIPO_ENVIO || ''),
    estado: String(r.ESTADO || ''),
    cliente: String(r.CLIENTE || ''),
    mail: String(r.MAIL || ''),
    telefono: String(r.TELEFONO || ''),
    dniCuil: String(r.DNI_CUIL || ''),
    domicilio: String(r.DOMICILIO || ''),
    entrecalles: String(r.ENTRECALLES || ''),
    sucursalOca: String(r.SUCURSAL_OCA || ''),
    localidad: String(r.LOCALIDAD || ''),
    provincia: String(r.PROVINCIA || ''),
    cp: String(r.CP || ''),
    transporte: String(r.TRANSPORTE || ''),
    responsable: String(r.RESPONSABLE || ''),
    remito: String(r.REMITO || ''),
    observaciones: String(r.OBSERVACIONES || ''),
    fechaEstado: String(r.FECHA_ESTADO || ''),
    responsableUltimoEstado: String(r.RESPONSABLE_ULTIMO_ESTADO || ''),
    urlSeguimiento: String(r.URL_SEGUIMIENTO || '')
  };
}

function clean_(v) { return String(v == null ? '' : v).trim(); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
