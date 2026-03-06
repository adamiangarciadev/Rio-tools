const API_URL = "https://script.google.com/macros/s/AKfycbyr1LElKiXAgYRsw6b6wXLAt6SZuhlAMlWWD7qAmTarI0ATzuolqfYHlBXthzTuuyhY/exec?accion=videos";

const state = {
  items: [],
  filtered: [],
  q: "",
  local: "",
  marca: ""
};

const $ = (sel, root = document) => root.querySelector(sel);

const el = {
  search: $("#searchInput"),
  local: $("#localFilter"),
  marca: $("#marcaFilter"),
  grid: $("#videoGrid"),
  total: $("#totalCount"),
  modal: $("#videoModal"),
  modalTitle: $("#modalTitle"),
  modalFrameWrap: $("#modalFrameWrap"),
  modalClose: $("#modalClose")
};

async function init() {
  bindEvents();
  await loadData();
}

function bindEvents() {
  el.search.addEventListener("input", () => {
    state.q = el.search.value.trim().toLowerCase();
    applyFilters();
  });

  el.local.addEventListener("change", () => {
    state.local = el.local.value;
    applyFilters();
  });

  el.marca.addEventListener("change", () => {
    state.marca = el.marca.value;
    applyFilters();
  });

  el.modalClose.addEventListener("click", closeModal);

  el.modal.addEventListener("click", (e) => {
    if (e.target === el.modal) closeModal();
  });
}

async function loadData() {
  el.grid.innerHTML = `<div class="empty">Cargando videos...</div>`;

  const res = await fetch(API_URL);
  const data = await res.json();

  if (!data.ok) {
    el.grid.innerHTML = `<div class="empty">Error al cargar datos.</div>`;
    return;
  }

  state.items = data.items || [];
  buildFilters();
  applyFilters();
}

function buildFilters() {
  const locales = new Set();
  const marcas = new Set();

  state.items.forEach(item => {
    (item.locales || []).forEach(x => locales.add(x));
    (item.marcas || []).forEach(x => marcas.add(x));
  });

  fillSelect(el.local, [...locales].sort(), "Todos los locales");
  fillSelect(el.marca, [...marcas].sort(), "Todas las marcas");
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  select.appendChild(opt0);

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function applyFilters() {
  state.filtered = state.items.filter(item => {
    const text = [
      item.nombre,
      item.ruta,
      ...(item.locales || []),
      ...(item.marcas || [])
    ].join(" ").toLowerCase();

    const matchQ = !state.q || text.includes(state.q);
    const matchLocal = !state.local || (item.locales || []).includes(state.local);
    const matchMarca = !state.marca || (item.marcas || []).includes(state.marca);

    return matchQ && matchLocal && matchMarca;
  });

  renderGrid();
}

function renderGrid() {
  el.total.textContent = `${state.filtered.length} videos`;

  if (!state.filtered.length) {
    el.grid.innerHTML = `<div class="empty">No se encontraron videos.</div>`;
    return;
  }

  el.grid.innerHTML = state.filtered.map(item => `
    <article class="card">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.nombre)}</h3>

        <div class="tags">
          ${(item.locales || []).map(x => `<span class="tag">${escapeHtml(x)}</span>`).join("")}
          ${(item.marcas || []).map(x => `<span class="tag tag-brand">${escapeHtml(x)}</span>`).join("")}
        </div>

        <p class="meta">${escapeHtml(item.carpetaOrigen || "")}</p>
        <p class="meta">${escapeHtml(item.ruta || "")}</p>

        <div class="actions">
          <button class="btn" data-id="${item.id}">Reproducir</button>
          <a class="btn btn-link" href="${item.url}" target="_blank" rel="noopener noreferrer">Abrir en Drive</a>
        </div>
      </div>
    </article>
  `).join("");

  el.grid.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = state.filtered.find(x => x.id === btn.dataset.id);
      if (item) openModal(item);
    });
  });
}

function openModal(item) {
  el.modalTitle.textContent = item.nombre;
  el.modalFrameWrap.innerHTML = `
    <iframe
      src="${item.previewUrl}"
      allow="autoplay"
      allowfullscreen
      frameborder="0"
      width="100%"
      height="100%">
    </iframe>
  `;
  el.modal.hidden = false;
}

function closeModal() {
  el.modal.hidden = true;
  el.modalFrameWrap.innerHTML = "";
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();