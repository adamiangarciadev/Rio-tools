(function(root){
  'use strict';
  const clean = value => String(value || '').trim();
  const canonical = value => { const key = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return ({AVELLANEDA:'AV2',AVELLANEDA2:'AV2',AV1:'NAZCA',DEPOSITOCENTRAL:'DEPOSITO'})[key] || key; };
  function enteredToday(response, branch, date) {
    const items = response?.items ?? response?.data?.items ?? response?.data?.rows ?? response?.data?.eventos ?? (Array.isArray(response?.data) ? response.data : null);
    if (!response?.ok || !Array.isArray(items) || (response.fecha && clean(response.fecha).slice(0,10) !== date) || (response.local && canonical(response.local) !== branch)) throw new Error('No se pudo validar la asistencia de hoy.');
    return [...new Set(items.filter(row => {
      const type = clean(row.tipo_evento ?? row.tipo ?? row.evento).toUpperCase();
      const day = clean(row.fecha_operativa ?? row.fecha ?? response.fecha).slice(0,10);
      const local = canonical(row.sucursal ?? row.local ?? response.local);
      return type === 'ENTRADA' && day === date && local === branch;
    }).map(row => clean(row.vendedor_id ?? row.id ?? row.legajo ?? row.vendedorId)).filter(code => /^\d{1,20}$/.test(code)))];
  }
  function localWeek(date) {
    const day = new Date(date + 'T00:00:00Z');
    const weekday = day.getUTCDay();
    if (weekday === 0) return null;
    day.setUTCDate(day.getUTCDate() - weekday + 1);
    const start = day.toISOString().slice(0,10);
    day.setUTCDate(day.getUTCDate() + 6);
    return {start, end: day.toISOString().slice(0,10)};
  }
  const api = {enteredToday,localWeek};
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.RioValesAttendance = api;
})(globalThis);
