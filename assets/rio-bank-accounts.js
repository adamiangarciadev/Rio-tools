(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  let pending;
  function accounts() {
    if (!pending) pending = fetch(new URL('rio-bank-accounts.json', base))
      .then(r => { if (!r.ok) throw new Error('No disponible'); return r.json(); })
      .catch(error => { pending = null; throw error; });
    return pending;
  }
  async function render(container) {
    container.textContent = 'Cargando cuentas…';
    try {
      const rows = await accounts();
      const list = document.createElement('div');
      list.className = 'rio-bank-list';
      rows.forEach(row => {
        const item = document.createElement('div');
        item.className = 'rio-bank-item';
        const name = document.createElement('strong'); name.textContent = row.name;
        const actions = document.createElement('div'); actions.className = 'rio-bank-actions';
        const url = new URL('../apps/archivos-administrativos/cuentas/' + row.file, base).href;
        const view = document.createElement('a');
        view.href = url; view.target = '_blank'; view.rel = 'noopener'; view.textContent = 'Ver PDF';
        view.setAttribute('aria-label', 'Ver PDF de ' + row.name + ' (nueva pestaña)');
        const download = document.createElement('a');
        download.href = url; download.download = row.file; download.textContent = 'Descargar';
        download.setAttribute('aria-label', 'Descargar PDF de ' + row.name);
        actions.append(view, download); item.append(name, actions); list.append(item);
      });
      const note = document.createElement('p'); note.className = 'rio-bank-note';
      note.textContent = '10 cuentas con PDF disponible. Las cuentas sin documentación todavía no aparecen en esta lista.';
      container.replaceChildren(list, note);
    } catch (_) {
      container.textContent = 'No pudimos cargar las cuentas. ';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Reintentar';
      retry.addEventListener('click', () => render(container)); container.append(retry);
    }
  }
  document.querySelectorAll('[data-rio-bank-accounts]').forEach(render);
  document.querySelectorAll('[data-rio-bank-open]').forEach(button => {
    const dialog = document.createElement('dialog'); dialog.className = 'rio-bank-dialog';
    dialog.setAttribute('aria-label', 'Cuentas para depósito');
    const head = document.createElement('div'); head.className = 'rio-bank-toolbar';
    const title = document.createElement('h2'); title.textContent = 'Cuentas para depósito';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Cerrar'; close.autofocus = true;
    const content = document.createElement('div');
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    }});
    head.append(title, close); dialog.append(head, content); document.body.append(dialog);
    button.addEventListener('click', () => { dialog.showModal(); render(content); });
  });
})();
