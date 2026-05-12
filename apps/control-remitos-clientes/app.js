;(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbxdlxNJmR3vF1YyuyDyRB1xU6effURNcPHu40jJzft6N-HCAGN1WrLEsFZnZoLmGPiU/exec";

  const LS_SUCURSAL = "rio_remitos_sucursal";
  const EXCLUDED_CLIENTS = new Set([
    "DEPOSITO",
    "AV2",
    "AV1",
    "QUILMES",
    "CASTELLI",
    "CORRIENTES",
    "LAMARCA",
    "PUEY",
    "SARMIENTO"
  ]);

  const el = {
    sucursalSelect: document.getElementById("sucursalSelect"),
    searchInput: document.getElementById("searchInput"),
    btnReload: document.getElementById("btnReload"),
    btnClearSucursal: document.getElementById("btnClearSucursal"),
    tableBody: document.getElementById("tableBody"),
    statusMsg: document.getElementById("statusMsg"),
    totalVisible: document.getElementById("totalVisible"),
    currentSucursal: document.getElementById("currentSucursal"),
    lastUpdate: document.getElementById("lastUpdate")
  };

  const state = {
    allItems: [],
    filteredItems: [],
    sucursal: "",
    query: ""
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await loadSucursales();

    const savedSucursal = localStorage.getItem(LS_SUCURSAL) || "";
    if (savedSucursal) {
      el.sucursalSelect.value = savedSucursal;
      state.sucursal = savedSucursal;
      updateSucursalInfo();
      await loadRemitos();
    } else {
      renderEmpty("Seleccioná una sucursal para ver los remitos.");
    }
  }

  function bindEvents() {
    el.sucursalSelect.addEventListener("change", async () => {
      state.sucursal = (el.sucursalSelect.value || "").trim().toUpperCase();
      if (!state.sucursal) {
        localStorage.removeItem(LS_SUCURSAL);
        state.allItems = [];
        state.filteredItems = [];
        updateSucursalInfo();
        renderEmpty("Seleccioná una sucursal para ver los remitos.");
        return;
      }

      localStorage.setItem(LS_SUCURSAL, state.sucursal);
      updateSucursalInfo();
      await loadRemitos();
    });

    el.searchInput.addEventListener("input", () => {
      state.query = (el.searchInput.value || "").trim().toLowerCase();
      applyFilters();
    });

    el.btnReload.addEventListener("click", async () => {
      if (!state.sucursal) return;
      await loadRemitos();
    });

    el.btnClearSucursal.addEventListener("click", () => {
      localStorage.removeItem(LS_SUCURSAL);
      el.sucursalSelect.value = "";
      state.sucursal = "";
      state.allItems = [];
      state.filteredItems = [];
      updateSucursalInfo();
      renderEmpty("Sucursal borrada. Elegí una nueva sucursal.");
    });
  }

  async function loadSucursales() {
    try {
      setStatus("Cargando sucursales...");
      const res = await fetch(`${API_URL}?accion=sucursales`);
      const data = await res.json();

      if (!data.ok) {
        setStatus("Error al cargar sucursales.");
        return;
      }

      const sucursales = data.sucursales || [];
      el.sucursalSelect.innerHTML = `<option value="">Seleccionar sucursal</option>` +
        sucursales.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

      setStatus("Sucursales cargadas.");
    } catch (err) {
      console.error(err);
      setStatus("No se pudieron cargar las sucursales.");
    }
  }

  async function loadRemitos() {
    if (!state.sucursal) return;

    try {
      setStatus(`Cargando remitos de ${state.sucursal}...`);
      renderEmpty("Cargando...");

      const url = `${API_URL}?accion=listar&sucursal=${encodeURIComponent(state.sucursal)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.ok) {
        setStatus(data.error || "Error al cargar remitos.");
        renderEmpty("No se pudieron cargar los remitos.");
        return;
      }

      state.allItems = Array.isArray(data.items) ? data.items : [];
      applyFilters();
      setStatus(`Remitos cargados para ${state.sucursal}.`);
      el.lastUpdate.textContent = new Date().toLocaleTimeString("es-AR");
    } catch (err) {
      console.error(err);
      setStatus("Error de red al cargar remitos.");
      renderEmpty("Error de red.");
    }
  }

  function applyFilters() {
    const q = state.query;

    state.filteredItems = state.allItems.filter(item => {
      const cliente = normalize(item.cliente);
      const estado = normalize(item.estado_web);

      if (EXCLUDED_CLIENTS.has(cliente)) return false;
      if (estado === "FACTURA" || estado === "CANCELADO") return false;

      if (!q) return true;

      const bucket = [
        item.fecha,
        item.remito,
        item.desde,
        item.cliente,
        item.vendedor,
        item.total_prendas
      ].join(" ").toLowerCase();

      return bucket.includes(q);
    });

    renderTable();
    el.totalVisible.textContent = String(state.filteredItems.length);
  }

  function renderTable() {
    if (!state.filteredItems.length) {
      renderEmpty("No hay remitos visibles para esta sucursal.");
      return;
    }

    el.tableBody.innerHTML = state.filteredItems.map(item => {
      const estado = normalize(item.estado_web);
      const badge = getBadge(estado);

      return `
        <tr>
          <td>${escapeHtml(item.fecha || "")}</td>
          <td>${escapeHtml(item.remito || "")}</td>
          <td>${escapeHtml(item.desde || "")}</td>
          <td>${escapeHtml(item.cliente || "")}</td>
          <td>${escapeHtml(item.vendedor || "")}</td>
          <td>${escapeHtml(item.total_prendas || "")}</td>
          <td>${badge}</td>
          <td class="actions-cell">
            <div class="row-actions">
              <button class="btn small warn" data-remito="${escapeAttr(item.remito)}" data-estado="FACTURA">Afectar a FACTURA</button>
              <button class="btn small danger" data-remito="${escapeAttr(item.remito)}" data-estado="CANCELADO">Afectar a CANCELADO</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    bindRowActions();
  }

  function bindRowActions() {
    el.tableBody.querySelectorAll("button[data-remito]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const remito = btn.getAttribute("data-remito");
        const estado = btn.getAttribute("data-estado");

        const ok = confirm(`¿Querés marcar el remito ${remito} como ${estado}?`);
        if (!ok) return;

        await afectarRemito(remito, estado);
      });
    });
  }

  async function afectarRemito(remito, estado) {
    try {
      setStatus(`Actualizando remito ${remito}...`);

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "afectar_remito",
          remito: remito,
          sucursal: state.sucursal,
          estado: estado
        })
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "No se pudo actualizar el remito.");
        setStatus("Error al actualizar el remito.");
        return;
      }

      state.allItems = state.allItems.map(item => {
        if (String(item.remito) === String(remito) && normalize(item.desde) === normalize(state.sucursal)) {
          return { ...item, estado_web: estado };
        }
        return item;
      });

      applyFilters();
      setStatus(`Remito ${remito} afectado como ${estado}.`);
    } catch (err) {
      console.error(err);
      alert("Error de red al actualizar.");
      setStatus("Error de red al actualizar.");
    }
  }

  function renderEmpty(message) {
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="8">${escapeHtml(message)}</td>
      </tr>
    `;
    el.totalVisible.textContent = "0";
  }

  function updateSucursalInfo() {
    el.currentSucursal.textContent = state.sucursal || "-";
  }

  function setStatus(text) {
    el.statusMsg.textContent = text;
  }

  function getBadge(estado) {
    if (estado === "FACTURA") {
      return `<span class="badge factura">FACTURA</span>`;
    }
    if (estado === "CANCELADO") {
      return `<span class="badge cancelado">CANCELADO</span>`;
    }
    return `<span class="badge pending">PENDIENTE</span>`;
  }

  function normalize(v) {
    return String(v || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(v) {
    return escapeHtml(v);
  }
})();
