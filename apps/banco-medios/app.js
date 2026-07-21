const API_URL = window.BANCO_MEDIOS_API_URL || "";
const PAGE_SIZE = 8;

const state = {
  items: [],
  filtered: [],
  renderedCount: 0,
  q: "",
  local: "ESTADOS/HISTORIAS",
  marca: ""
};

const $ = (sel, root = document) => root.querySelector(sel);

const el = {
  search: $("#searchInput"),
  local: $("#localFilter"),
  marca: $("#marcaFilter"),
  grid: $("#videoGrid"),
  sentinel: $("#loadMoreSentinel"),
  total: $("#totalCount"),
  downloadModal: $("#downloadModal"),
  downloadTitle: $("#downloadTitle"),
  downloadMessage: $("#downloadMessage"),
  downloadRetry: $("#downloadRetry"),
  downloadDrive: $("#downloadDrive"),
  copyDownloadLink: $("#copyDownloadLink"),
  downloadClose: $("#downloadClose")
};

let activeDownload = null;
let loadObserver = null;

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

  if (el.downloadClose) {
    el.downloadClose.addEventListener("click", closeDownloadModal);
  }

  if (el.downloadModal) {
    el.downloadModal.addEventListener("click", (e) => {
      if (e.target === el.downloadModal) {
        closeDownloadModal();
      }
    });
  }

  if (el.copyDownloadLink) {
    el.copyDownloadLink.addEventListener("click", copyActiveDownloadLink);
  }

  if (el.grid) {
    el.grid.addEventListener("click", (event) => {
      const link = event.target.closest(".js-download");
      if (!link) return;

      const item = state.filtered.find(x => String(x.id) === String(link.dataset.id));
      if (item) {
        showDownloadHelp(item, link.href);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.downloadModal && !el.downloadModal.hidden) {
      closeDownloadModal();
    }
  });

  setupLoadMoreObserver();
}

async function loadData() {
  if (el.grid) {
    el.grid.innerHTML = `<div class="empty">Cargando videos...</div>`;
  }

  if (el.total) {
    el.total.textContent = "Cargando...";
  }

  if (!API_URL) {
    if (el.grid) {
      el.grid.innerHTML = `<div class="empty">Falta configurar la URL de datos.</div>`;
    }
    if (el.total) {
      el.total.textContent = "0 videos";
    }
    return;
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
    applyInitialFilterSelection();
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
    fillSelect(
      el.local,
      [...locales].sort((a, b) => a.localeCompare(b)),
      "Todos los locales"
    );
  }

  if (el.marca) {
    fillSelect(
      el.marca,
      [...marcas].sort((a, b) => a.localeCompare(b)),
      "Todas las marcas"
    );
  }
}

function applyInitialFilterSelection() {
  if (el.local && state.local) {
    const exists = [...el.local.options].some(opt => opt.value === state.local);
    el.local.value = exists ? state.local : "";
    if (!exists) {
      state.local = "";
    }
  }

  if (el.marca && state.marca) {
    const exists = [...el.marca.options].some(opt => opt.value === state.marca);
    el.marca.value = exists ? state.marca : "";
    if (!exists) {
      state.marca = "";
    }
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

  state.renderedCount = 0;
  renderGrid();
}

function renderGrid() {
  if (el.total) {
    el.total.textContent = `${state.filtered.length} videos`;
  }

  if (!el.grid) return;

  state.renderedCount = 0;
  el.grid.innerHTML = "";

  if (!state.filtered.length) {
    el.grid.innerHTML = `<div class="empty">No se encontraron videos.</div>`;
    setSentinelState(false);
    return;
  }

  appendNextBatch();
}

function appendNextBatch() {
  if (!el.grid) return;

  const start = state.renderedCount;
  const nextItems = state.filtered.slice(start, start + PAGE_SIZE);

  if (!nextItems.length) {
    setSentinelState(false);
    return;
  }

  el.grid.insertAdjacentHTML("beforeend", nextItems.map(item => {
    const downloadUrl = getDownloadUrl(item);
    const driveUrl = getDriveViewUrl(item);
    const previewUrl = getPreviewUrl(item);
    const size = formatSize(item.sizeMB);
    const mime = getFriendlyMime(item.mime || item.nombre || "");

    return `
    <article class="card">
      <div class="card-preview">
        ${previewUrl
          ? `
            <iframe
              src="${escapeHtml(previewUrl)}"
              title="${escapeHtml(item.nombre || "Vista previa del video")}"
              loading="lazy"
              allow="autoplay; fullscreen"
              allowfullscreen
              frameborder="0">
            </iframe>
          `
          : `<div class="preview-empty">Sin vista previa</div>`}
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.nombre || "")}</h3>

        <div class="tags">
          ${(item.locales || []).map(x => `<span class="tag">${escapeHtml(x)}</span>`).join("")}
          ${(item.marcas || []).map(x => `<span class="tag tag-brand">${escapeHtml(x)}</span>`).join("")}
        </div>

        <p class="meta">${escapeHtml(item.carpetaOrigen || "")}</p>
        <p class="meta">${escapeHtml(item.ruta || "")}</p>
        <p class="file-meta">${escapeHtml(mime)}${size ? ` - ${escapeHtml(size)}` : ""}</p>

        <div class="actions">
          <a
            class="btn btn-download js-download"
            href="${escapeHtml(downloadUrl)}"
            data-id="${escapeHtml(item.id || "")}"
            target="_self"
            rel="noopener noreferrer"
          >
            Descargar al celular
          </a>
          <a
            class="btn btn-link"
            href="${escapeHtml(driveUrl)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir en Drive
          </a>
        </div>
      </div>
    </article>
  `;
  }).join(""));

  state.renderedCount += nextItems.length;
  setSentinelState(state.renderedCount < state.filtered.length);
}

function setupLoadMoreObserver() {
  if (!el.sentinel) return;

  if (!("IntersectionObserver" in window)) {
    window.addEventListener("scroll", () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
      if (nearBottom) appendNextBatch();
    }, { passive: true });
    return;
  }

  loadObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        appendNextBatch();
      }
    });
  }, {
    rootMargin: "600px 0px"
  });

  loadObserver.observe(el.sentinel);
}

function setSentinelState(isActive) {
  if (!el.sentinel) return;
  el.sentinel.hidden = !isActive;
}

function getDriveFileId(itemOrUrl = "") {
  const value = typeof itemOrUrl === "object"
    ? itemOrUrl.id || itemOrUrl.url || itemOrUrl.downloadUrl || itemOrUrl.previewUrl || ""
    : itemOrUrl;

  const cleanUrl = String(value).trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(cleanUrl)) return cleanUrl;

  const matchByFile = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const matchById = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  return matchByFile?.[1] || matchById?.[1] || "";
}

function getDownloadUrl(itemOrUrl = "") {
  const fileId = getDriveFileId(itemOrUrl);

  if (fileId) {
    return `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
  }

  const cleanUrl = typeof itemOrUrl === "object"
    ? itemOrUrl.downloadUrl || itemOrUrl.url || ""
    : itemOrUrl;

  if (!cleanUrl) return "#";
  return cleanUrl;
}

function getDriveViewUrl(item = {}) {
  const fileId = getDriveFileId(item);
  if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
  return item.url || item.previewUrl || item.downloadUrl || "#";
}

function getPreviewUrl(item = {}) {
  const fileId = getDriveFileId(item);
  if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
  return item.previewUrl || "";
}

function formatSize(sizeMB) {
  const value = Number(sizeMB);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 100) return `${Math.round(value)} MB`;
  if (value >= 10) return `${value.toFixed(1)} MB`;
  return `${value.toFixed(2)} MB`;
}

function getFriendlyMime(value = "") {
  const text = String(value).toLowerCase();
  if (text.includes("quicktime") || text.endsWith(".mov")) return "MOV";
  if (text.includes("mp4") || text.endsWith(".mp4")) return "MP4";
  if (text.includes("webm") || text.endsWith(".webm")) return "WEBM";
  return "Video";
}

function showDownloadHelp(item, downloadUrl) {
  activeDownload = {
    item,
    downloadUrl: downloadUrl || getDownloadUrl(item),
    driveUrl: getDriveViewUrl(item)
  };

  if (el.downloadTitle) {
    el.downloadTitle.textContent = item.nombre || "Descargar video";
  }

  if (el.downloadMessage) {
    const size = formatSize(item.sizeMB);
    el.downloadMessage.textContent = size
      ? `La descarga deberia empezar ahora. Este archivo pesa ${size}.`
      : "La descarga deberia empezar ahora.";
  }

  if (el.downloadRetry) {
    el.downloadRetry.href = activeDownload.downloadUrl;
  }

  if (el.downloadDrive) {
    el.downloadDrive.href = activeDownload.driveUrl;
  }

  if (el.copyDownloadLink) {
    el.copyDownloadLink.textContent = "Copiar link";
  }

  if (el.downloadModal) {
    el.downloadModal.hidden = false;
    document.body.classList.add("modal-open");
  }
}

async function copyActiveDownloadLink() {
  if (!activeDownload?.downloadUrl || !el.copyDownloadLink) return;

  try {
    await navigator.clipboard.writeText(activeDownload.downloadUrl);
    el.copyDownloadLink.textContent = "Link copiado";
  } catch (error) {
    console.error("No se pudo copiar el link:", error);
    el.copyDownloadLink.textContent = "No se pudo copiar";
  }
}

function closeDownloadModal() {
  if (!el.downloadModal) return;

  el.downloadModal.hidden = true;
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
