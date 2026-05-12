;(() => {
  "use strict";

  /*********************************************************
   * RIO Tools · Supervisión
   * Front completo
   *********************************************************/

  const API_BASE = "https://script.google.com/macros/s/AKfycbyPNnFMfJajzGTYgDnyT8uYaLbuDUltYxQVWj1RPWG7NTkf5zPco7mQvSFc3alZ9TzNAQ/exec";

  const ESTADOS = [
    "PENDIENTE",
    "EN CURSO",
    "REALIZADO CONFORME",
    "REALIZADO INCONFORME"
  ];

  const SUCURSALES = [
    "AV2",
    "NAZCA",
    "LAMARCA",
    "CORRIENTES",
    "CASTELLI",
    "QUILMES",
    "SARMIENTO",
    "DEPOSITO",
    "PUEYRREDON"
  ];

  const state = {
    tab: "locales",
    locales: [],
    globales: [],
    filtros: {
      locales: { sucursal: "", estado: "", q: "" },
      globales: { sucursal: "", estado: "", q: "" }
    }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = {
    tabLocalesBtn: $("#tabLocalesBtn"),
    tabGlobalesBtn: $("#tabGlobalesBtn"),

    panelLocales: $("#panelLocales"),
    panelGlobales: $("#panelGlobales"),

    screenTitle: $("#screenTitle"),
    screenSubtitle: $("#screenSubtitle"),
    refreshBtn: $("#refreshBtn"),

    totalTareas: $("#totalTareas"),
    totalPendientes: $("#totalPendientes"),
    totalEnCurso: $("#totalEnCurso"),
    totalRealizadas: $("#totalRealizadas"),

    formTareaLocal: $("#formTareaLocal"),
    formTareaGlobal: $("#formTareaGlobal"),

    localCreadoPor: $("#localCreadoPor"),
    localSucursal: $("#localSucursal"),
    localTitulo: $("#localTitulo"),
    localDescripcion: $("#localDescripcion"),
    localEstado: $("#localEstado"),
    localAdjuntos: $("#localAdjuntos"),
    localFormMsg: $("#localFormMsg"),

    globalCreadoPor: $("#globalCreadoPor"),
    globalTitulo: $("#globalTitulo"),
    globalDescripcion: $("#globalDescripcion"),
    globalAdjuntos: $("#globalAdjuntos"),
    globalFormMsg: $("#globalFormMsg"),

    filtroLocalSucursal: $("#filtroLocalSucursal"),
    filtroLocalEstado: $("#filtroLocalEstado"),
    buscarLocal: $("#buscarLocal"),

    filtroGlobalSucursal: $("#filtroGlobalSucursal"),
    filtroGlobalEstado: $("#filtroGlobalEstado"),
    buscarGlobal: $("#buscarGlobal"),

    listaTareasLocales: $("#listaTareasLocales"),
    listaTareasGlobales: $("#listaTareasGlobales"),

    mediaModal: $("#mediaModal"),
    mediaModalBackdrop: $("#mediaModalBackdrop"),
    mediaModalClose: $("#mediaModalClose"),
    mediaModalTitle: $("#mediaModalTitle"),
    mediaModalBody: $("#mediaModalBody"),

    tplTareaLocal: $("#tplTareaLocal"),
    tplTareaGlobal: $("#tplTareaGlobal"),
    tplEstadoSucursal: $("#tplEstadoSucursal")
  };

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(d);
  }

  function makeId(prefix = "T") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function setFormMessage(node, msg) {
    if (node) node.textContent = msg || "";
  }

  function statusToDataset(node, status) {
    if (!node) return;
    node.dataset.status = status || "";
    node.textContent = status || "-";
  }

  function isImage(item) {
    const type = item?.type || "";
    const url = String(item?.url || item?.previewUrl || item?.webViewLink || "").toLowerCase();
    return type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);
  }

  function isVideo(item) {
    const type = item?.type || "";
    const url = String(item?.url || item?.previewUrl || item?.webViewLink || "").toLowerCase();
    return type.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(url);
  }

  function normalizeAdjuntos(adjuntos) {
    return Array.isArray(adjuntos) ? adjuntos : [];
  }

  function hasEditTemplateForLocal(fragment) {
    return !!$(".js-save-local", fragment);
  }

  function hasEditTemplateForBranch(fragment) {
    return !!$(".js-save-branch", fragment);
  }

  async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function filesToBase64(fileList) {
    const files = Array.from(fileList || []);
    const out = [];

    for (const file of files) {
      const base64 = await readFileAsBase64(file);
      out.push({
        name: file.name,
        type: file.type || "application/octet-stream",
        base64
      });
    }

    return out;
  }

  async function apiGet(action) {
    const url = new URL(API_BASE);
    url.searchParams.set("accion", action);

    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function apiPost(action, payload) {
    const url = new URL(API_BASE);
    url.searchParams.set("accion", action);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadData() {
    const data = await apiGet("listar_supervision");
    state.locales = Array.isArray(data?.locales) ? data.locales : [];
    state.globales = Array.isArray(data?.globales) ? data.globales : [];
  }

  function populateSucursales() {
    const selects = [
      el.localSucursal,
      el.filtroLocalSucursal,
      el.filtroGlobalSucursal
    ];

    selects.forEach((select) => {
      if (!select) return;

      const isFiltro = select.id.includes("filtro");
      select.innerHTML = `<option value="">${isFiltro ? "Todas" : "Seleccionar sucursal"}</option>`;

      SUCURSALES.forEach((sucursal) => {
        const option = document.createElement("option");
        option.value = sucursal;
        option.textContent = sucursal;
        select.appendChild(option);
      });
    });

    [el.localEstado, el.filtroLocalEstado, el.filtroGlobalEstado].forEach((select) => {
      if (!select || select.options.length > 1) return;

      ESTADOS.forEach((estado) => {
        const option = document.createElement("option");
        option.value = estado;
        option.textContent = estado;
        select.appendChild(option);
      });
    });
  }

  function bindEvents() {
    el.tabLocalesBtn?.addEventListener("click", () => setTab("locales"));
    el.tabGlobalesBtn?.addEventListener("click", () => setTab("globales"));

    el.refreshBtn?.addEventListener("click", async () => {
      await refreshAll();
    });

    el.formTareaLocal?.addEventListener("submit", handleSubmitLocal);
    el.formTareaGlobal?.addEventListener("submit", handleSubmitGlobal);

    el.filtroLocalSucursal?.addEventListener("change", () => {
      state.filtros.locales.sucursal = el.filtroLocalSucursal.value;
      renderAll();
    });

    el.filtroLocalEstado?.addEventListener("change", () => {
      state.filtros.locales.estado = el.filtroLocalEstado.value;
      renderAll();
    });

    el.buscarLocal?.addEventListener("input", () => {
      state.filtros.locales.q = el.buscarLocal.value;
      renderAll();
    });

    el.filtroGlobalSucursal?.addEventListener("change", () => {
      state.filtros.globales.sucursal = el.filtroGlobalSucursal.value;
      renderAll();
    });

    el.filtroGlobalEstado?.addEventListener("change", () => {
      state.filtros.globales.estado = el.filtroGlobalEstado.value;
      renderAll();
    });

    el.buscarGlobal?.addEventListener("input", () => {
      state.filtros.globales.q = el.buscarGlobal.value;
      renderAll();
    });

    el.mediaModalBackdrop?.addEventListener("click", closeMediaModal);
    el.mediaModalClose?.addEventListener("click", closeMediaModal);

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeMediaModal();
    });
  }

  async function refreshAll() {
    setFormMessage(el.localFormMsg, "Actualizando...");
    setFormMessage(el.globalFormMsg, "Actualizando...");

    try {
      await loadData();
      renderAll();
      setFormMessage(el.localFormMsg, "");
      setFormMessage(el.globalFormMsg, "");
    } catch (err) {
      console.error(err);
      setFormMessage(el.localFormMsg, "No se pudieron actualizar los datos.");
      setFormMessage(el.globalFormMsg, "No se pudieron actualizar los datos.");
    }
  }

  function setTab(tab) {
    state.tab = tab;

    const isLocales = tab === "locales";

    el.tabLocalesBtn?.classList.toggle("active", isLocales);
    el.tabGlobalesBtn?.classList.toggle("active", !isLocales);

    el.panelLocales?.classList.toggle("active", isLocales);
    el.panelGlobales?.classList.toggle("active", !isLocales);

    if (el.screenTitle) {
      el.screenTitle.textContent = isLocales ? "Tareas por local" : "Tareas globales";
    }

    if (el.screenSubtitle) {
      el.screenSubtitle.textContent = isLocales
        ? "Creación, seguimiento y control de tareas por sucursal."
        : "Seguimiento centralizado de tareas globales por sucursal.";
    }

    renderSummary();
  }

  async function handleSubmitLocal(ev) {
    ev.preventDefault();

    const creadoPor = el.localCreadoPor?.value?.trim();
    const sucursal = el.localSucursal?.value;
    const titulo = el.localTitulo?.value?.trim();
    const descripcion = el.localDescripcion?.value?.trim();
    const estado = el.localEstado?.value;

    if (!creadoPor || !sucursal || !titulo || !descripcion || !estado) {
      setFormMessage(el.localFormMsg, "Completá todos los campos obligatorios.");
      return;
    }

    setFormMessage(el.localFormMsg, "Guardando tarea local...");

    try {
      const filesBase64 = await filesToBase64(el.localAdjuntos?.files);

      const payload = {
        id: makeId("LOC"),
        creadoPor,
        sucursal,
        titulo,
        descripcion,
        estado,
        filesBase64
      };

      const res = await apiPost("crear_tarea_local", payload);
      if (!res?.ok) throw new Error(res?.error || "No se pudo crear la tarea local");

      el.formTareaLocal?.reset();
      await refreshAll();
      setFormMessage(el.localFormMsg, "Tarea local guardada correctamente.");
    } catch (err) {
      console.error(err);
      setFormMessage(el.localFormMsg, "No se pudo guardar la tarea local.");
    }
  }

  async function handleSubmitGlobal(ev) {
    ev.preventDefault();

    const creadoPor = el.globalCreadoPor?.value?.trim();
    const titulo = el.globalTitulo?.value?.trim();
    const descripcion = el.globalDescripcion?.value?.trim();

    if (!creadoPor || !titulo || !descripcion) {
      setFormMessage(el.globalFormMsg, "Completá todos los campos obligatorios.");
      return;
    }

    setFormMessage(el.globalFormMsg, "Guardando tarea global...");

    try {
      const filesBase64 = await filesToBase64(el.globalAdjuntos?.files);

      const payload = {
        id: makeId("GLOB"),
        creadoPor,
        titulo,
        descripcion,
        filesBase64
      };

      const res = await apiPost("crear_tarea_global", payload);
      if (!res?.ok) throw new Error(res?.error || "No se pudo crear la tarea global");

      el.formTareaGlobal?.reset();
      await refreshAll();
      setFormMessage(el.globalFormMsg, "Tarea global guardada correctamente.");
    } catch (err) {
      console.error(err);
      setFormMessage(el.globalFormMsg, "No se pudo guardar la tarea global.");
    }
  }

  function getFilteredLocales() {
    const { sucursal, estado, q } = state.filtros.locales;
    const qq = normalizeText(q);

    return state.locales.filter((item) => {
      const okSucursal = !sucursal || item.sucursal === sucursal;
      const okEstado = !estado || item.estado === estado;

      const searchable = normalizeText([
        item.id,
        item.titulo,
        item.descripcion,
        item.sucursal,
        item.estado,
        item.creadoPor
      ].join(" "));

      const okQ = !qq || searchable.includes(qq);

      return okSucursal && okEstado && okQ;
    });
  }

  function getFilteredGlobales() {
    const { sucursal, estado, q } = state.filtros.globales;
    const qq = normalizeText(q);

    return state.globales.filter((item) => {
      const searchable = normalizeText([
        item.id,
        item.titulo,
        item.descripcion,
        item.creadoPor
      ].join(" "));

      const okQ = !qq || searchable.includes(qq);

      const estadosSucursal = Array.isArray(item.estadosSucursal) ? item.estadosSucursal : [];
      const okSucursal = !sucursal || estadosSucursal.some((x) => x.sucursal === sucursal);
      const okEstado = !estado || estadosSucursal.some((x) => x.estado === estado);

      return okQ && okSucursal && okEstado;
    });
  }

  function renderSummary() {
    const items = state.tab === "locales" ? getFilteredLocales() : getFilteredGlobales();

    let totalPendientes = 0;
    let totalEnCurso = 0;
    let totalRealizadas = 0;

    if (state.tab === "locales") {
      items.forEach((item) => {
        if (item.estado === "PENDIENTE") totalPendientes += 1;
        else if (item.estado === "EN CURSO") totalEnCurso += 1;
        else if (
          item.estado === "REALIZADO CONFORME" ||
          item.estado === "REALIZADO INCONFORME"
        ) {
          totalRealizadas += 1;
        }
      });
    } else {
      items.forEach((item) => {
        const estados = Array.isArray(item.estadosSucursal) ? item.estadosSucursal : [];

        estados.forEach((estadoItem) => {
          const okSucursal =
            !state.filtros.globales.sucursal ||
            estadoItem.sucursal === state.filtros.globales.sucursal;

          const okEstado =
            !state.filtros.globales.estado ||
            estadoItem.estado === state.filtros.globales.estado;

          if (!okSucursal || !okEstado) return;

          if (estadoItem.estado === "PENDIENTE") totalPendientes += 1;
          else if (estadoItem.estado === "EN CURSO") totalEnCurso += 1;
          else if (
            estadoItem.estado === "REALIZADO CONFORME" ||
            estadoItem.estado === "REALIZADO INCONFORME"
          ) {
            totalRealizadas += 1;
          }
        });
      });
    }

    if (el.totalTareas) el.totalTareas.textContent = String(items.length);
    if (el.totalPendientes) el.totalPendientes.textContent = String(totalPendientes);
    if (el.totalEnCurso) el.totalEnCurso.textContent = String(totalEnCurso);
    if (el.totalRealizadas) el.totalRealizadas.textContent = String(totalRealizadas);
  }

  function renderAll() {
    renderSummary();
    renderLocales();
    renderGlobales();
  }

  function renderLocales() {
    if (!el.listaTareasLocales) return;

    const items = getFilteredLocales();
    el.listaTareasLocales.innerHTML = "";

    if (!items.length) {
      el.listaTareasLocales.innerHTML = `<div class="empty-state">No hay tareas locales para los filtros seleccionados.</div>`;
      return;
    }

    items.forEach((item) => {
      const fragment = el.tplTareaLocal.content.cloneNode(true);

      const card = $(".task-card", fragment);
      const head = $(".task-card__head", fragment);
      const title = $(".task-card__title", fragment);
      const meta = $(".task-card__meta", fragment);
      const status = $(".task-card__status", fragment);
      const desc = $(".task-card__desc", fragment);

      const sucursal = $(".js-sucursal", fragment);
      const creadoPor = $(".js-creado-por", fragment);
      const fecha = $(".js-fecha", fragment);
      const actualizacion = $(".js-actualizacion", fragment);
      const adjuntos = $(".js-adjuntos", fragment);

      if (title) title.textContent = item.titulo || "-";
      if (meta) meta.textContent = `${item.sucursal || "-"} · ${formatDate(item.fecha)}`;
      statusToDataset(status, item.estado);
      if (desc) desc.textContent = item.descripcion || "-";

      if (sucursal) sucursal.textContent = item.sucursal || "-";
      if (creadoPor) creadoPor.textContent = item.creadoPor || "-";
      if (fecha) fecha.textContent = formatDate(item.fecha);
      if (actualizacion) actualizacion.textContent = formatDate(item.ultimaActualizacion);

      renderAdjuntos(adjuntos, item.adjuntos);

      const editTitulo = $(".js-edit-titulo", fragment);
      const editDescripcion = $(".js-edit-descripcion", fragment);
      const editEstado = $(".js-edit-estado", fragment);
      const editAdjuntos = $(".js-edit-adjuntos", fragment);
      const saveBtn = $(".js-save-local", fragment);
      const editMsg = $(".js-edit-msg", fragment);

      if (hasEditTemplateForLocal(fragment)) {
        if (editTitulo) editTitulo.value = item.titulo || "";
        if (editDescripcion) editDescripcion.value = item.descripcion || "";
        if (editEstado) editEstado.value = item.estado || "PENDIENTE";

        saveBtn?.addEventListener("click", async () => {
          try {
            setFormMessage(editMsg, "Guardando cambios...");
            saveBtn.disabled = true;

            const filesBase64 = await filesToBase64(editAdjuntos?.files);

            const payload = {
              id: item.id,
              titulo: editTitulo?.value?.trim() || item.titulo,
              descripcion: editDescripcion?.value?.trim() || item.descripcion,
              sucursal: item.sucursal,
              estado: editEstado?.value || item.estado,
              adjuntos: normalizeAdjuntos(item.adjuntos),
              filesBase64
            };

            const res = await apiPost("actualizar_tarea_local", payload);
            if (!res?.ok) throw new Error(res?.error || "No se pudo actualizar la tarea");

            await refreshAll();
          } catch (err) {
            console.error(err);
            setFormMessage(editMsg, "No se pudieron guardar los cambios.");
          } finally {
            if (saveBtn) saveBtn.disabled = false;
          }
        });
      }

      head?.addEventListener("click", () => {
        card?.classList.toggle("open");
      });

      el.listaTareasLocales.appendChild(fragment);
    });
  }

  function renderGlobales() {
    if (!el.listaTareasGlobales) return;

    const items = getFilteredGlobales();
    el.listaTareasGlobales.innerHTML = "";

    if (!items.length) {
      el.listaTareasGlobales.innerHTML = `<div class="empty-state">No hay tareas globales para los filtros seleccionados.</div>`;
      return;
    }

    items.forEach((item) => {
      const fragment = el.tplTareaGlobal.content.cloneNode(true);

      const card = $(".task-card", fragment);
      const head = $(".task-card__head", fragment);
      const title = $(".task-card__title", fragment);
      const meta = $(".task-card__meta", fragment);
      const desc = $(".task-card__desc", fragment);

      const creadoPor = $(".js-creado-por", fragment);
      const fecha = $(".js-fecha", fragment);
      const actualizacion = $(".js-actualizacion", fragment);
      const adjuntos = $(".js-adjuntos", fragment);
      const estadosWrap = $(".js-estados-sucursales", fragment);

      if (title) title.textContent = item.titulo || "-";
      if (meta) meta.textContent = `${formatDate(item.fecha)}`;
      if (desc) desc.textContent = item.descripcion || "-";

      if (creadoPor) creadoPor.textContent = item.creadoPor || "-";
      if (fecha) fecha.textContent = formatDate(item.fecha);
      if (actualizacion) actualizacion.textContent = formatDate(item.ultimaActualizacion);

      renderAdjuntos(adjuntos, item.adjuntos);
      renderEstadosSucursal(estadosWrap, item);

      head?.addEventListener("click", () => {
        card?.classList.toggle("open");
      });

      el.listaTareasGlobales.appendChild(fragment);
    });
  }

  function renderEstadosSucursal(container, tareaGlobal) {
    if (!container) return;

    container.innerHTML = "";

    const selectedSucursal = state.filtros.globales.sucursal;
    const selectedEstado = state.filtros.globales.estado;

    const items = (Array.isArray(tareaGlobal.estadosSucursal) ? tareaGlobal.estadosSucursal : []).filter((item) => {
      const okSucursal = !selectedSucursal || item.sucursal === selectedSucursal;
      const okEstado = !selectedEstado || item.estado === selectedEstado;
      return okSucursal && okEstado;
    });

    if (!items.length) {
      container.innerHTML = `<div class="empty-state">No hay estados por sucursal para mostrar.</div>`;
      return;
    }

    items.forEach((item) => {
      const fragment = el.tplEstadoSucursal.content.cloneNode(true);

      const branchName = $(".js-branch-name", fragment);
      const branchState = $(".js-branch-state", fragment);
      const branchNote = $(".js-branch-note", fragment);
      const branchAdjuntos = $(".js-branch-adjuntos", fragment);

      if (branchName) branchName.textContent = item.sucursal || "-";
      statusToDataset(branchState, item.estado);
      if (branchNote) branchNote.textContent = item.observacion || "Sin observaciones.";
      renderAdjuntos(branchAdjuntos, item.adjuntos);

      const editEstado = $(".js-branch-edit-estado", fragment);
      const editNote = $(".js-branch-edit-note", fragment);
      const editFiles = $(".js-branch-edit-files", fragment);
      const saveBtn = $(".js-save-branch", fragment);
      const msg = $(".js-branch-msg", fragment);

      if (hasEditTemplateForBranch(fragment)) {
        if (editEstado) editEstado.value = item.estado || "PENDIENTE";
        if (editNote) editNote.value = item.observacion || "";

        saveBtn?.addEventListener("click", async () => {
          try {
            setFormMessage(msg, "Guardando estado...");
            saveBtn.disabled = true;

            const filesBase64 = await filesToBase64(editFiles?.files);

            const payload = {
              idGlobal: tareaGlobal.id,
              sucursal: item.sucursal,
              estado: editEstado?.value || item.estado,
              observacion: editNote?.value?.trim() || "",
              adjuntos: normalizeAdjuntos(item.adjuntos),
              filesBase64
            };

            const res = await apiPost("actualizar_estado_global_sucursal", payload);
            if (!res?.ok) throw new Error(res?.error || "No se pudo actualizar el estado");

            await refreshAll();
          } catch (err) {
            console.error(err);
            setFormMessage(msg, "No se pudo guardar el estado.");
          } finally {
            if (saveBtn) saveBtn.disabled = false;
          }
        });
      }

      container.appendChild(fragment);
    });
  }

  function renderAdjuntos(container, adjuntos) {
    if (!container) return;

    container.innerHTML = "";

    const items = Array.isArray(adjuntos) ? adjuntos : [];
    if (!items.length) {
      container.innerHTML = `<span class="label">Sin adjuntos</span>`;
      return;
    }

    items.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "media-chip";

      const icon = isVideo(item) ? "🎬" : isImage(item) ? "🖼️" : "📎";
      btn.innerHTML = `<span>${icon}</span><span>${escapeHtml(item.name || `Adjunto ${index + 1}`)}</span>`;

      btn.addEventListener("click", () => {
        openMediaModal(item);
      });

      container.appendChild(btn);
    });
  }

  function openMediaModal(item) {
    if (!item || !el.mediaModal || !el.mediaModalBody || !el.mediaModalTitle) return;

    el.mediaModalTitle.textContent = item.name || "Adjunto";
    el.mediaModalBody.innerHTML = "";

    if (isImage(item)) {
      const img = document.createElement("img");
      img.src = item.url || item.downloadUrl || item.webViewLink || "";
      img.alt = item.name || "Imagen";

      img.onerror = () => {
        el.mediaModalBody.innerHTML = `
          <div style="display:grid;gap:12px;text-align:center;">
            <p>No se pudo previsualizar la imagen.</p>
            <a class="primary-btn" href="${item.webViewLink || item.downloadUrl || "#"}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;text-decoration:none;">
              Abrir en Drive
            </a>
          </div>
        `;
      };

      el.mediaModalBody.appendChild(img);
    } else if (isVideo(item)) {
      const iframe = document.createElement("iframe");
      iframe.src = item.previewUrl || item.webViewLink || "";
      iframe.width = "100%";
      iframe.height = "600";
      iframe.allow = "autoplay";
      iframe.setAttribute("allowfullscreen", "true");
      el.mediaModalBody.appendChild(iframe);
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = item.previewUrl || item.webViewLink || item.downloadUrl || "";
      iframe.width = "100%";
      iframe.height = "600";
      iframe.allow = "autoplay";
      el.mediaModalBody.appendChild(iframe);
    }

    el.mediaModal.classList.add("show");
    el.mediaModal.setAttribute("aria-hidden", "false");
  }

  function closeMediaModal() {
    if (!el.mediaModal || !el.mediaModalBody) return;
    el.mediaModal.classList.remove("show");
    el.mediaModal.setAttribute("aria-hidden", "true");
    el.mediaModalBody.innerHTML = "";
  }

  async function init() {
    populateSucursales();
    bindEvents();
    await refreshAll();
    setTab("locales");
  }

  init();
})();
