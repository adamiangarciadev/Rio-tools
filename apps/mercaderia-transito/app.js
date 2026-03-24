;(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbyHeHtA935aruQE6YsBM0lTp51_TWdNqMkz1CEfQ9Cem_uKKse9xOeRdezzD65riCaq/exec";

  const LS_SUCURSAL = "mercaderia_transito_sucursal";

  const $ = (sel, root = document) => root.querySelector(sel);

  const el = {
    sucursalSelect: $("#sucursalSelect"),
    refreshBtn: $("#refreshBtn"),
    estadoCarga: $("#estadoCarga"),
    cardsWrap: $("#cardsWrap"),

    modalDif: $("#modalDif"),
    cerrarModalBtn: $("#cerrarModalBtn"),
    guardarDifBtn: $("#guardarDifBtn"),
    difRemito: $("#difRemito"),
    difObs: $("#difObs"),
    difFiles: $("#difFiles"),
    filesPreview: $("#filesPreview"),
  };

  const state = {
    sucursal: localStorage.getItem(LS_SUCURSAL) || "",
    remitos: [],
    remitoActivo: null,
  };

  init();

  async function init() {
    bindEvents();
    await cargarSucursales();
    await cargarRemitos();
  }

  function bindEvents() {
    el.sucursalSelect.addEventListener("change", async () => {
      state.sucursal = el.sucursalSelect.value;
      localStorage.setItem(LS_SUCURSAL, state.sucursal);
      await cargarRemitos();
    });

    el.refreshBtn.addEventListener("click", cargarRemitos);

    el.cerrarModalBtn.addEventListener("click", cerrarModal);
    el.modalDif.addEventListener("click", (e) => {
      if (e.target === el.modalDif) cerrarModal();
    });

    el.difFiles.addEventListener("change", renderFilesPreview);
    el.guardarDifBtn.addEventListener("click", guardarDiferencias);
  }

  async function cargarSucursales() {
    try {
      const res = await fetch(`${API_URL}?accion=sucursales`);
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Error al cargar sucursales");

      const sucursales = data.sucursales || [];

      el.sucursalSelect.innerHTML =
        `<option value="">Elegí sucursal</option>` +
        sucursales.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

      if (state.sucursal) {
        el.sucursalSelect.value = state.sucursal;
      } else if (sucursales.length) {
        state.sucursal = sucursales[0];
        el.sucursalSelect.value = state.sucursal;
        localStorage.setItem(LS_SUCURSAL, state.sucursal);
      }
    } catch (err) {
      el.estadoCarga.textContent = `Error cargando sucursales: ${err.message}`;
    }
  }

  async function cargarRemitos() {
    if (!state.sucursal) {
      el.cardsWrap.innerHTML = `<div class="empty">Seleccioná una sucursal.</div>`;
      return;
    }

    el.estadoCarga.textContent = `Cargando remitos de ${state.sucursal}...`;

    try {
      const res = await fetch(`${API_URL}?accion=listar&sucursal=${encodeURIComponent(state.sucursal)}`);
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "No se pudieron cargar los remitos");

      state.remitos = data.remitos || [];
      renderRemitos();

      el.estadoCarga.textContent = `Actualizado: ${new Date().toLocaleTimeString("es-AR")}`;
    } catch (err) {
      el.estadoCarga.textContent = `Error: ${err.message}`;
      el.cardsWrap.innerHTML = `<div class="empty">No se pudo cargar la información.</div>`;
    }
  }

  function renderRemitos() {
    if (!state.remitos.length) {
      el.cardsWrap.innerHTML = `<div class="empty">No hay remitos pendientes para esta sucursal.</div>`;
      return;
    }

    el.cardsWrap.innerHTML = state.remitos.map(r => {
      const estadoNorm = String(r.estado || "").trim().toUpperCase();

      let badgeClass = "pendiente";
      let badgeText = "PENDIENTE";

      if (estadoNorm === "RECIBIDO") {
        badgeClass = "recibido";
        badgeText = "RECIBIDO";
      } else if (estadoNorm === "DIFERENCIAS") {
        badgeClass = "diferencias";
        badgeText = "DIFERENCIAS";
      }

      let acciones = "";

      if (!estadoNorm) {
        acciones = `
          <button class="btn primary" data-action="recibido" data-remito="${escapeAttr(r.remito)}">
            RECIBIDO
          </button>
        `;
      } else if (estadoNorm === "RECIBIDO") {
        acciones = `
          <button class="btn ok" data-action="confirmar" data-remito="${escapeAttr(r.remito)}">
            CONFIRMADO OK
          </button>
          <button class="btn warn" data-action="diferencias" data-remito="${escapeAttr(r.remito)}">
            DIFERENCIAS
          </button>
        `;
      } else if (estadoNorm === "DIFERENCIAS") {
        acciones = `
          <button class="btn warn" data-action="diferencias" data-remito="${escapeAttr(r.remito)}">
            EDITAR DIFERENCIAS
          </button>
        `;
      }

      return `
        <article class="card">
          <div class="card-head">
            <div>
              <h3>Remito ${escapeHtml(r.remito)}</h3>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>

          <div class="meta">
            <div class="box">
              <span class="label">Fecha</span>
              <strong>${escapeHtml(r.fecha || "-")}</strong>
            </div>
            <div class="box">
              <span class="label">Desde</span>
              <strong>${escapeHtml(r.desde || "-")}</strong>
            </div>
            <div class="box">
              <span class="label">Hacia</span>
              <strong>${escapeHtml(r.hacia || "-")}</strong>
            </div>
            <div class="box">
              <span class="label">Total prendas</span>
              <strong>${escapeHtml(String(r.total_prendas || "-"))}</strong>
            </div>
          </div>

          ${r.observacion ? `
            <div class="obs-box">
              <strong>Observaciones:</strong>
              <div>${escapeHtml(r.observacion)}</div>
            </div>
          ` : ""}

          ${r.carpeta_url ? `
            <div class="link-box">
              <strong>Carpeta de diferencias:</strong>
              <div><a href="${escapeAttr(r.carpeta_url)}" target="_blank" rel="noopener noreferrer">Abrir carpeta</a></div>
            </div>
          ` : ""}

          <div class="actions">${acciones}</div>
        </article>
      `;
    }).join("");

    el.cardsWrap.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        const remito = btn.dataset.remito;

        if (action === "recibido") await marcarRecibido(remito);
        if (action === "confirmar") await confirmarOk(remito);
        if (action === "diferencias") abrirModal(remito);
      });
    });
  }

  async function marcarRecibido(remito) {
    try {
      el.estadoCarga.textContent = `Marcando remito ${remito} como recibido...`;

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "marcarRecibido",
          remito,
          sucursal: state.sucursal
        })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "No se pudo marcar recibido");

      await cargarRemitos();
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmarOk(remito) {
    if (!confirm(`¿Confirmar OK el remito ${remito}?`)) return;

    try {
      el.estadoCarga.textContent = `Confirmando remito ${remito}...`;

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "confirmarOk",
          remito,
          sucursal: state.sucursal
        })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "No se pudo confirmar");

      await cargarRemitos();
    } catch (err) {
      alert(err.message);
    }
  }

  function abrirModal(remito) {
    state.remitoActivo = remito;
    const actual = state.remitos.find(x => String(x.remito) === String(remito));

    el.difRemito.value = remito;
    el.difObs.value = actual?.observacion || "";
    el.difFiles.value = "";
    el.filesPreview.innerHTML = "";

    el.modalDif.classList.remove("hidden");
  }

  function cerrarModal() {
    el.modalDif.classList.add("hidden");
    state.remitoActivo = null;
    el.difFiles.value = "";
    el.filesPreview.innerHTML = "";
  }

  function renderFilesPreview() {
    const files = Array.from(el.difFiles.files || []);
    if (!files.length) {
      el.filesPreview.innerHTML = "";
      return;
    }

    el.filesPreview.innerHTML = files
      .map(f => `<div>${escapeHtml(f.name)} — ${(f.size / 1024 / 1024).toFixed(2)} MB</div>`)
      .join("");
  }

  async function guardarDiferencias() {
    if (!state.remitoActivo) return;

    try {
      el.guardarDifBtn.disabled = true;
      el.guardarDifBtn.textContent = "Guardando...";

      const archivos = await Promise.all(
        Array.from(el.difFiles.files || []).map(fileToBase64Object)
      );

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "guardarDiferencias",
          remito: state.remitoActivo,
          sucursal: state.sucursal,
          observacion: el.difObs.value.trim(),
          archivos
        })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "No se pudieron guardar las diferencias");

      cerrarModal();
      await cargarRemitos();
    } catch (err) {
      alert(err.message);
    } finally {
      el.guardarDifBtn.disabled = false;
      el.guardarDifBtn.textContent = "Guardar diferencias";
    }
  }

  function fileToBase64Object(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1] || "";

        resolve({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64
        });
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
})();