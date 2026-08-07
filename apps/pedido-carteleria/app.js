const grid = document.querySelector("#designGrid");
const resultCount = document.querySelector("#resultCount");
const searchInput = document.querySelector("#designSearch");
const segmentButtons = [...document.querySelectorAll(".segment")];
const previewDialog = document.querySelector("#previewDialog");
const previewImage = document.querySelector("#previewImage");
const previewTitle = document.querySelector("#previewTitle");
const previewDownload = document.querySelector("#previewDownload");
const closePreview = document.querySelector("#closePreview");

const state = {
  projects: [],
  activeProject: "all",
  query: "",
  visibleLimit: 60,
};

function normalizeText(text) {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getAssetUrl(path) {
  if (window.location.hostname !== "adamiangarciadev.github.io") return path;

  const cleanPath = path.replace(/^\.\//, "");
  return `https://raw.githubusercontent.com/adamiangarciadev/Rio-tools/main/apps/pedido-carteleria/${cleanPath}`;
}

function flattenItems(projects) {
  return projects.flatMap((project) =>
    project.items.map((item) => ({
      ...item,
      projectId: project.id,
      projectTitle: project.title,
    })),
  );
}

function getFilteredItems() {
  const query = normalizeText(state.query);
  return flattenItems(state.projects).filter((item) => {
    const matchesProject = state.activeProject === "all" || item.projectId === state.activeProject;
    const searchable = item.searchText || normalizeText(`${item.projectTitle} ${item.title} ${item.number} ${item.text || ""}`);
    return matchesProject && (!query || searchable.includes(query));
  });
}

function getSnippet(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Sin texto extraible";
  return clean.length > 92 ? `${clean.slice(0, 92)}...` : clean;
}

function renderCards() {
  const items = getFilteredItems();
  const visible = items.slice(0, state.visibleLimit);

  resultCount.textContent = `${items.length} disenos encontrados`;
  grid.innerHTML = "";

  const fragment = document.createDocumentFragment();
  visible.forEach((item) => {
    const card = document.createElement("article");
    card.className = "design-card";

    const button = document.createElement("button");
    button.className = "preview-button";
    button.type = "button";
    button.setAttribute("aria-label", `Ver ${item.projectTitle}, pagina ${item.number}`);
    button.addEventListener("click", () => openPreview(item));

    const image = document.createElement("img");
    image.src = getAssetUrl(item.image);
    image.loading = "lazy";
    image.alt = `${item.projectTitle} - pagina ${item.number}`;

    const caption = document.createElement("div");
    caption.className = "design-caption";
    caption.innerHTML = `
      <strong>${item.projectTitle}</strong>
      <span>Pagina ${item.number}</span>
      <small>${getSnippet(item.text)}</small>
    `;

    const download = document.createElement("a");
    download.className = "image-download";
    download.href = getAssetUrl(item.pdf);
    download.download = `${item.projectId}-pagina-${String(item.number).padStart(3, "0")}.pdf`;
    download.textContent = "Descargar PDF";

    button.append(image);
    card.append(button, caption, download);
    fragment.append(card);
  });

  if (visible.length < items.length) {
    const more = document.createElement("button");
    more.className = "load-more";
    more.type = "button";
    more.textContent = `Mostrar mas (${items.length - visible.length})`;
    more.addEventListener("click", () => {
      state.visibleLimit += 60;
      renderCards();
    });
    fragment.append(more);
  }

  grid.append(fragment);
}

function openPreview(item) {
  previewImage.src = getAssetUrl(item.image);
  previewImage.alt = `${item.projectTitle} - pagina ${item.number}`;
  previewTitle.textContent = `${item.projectTitle} - Pagina ${item.number}`;
  previewDownload.href = getAssetUrl(item.pdf);
  previewDownload.download = `${item.projectId}-pagina-${String(item.number).padStart(3, "0")}.pdf`;
  previewDialog.showModal();
}

segmentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    segmentButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.activeProject = button.dataset.project;
    state.visibleLimit = 60;
    renderCards();
  });
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  state.visibleLimit = 60;
  renderCards();
});

closePreview.addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("click", (event) => {
  if (event.target === previewDialog) previewDialog.close();
});

fetch("./designs.json")
  .then((response) => {
    if (!response.ok) throw new Error("No se pudo cargar designs.json");
    return response.json();
  })
  .then((projects) => {
    state.projects = projects;
    renderCards();
  })
  .catch((error) => {
    resultCount.textContent = error.message;
  });
