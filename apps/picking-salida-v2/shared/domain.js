/* Shared validation: browser, Apps Script and executable tests use this same file. */
var PickDomain = (function () {
  'use strict';
  var RESPONSABLES = ['DAVID','DIEGO','JOEL','MARTIN','MIGUEL','NAHUEL','RODRIGO','RAMON','ROBERTO','SERGIO','PATO','FRANCO','MATIAS'];
  var BRANCHES = ['AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','DEPOSITO','PUEYRREDON'];
  var LIMIT = 10000;
  function fail(code, message, permanent) { var e = new Error(message); e.code = code; e.permanent = permanent !== false; throw e; }
  function assert(ok, code, message) { if (!ok) fail(code, message); }
  function validId(id) { return typeof id === 'string' && /^\d{8}_[a-f0-9-]{36}$/.test(id); }
  function clean(code) { return String(code || '').replace(/[\u0000-\u001f\u007f]/g, '').trim(); }
  function parseVariant(code) { var p = code.split('!').map(function(s){return s.trim();}); return p.length === 3 && p[0] && (p[1] || p[2]) ? {article:p[0],color:p[1],size:p[2]} : null; }
  function checkCode(code) {
    assert(typeof code === 'string' && code === clean(code) && code.length >= 3 && code.length <= 128, 'CODE', 'Lectura inválida (entre 3 y 128 caracteres).');
    assert(!code.includes('!') || parseVariant(code), 'CODE', 'Usá artículo!color!talle.');
    return code;
  }
  function normalize(input) {
    assert(input && input.version === 2 && validId(input.id), 'PAYLOAD', 'Identificador de operación inválido.');
    assert(RESPONSABLES.includes(input.responsable), 'RESPONSABLE', 'Seleccioná un responsable.');
    assert(BRANCHES.includes(input.origen) && BRANCHES.includes(input.destino), 'RUTA', 'Seleccioná origen y destino.');
    assert(Number.isInteger(input.bultos) && input.bultos >= 0 && input.bultos <= 9999, 'BULTOS', 'Bultos debe ser un entero entre 0 y 9999.');
    assert(Array.isArray(input.scans) && input.scans.length > 0 && input.scans.length <= LIMIT, 'SCANS', 'El picking debe contener entre 1 y ' + LIMIT + ' lecturas.');
    var seen = Object.create(null);
    var scans = input.scans.map(function(s) {
      assert(s && typeof s.id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(s.id) && !seen[s.id], 'EVENT', 'ID de lectura repetido o inválido.');
      seen[s.id] = true;
      return {id:s.id,code:checkCode(s.code)};
    });
    assert(typeof input.catalogVersion === 'string' && input.catalogVersion.length <= 160 && input.catalogVersion.length > 0, 'CATALOG', 'Falta versión de equivalencias.');
    assert(input.reviewedUnknown === true, 'REVIEW', 'Confirmá la revisión de lecturas.');
    return {version:2,id:input.id,responsable:input.responsable,origen:input.origen,destino:input.destino,bultos:input.bultos,catalogVersion:input.catalogVersion,reviewedUnknown:input.reviewedUnknown,scans:scans};
  }
  function content(p) { return p.scans.map(function(s){return s.code;}).join('\n'); }
  function name(p, remito, date) { return (date.slice(8,10)+date.slice(5,7)+date.slice(2,4)+' '+p.destino+' '+p.responsable+' '+p.bultos+'B REM'+remito+'.txt').replace(/[\\/:*?"<>|]+/g,'_'); }
  function statusLabel(state) { return ({DRAFT:'En este equipo',QUEUED:'Pendiente de envío',RECEIVING:'Falta recibir contenido',RECEIVED:'Contenido respaldado',NUMBERED:'Preparando TXT',TXT_VERIFIED:'Actualizando cuadernillo',READY:'Listo para despachar',ATTENTION:'Requiere atención',CANCELLED:'Anulado'})[state] || state; }
  return {RESPONSABLES:RESPONSABLES,BRANCHES:BRANCHES,LIMIT:LIMIT,fail:fail,assert:assert,validId:validId,clean:clean,parseVariant:parseVariant,checkCode:checkCode,normalize:normalize,content:content,name:name,statusLabel:statusLabel};
})();
if (typeof module !== 'undefined') module.exports = PickDomain;
