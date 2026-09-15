(() => {
  const $ = selector => document.querySelector(selector);
  const filters = $('.filters');
  const search = $('#searchInput').closest('label');
  search.classList.add('sales-search');
  filters.prepend(search);
  const advanced = document.createElement('details');
  advanced.className = 'sales-advanced';
  advanced.innerHTML = '<summary>Más filtros y fechas</summary><div class="sales-advanced-grid"></div>';
  const host = advanced.lastElementChild;
  [...filters.children].filter(node => node !== search && !node.contains($('#periodFilter'))).forEach(node => host.append(node));
  filters.append(advanced);
  const actions = document.createElement('div');
  actions.className = 'sales-selection-actions';
  ['selectionText','exportBtn','deselectAllBtn'].forEach(id => actions.append($('#'+id)));
  $('.ranking-panel .panel-head').after(actions);
  $('#clearSelectionBtn').hidden = true;
  $('.view-actions').setAttribute('role','group');
  const syncSort = () => $('[data-sort]').parentElement.querySelectorAll('[data-sort]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
  $('.view-actions').addEventListener('click',syncSort); syncSort();
  let scrollPosition = 0, selectedId = '';
  window.RioSalesView = {
    open(id) {
      scrollPosition = window.scrollY; selectedId = id;
      $('.ranking-panel').hidden = true;
      $('.detail-panel').hidden = false;
      $('.content-grid').scrollIntoView({block:'start'});
      $('#backToClients').focus({preventScroll:true});
    }
  };
  $('#backToClients').addEventListener('click', () => {
    $('.detail-panel').hidden = true; $('.ranking-panel').hidden = false;
    window.scrollTo({top:scrollPosition});
    [...document.querySelectorAll('.client-button')].find(button => button.dataset.clientId === selectedId)?.focus({preventScroll:true});
  });
})();
