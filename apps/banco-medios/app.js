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
  if (el.search) {
    el.search.addEventListener("input", () => {
      state.q = el.search.value.trim().toLowerCase();
      applyFilters();
    });
  }

  if (el.local) {
    el.local.addEventListener("change", () => {
      state.local = el.local.value;
      applyFilters();
    });
  }

  if (el.marca) {
    el.marca.addEventListener("change", () => {
      state.marca = el.marca.value;
      applyFilters();
    });
  }

  if (el.modalClose) {
    el.modalClose.addEventListener("click", closeModal);
  }

  if (el.modal) {
    el.modal.addEventListener("click", (e) => {
      if (e.target === el.modal) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.modal && !el.modal.hidden) {
      closeModal();
    }
  });
}

async function loadData() {
  if (el.grid) {
    el.grid.innerHTML = `<div class="empty">Cargando videos...</div>`;
  }

  if (el.total) {
    el.total.textContent = "Cargando...";
  }

  try {
    const res = await fetch(API_URL, { method: "GET" });
    const data = await res.json();

    if (!data.ok) {
      if (el.grid) {
        el.grid.innerHTML = `<div class="empty">Error al cargar datos.</div>`;
      }
      if (el.total) {
        el.total.textContent = "0 videos";
      }
      return;
    }

    state.items = Array.isArray(data.items) ? data.items : [];
    buildFilters();
    applyFilters();
  } catch (error) {
    console.error("Error cargando videos:", error);

    if (el.grid) {
      el.grid.innerHTML = `<div class="empty">No se pudieron cargar los videos.</div>`;
    }

    if (el.total) {
      el.total.textContent = "0 videos";
    }
  }
}

function buildFilters() {
  const locales = new Set();
  const marcas = new Set();

  state.items.forEach(item => {
    (item.locales || []).forEach(x => locales.add(x));
    (item.marcas || []).forEach(x => marcas.add(x));
  });

  if (el.local) {
    fillSelect(el.local, [...locales].sort((a, b) => a.localeCompare(b)), "Todos los locales");
  }

  if (el.marca) {
    fillSelect(el.marca, [...marcas].sort((a, b) => a.localeCompare(b)), "Todas las marcas");
  }
}

function fillSelect(select, values, placeholder) {
  if (!select) return;

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
      item.nombre || "",
      item.ruta || "",
      item.carpetaOrigen || "",
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
  if (el.total) {
    el.total.textContent = `${state.filtered.length} videos`;
  }

  if (!el.grid) return;

  if (!state.filtered.length) {
    el.grid.innerHTML = `<div class="empty">No se encontraron videos.</div>`;
    return;
  }

  el.grid.innerHTML = state.filtered.map(item => `
    <article class="card">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.nombre || "")}</h3>

        <div class="tags">
          ${(item.locales || []).map(x => `<span class="tag">${escapeHtml(x)}</span>`).join("")}
          ${(item.marcas || []).map(x => `<span class="tag tag-brand">${escapeHtml(x)}</span>`).join("")}
        </div>

        <p class="meta">${escapeHtml(item.carpetaOrigen || "")}</p>
        <p class="meta">${escapeHtml(item.ruta || "")}</p>

        <div class="actions">
          <button class="btn" type="button" data-id="${escapeHtml(item.id || "")}">Reproducir</button>
          <a class="btn btn-link" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">Abrir en Drive</a>
        </div>
      </div>
    </article>
  `).join("");

  el.grid.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = state.filtered.find(x => String(x.id) === String(btn.dataset.id));
      if (item) {
        openModal(item);
      }
    });
  });
}

function openModal(item) {
  if (!el.modal || !el.modalTitle || !el.modalFrameWrap) return;

  el.modalTitle.textContent = item.nombre || "Video";

  el.modalFrameWrap.innerHTML = item.previewUrl
    ? `
      <iframe
        src="${item.previewUrl}"
        allow="autoplay; fullscreen"
        allowfullscreen
        frameborder="0"
        width="100%"
        height="100%">
      </iframe>
    `
    : `<div class="empty">Este video no tiene URL de preview.</div>`;

  el.modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  if (!el.modal || !el.modalFrameWrap) return;

  el.modalFrameWrap.innerHTML = "";
  el.modal.hidden = true;
  document.body.classList.remove("modal-open");
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