(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isRetired = value => ['PUEYRREDON', 'PUEY', 'PRUPUEY'].includes(normalize(value));
  window.RioBranches = {isRetired};
  const picking = /\/apps\/picking-salida(?:-v2)?(?:\/|$)/.test(location.pathname);
  // Picking owns independent origin/destination choices and keeps its drafts.
  if (picking) return;
  const keys = ['rio_workspace_branch_v1','rio_sucursal','asistencia_sucursal_v1','rio_remitos_sucursal','rio_sucursal_web','rio_deposito_local','mercaderia_transito_sucursal','sucursal','rio_shipnow_sucursal_origen'];
  try { for (const key of keys) if (isRetired(localStorage.getItem(key))) localStorage.removeItem(key); } catch {}
  function cleanOptions() {
    for (const select of document.querySelectorAll('select')) {
      const retired = isRetired(select.value);
      for (const option of [...select.options]) if (isRetired(option.value) || isRetired(option.textContent)) option.remove();
      if (retired) { select.value = ''; select.dispatchEvent(new Event('change', {bubbles:true})); }
    }
  }
  const observer = new MutationObserver(cleanOptions);
  observer.observe(document.documentElement, {childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded', cleanOptions);
  addEventListener('pageshow', () => {
    cleanOptions();
    try { if (isRetired(window.RioContext?.branch)) location.replace(new URL('../'.repeat(location.pathname.includes('/apps/') ? 2 : 0) + 'index.html?branch=change', location.href)); } catch {}
  });
})();
