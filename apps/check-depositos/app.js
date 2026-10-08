;(() => {
  "use strict";

  const SCRIPT_URL = window.CHECK_DEPOSITOS_API_URL || "";
  const EDIT_SCRIPT_URL = window.CHECK_DEPOSITOS_EDIT_API_URL || SCRIPT_URL;
  const LOCALS = ["AV2", "NAZCA", "LAMARCA", "CORRIENTES", "CASTELLI", "QUILMES", "SARMIENTO", "PUEYRREDON", "WEB"];
  const ACCOUNTS = [
    "Santander - Lucia Catera",
    "BBVA Frances - Lucia Catera",
    "Galicia - 2021 Sociedad Anonima",
    "Galicia - Natalia Vanesa Scipioni",
    "Santander - Anlux SA",
    "Santander - 2021 Sociedad Anonima",
    "Santander - 1988 SRL",
    "Santander - Rio Group SRL",
    "Santander - Johanna Suets",
    "Santander - Infantino Fernando",
    "Galicia - 1988 SRL",
    "Supervielle - Nexus Realty SA",
    "Mercado Pago - Miguel Angel Raccio",
  ];

  const $ = (selector) => document.querySelector(selector);

  const el = {
    pendingFilesBtn: $("#pendingFilesBtn"),
    refreshBtn: $("#refreshBtn"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    accountFilter: $("#accountFilter"),
    localFilter: $("#localFilter"),
    searchInput: $("#searchInput"),
    pendingCount: $("#pendingCount"),
    confirmedCount: $("#confirmedCount"),
    accountsCount: $("#accountsCount"),
    visibleCount: $("#visibleCount"),
    accountGroups: $("#accountGroups"),
    depositList: $("#depositList"),
    previewTitle: $("#previewTitle"),
    previewEmpty: $("#previewEmpty"),
    previewFrame: $("#previewFrame"),
    previewModal: $("#previewModal"),
    closePreviewBtn: $("#closePreviewBtn"),
    editModal: $("#editModal"),
    editForm: $("#editForm"),
    editDepositId: $("#editDepositId"),
    editAmountInput: $("#editAmountInput"),
    editAccountSelect: $("#editAccountSelect"),
    editStatus: $("#editStatus"),
    editSaveBtn: $("#editSaveBtn"),
    listTitle: $("#listTitle"),
    statusText: $("#statusText"),
    sourceBadge: $("#sourceBadge"),
    template: $("#depositTemplate")
  };

  const state = {
    status: "PENDIENTE",
    deposits: [],
    source: "central",
    loading: false,
    editingId: "",
    editingRowNumber: "",
    deleting: false
  };

  init();

  function init() {
    fillSelect(el.accountFilter, ACCOUNTS);
    fillSelect(el.editAccountSelect, ACCOUNTS);
    fillSelect(el.localFilter, LOCALS);

    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.status = tab.dataset.status || "PENDIENTE";
        el.tabs.forEach((item) => item.classList.toggle("active", item === tab));
        render();
      });
    });

    el.refreshBtn.addEventListener("click", loadDeposits);
    el.pendingFilesBtn.addEventListener("click", openPendingLinksReport);
    el.accountFilter.addEventListener("change", render);
    el.localFilter.addEventListener("change", render);
    el.searchInput.addEventListener("input", render);
    el.accountGroups.addEventListener("click", onAccountGroupClick);
    el.depositList.addEventListener("click", onDepositAction);
    el.editForm.addEventListener("submit", saveDepositEdit);
    el.editModal.addEventListener("click", onEditModalClick);
    el.closePreviewBtn.addEventListener("click", () => el.previewModal.close());
    el.previewModal.addEventListener("click", (event) => {
      const bounds = el.previewModal.getBoundingClientRect();
      if (event.target === el.previewModal &&
          (event.clientX < bounds.left || event.clientX > bounds.right ||
           event.clientY < bounds.top || event.clientY > bounds.bottom)) {
        el.previewModal.close();
      }
    });
    el.previewModal.addEventListener("close", () => {
      el.previewFrame.removeAttribute("src");
      document.body.classList.remove("preview-open");
    });

    loadDeposits();
    setInterval(loadDeposits, 60000);
  }

  async function loadDeposits() {
    if (state.loading || state.deleting) return;

    try {
      state.loading = true;
      el.refreshBtn.disabled = true;
      el.statusText.textContent = "Actualizando depósitos...";
      el.sourceBadge.textContent = "Conectando";

      state.deposits = await fetchCentralDeposits();
      state.source = "central";

      render();
    } catch (error) {
      console.error(error);
      el.statusText.textContent = error.message || "No se pudieron cargar los depósitos.";
      el.sourceBadge.textContent = "Backend pendiente";
      el.depositList.innerHTML = `<div class="empty-state">Para ver todos los depósitos desde el primero hasta el último, el Apps Script publicado tiene que exponer la acción listar_depositos incluida en apps-script-admin.gs.</div>`;
      el.accountGroups.innerHTML = `<div class="empty-state">El histórico completo todavía no está disponible desde la API publicada.</div>`;
    } finally {
      state.loading = false;
      el.refreshBtn.disabled = false;
    }
  }

  async function fetchCentralDeposits() {
    if (!SCRIPT_URL || SCRIPT_URL.includes("PEGAR_URL")) {
      throw new Error("Falta configurar la URL publicada de la nueva API Check Depositos.");
    }

    const url = `${SCRIPT_URL}?accion=listar_depositos&scope=admin`;
    const data = await fetchJson(url);
    const items = Array.isArray(data.data) ? data.data : Array.isArray(data.depositos) ? data.depositos : [];
    if (!items.length && data.msg === "API depósitos activa") {
      throw new Error("El backend respondió que la API está activa, pero todavía no devuelve el histórico completo.");
    }
    return normalizeDeposits(items);
  }

  async function confirmDeposit(deposit) {
    const ok = window.confirm(`¿Confirmar el depósito ${deposit.id || ""} de ${deposit.local || "local"}?`);
    if (!ok) return;

    try {
      setCardBusy(deposit.id, true);
      const data = await fetchJson(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "confirmar_deposito",
          id: deposit.id,
          rowNumber: deposit.rowNumber || deposit.fila || "",
          estado: "CONFIRMADO"
        })
      });

      if (!data.ok || data.msg === "API depósitos activa") {
        throw new Error(data.error || "El Apps Script todavía no tiene activa la acción confirmar_deposito.");
      }

      state.deposits = state.deposits.map((item) => {
        if (item.id !== deposit.id || item.rowNumber !== deposit.rowNumber) return item;
        return { ...item, estado: "CONFIRMADO" };
      });
      render();
    } catch (error) {
      window.alert(error.message || "No se pudo confirmar el depósito.");
    } finally {
      setCardBusy(deposit.id, false);
    }
  }

  function render() {
    const pending = state.deposits.filter((item) => normalizeEstado(item.estado) !== "CONFIRMADO");
    const confirmed = state.deposits.filter((item) => normalizeEstado(item.estado) === "CONFIRMADO");
    const visible = getVisibleDeposits();

    el.pendingCount.textContent = String(pending.length);
    el.confirmedCount.textContent = String(confirmed.length);
    el.accountsCount.textContent = String(new Set(pending.map((item) => item.cuenta).filter(Boolean)).size);
    el.visibleCount.textContent = String(visible.length);

    el.listTitle.textContent = state.status === "CONFIRMADO" ? "Depósitos confirmados" : "Depósitos sin confirmar";
    el.statusText.textContent = buildStatusText(visible.length);
    el.sourceBadge.textContent = "Histórico completo";

    renderAccountGroups(pending);
    renderDeposits(visible);
  }

  function renderAccountGroups(items) {
    const counts = new Map();
    items.forEach((item) => {
      const account = item.cuenta || "Sin cuenta";
      counts.set(account, (counts.get(account) || 0) + 1);
    });

    const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (!rows.length) {
      el.accountGroups.innerHTML = `<div class="empty-state">No hay depósitos pendientes para agrupar.</div>`;
      return;
    }

    el.accountGroups.innerHTML = "";
    rows.forEach(([account, count]) => {
      const button = document.createElement("button");
      button.className = "account-row";
      button.type = "button";
      button.dataset.account = account === "Sin cuenta" ? "" : account;
      button.innerHTML = `
        <strong>${escapeHtml(account)}</strong>
        <span>${count} pendiente${count === 1 ? "" : "s"}</span>
      `;
      el.accountGroups.appendChild(button);
    });
  }

  function renderDeposits(items) {
    el.depositList.innerHTML = "";

    if (!items.length) {
      el.depositList.innerHTML = `<div class="empty-state">${state.status === "CONFIRMADO" ? "No hay depósitos confirmados para estos filtros." : "No hay depósitos pendientes para estos filtros."}</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((deposit) => {
      const card = el.template.content.firstElementChild.cloneNode(true);
      const status = normalizeEstado(deposit.estado);
      const isConfirmed = status === "CONFIRMADO";

      card.dataset.id = deposit.id || "";
      card.dataset.rowNumber = String(deposit.rowNumber || "");
      card.querySelector('[data-field="local"]').textContent = deposit.local || "-";
      card.querySelector('[data-field="id"]').textContent = deposit.id || "Sin ID";
      card.querySelector('[data-field="estado"]').textContent = status;
      card.querySelector('[data-field="estado"]').classList.add(isConfirmed ? "confirmed" : "pending");
      card.querySelector('[data-field="monto"]').textContent = formatAmount(deposit.monto);
      card.querySelector('[data-field="fecha"]').textContent = deposit.fecha || "-";
      card.querySelector('[data-field="dniCliente"]').textContent = deposit.dniCliente || "-";
      card.querySelector('[data-field="cuenta"]').textContent = deposit.cuenta || "-";
      card.querySelector('[data-field="observacion"]').textContent = deposit.observacion || "-";

      const link = card.querySelector('[data-action="preview"]');
      if (deposit.link) {
        link.dataset.id = deposit.id || "";
      } else {
        link.hidden = true;
      }

      const editBtn = card.querySelector('[data-action="edit"]');
      editBtn.dataset.id = deposit.id || "";

      const confirmBtn = card.querySelector('[data-action="confirm"]');
      confirmBtn.hidden = isConfirmed;
      confirmBtn.dataset.id = deposit.id || "";
      card.querySelector('[data-action="delete"]').disabled = !deposit.rowNumber || !deposit.id;

      fragment.appendChild(card);
    });

    el.depositList.appendChild(fragment);
  }

  function getVisibleDeposits() {
    const account = el.accountFilter.value;
    const local = el.localFilter.value;
    const query = normalizeSearch(el.searchInput.value);

    return state.deposits
      .filter((item) => normalizeEstado(item.estado) === state.status)
      .filter((item) => !account || item.cuenta === account)
      .filter((item) => !local || item.local === local)
      .filter((item) => {
        if (!query) return true;
        const haystack = normalizeSearch([item.id, item.dniCliente, item.local, item.cuenta, item.observacion, item.monto].join(" "));
        return haystack.includes(query);
      })
      .sort(sortDeposits);
  }

  function onAccountGroupClick(event) {
    const row = event.target.closest(".account-row");
    if (!row) return;
    el.accountFilter.value = row.dataset.account || "";
    render();
  }

  function onDepositAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (state.deleting) return;
    const card = button.closest(".deposit-card");
    const deposit = state.deposits.find((item) => item.id === card.dataset.id &&
      String(item.rowNumber || "") === card.dataset.rowNumber);
    if (!deposit) return;

    if (button.dataset.action === "confirm") confirmDeposit(deposit);
    if (button.dataset.action === "preview") showPreview(deposit);
    if (button.dataset.action === "edit") openEditModal(deposit);
    if (button.dataset.action === "delete") deleteDeposit(deposit);
  }

  async function deleteDeposit(deposit) {
    if (state.loading || state.deleting) return;
    const approved = window.confirm(`¿Eliminar esta carga?\n\n${deposit.local} · ${deposit.id}\n${deposit.fecha}\n${deposit.cuenta}\nMonto: ${formatAmount(deposit.monto)}\nEstado: ${deposit.estado}\n\nVerifica que sea la carga duplicada o incorrecta. Se quitara de los totales y quedara archivada en la planilla.`);
    if (!approved) return;
    try {
      state.deleting = true;
      el.depositList.querySelectorAll("button").forEach(button => { button.disabled = true; });
      const data = await fetchJson(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "eliminar_deposito",
          id: deposit.id,
          rowNumber: deposit.rowNumber,
          expected: {
            local: deposit.local, dniCliente: deposit.dniCliente,
            monto: deposit.monto, cuenta: deposit.cuenta, estado: deposit.estado
          }
        })
      });
      if (data.estado !== "ELIMINADO" || data.id !== deposit.id || Number(data.rowNumber) !== Number(deposit.rowNumber)) {
        throw new Error("La API no confirmo la eliminacion. Verifica que Apps Script tenga activa la accion eliminar_deposito.");
      }
      state.deposits = state.deposits.filter(item => item !== deposit);
      if (el.previewModal.open) el.previewModal.close();
      render();
      el.statusText.textContent = `Carga ${deposit.id} eliminada del listado.`;
    } catch (error) {
      render();
      window.alert(/accion no reconocida/i.test(error.message || "")
        ? "Falta actualizar Apps Script para activar la eliminacion de cargas. No se elimino el deposito."
        : error.message || "No se pudo eliminar la carga.");
    } finally {
      state.deleting = false;
    }
  }

  function showPreview(deposit) {
    if (!el.previewModal.open) el.previewModal.showModal();
    document.body.classList.add("preview-open");
    if (!deposit.link) {
      el.previewTitle.textContent = "Este depósito no tiene comprobante.";
      el.previewFrame.hidden = true;
      el.previewFrame.removeAttribute("src");
      el.previewEmpty.hidden = false;
      el.previewEmpty.textContent = "No hay comprobante disponible para este depósito.";
      return;
    }

    el.previewTitle.textContent = `${deposit.local || "-"} · ${deposit.id || "Sin ID"}`;
    el.previewEmpty.hidden = true;
    el.previewFrame.hidden = false;
    el.previewFrame.src = toDrivePreviewUrl(deposit.link);
  }

  function openEditModal(deposit) {
    state.editingId = deposit.id || "";
    state.editingRowNumber = deposit.rowNumber;
    el.editDepositId.textContent = `${deposit.local || "-"} · ${deposit.id || "Sin ID"}`;
    el.editAmountInput.value = deposit.monto || "";
    el.editAccountSelect.value = deposit.cuenta || "";
    el.editStatus.textContent = "";
    el.editModal.hidden = false;
    el.editAmountInput.focus();
  }

  function closeEditModal() {
    state.editingId = "";
    state.editingRowNumber = "";
    el.editModal.hidden = true;
    el.editStatus.textContent = "";
  }

  function onEditModalClick(event) {
    if (event.target.closest('[data-action="close-edit"]')) {
      closeEditModal();
    }
  }

  async function saveDepositEdit(event) {
    event.preventDefault();

    if (state.deleting) return;
    const deposit = state.deposits.find((item) => item.id === state.editingId && item.rowNumber === state.editingRowNumber);
    if (!deposit) {
      el.editStatus.textContent = "No se encontró el depósito.";
      return;
    }

    const monto = (el.editAmountInput.value || "").trim();
    const cuenta = (el.editAccountSelect.value || "").trim();

    if (!monto || !cuenta) {
      el.editStatus.textContent = "Completá monto y cuenta.";
      return;
    }

    try {
      el.editSaveBtn.disabled = true;
      el.editStatus.textContent = "Guardando...";

      const data = await fetchJson(EDIT_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "actualizar_deposito",
          id: deposit.id,
          rowNumber: deposit.rowNumber || deposit.fila || "",
          monto,
          cuenta
        })
      });

      state.deposits = state.deposits.map((item) => {
        if (item.id !== deposit.id || item.rowNumber !== deposit.rowNumber) return item;
        return {
          ...item,
          monto: data.monto || monto,
          cuenta: data.cuenta || cuenta
        };
      });

      closeEditModal();
      render();
    } catch (error) {
      el.editStatus.textContent = error.message || "No se pudo guardar.";
    } finally {
      el.editSaveBtn.disabled = false;
    }
  }

  function openPendingLinksReport() {
    const pending = state.deposits
      .filter((item) => normalizeEstado(item.estado) !== "CONFIRMADO")
      .sort(sortByAccountThenDate);

    if (!pending.length) {
      window.alert("No hay depositos pendientes para mostrar.");
      return;
    }

    window.RioDepositReport.open(pending.map(item => ({
      date: item.fecha.split(/[T ]/)[0],
      account: item.cuenta || "Sin cuenta",
      amount: parseAmount(item.monto)
    })));
  }

  function fillSelect(select, options) {
    options.forEach((option) => {
      const node = document.createElement("option");
      node.value = option;
      node.textContent = option;
      select.appendChild(node);
    });
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "La respuesta del servidor no es JSON válido.");
    }
    if (!data.ok) throw new Error(data.error || "La API devolvió un error.");
    return data;
  }

  function normalizeDeposits(items) {
    const seen = new Set();

    return items
      .filter(item => String(item.estado || item.Estado || "").trim().toUpperCase() !== "ELIMINADO")
      .map((item) => ({
        id: String(item.id || item.ID || item.codigo || "").trim(),
        fecha: String(item.fecha || item.Fecha || "").trim(),
        local: String(item.local || item.Local || "").trim().toUpperCase(),
        dniCliente: String(item.dniCliente || item.dni || item["DNI CLIENTE"] || item.DNI || "").trim(),
        monto: String(item.monto || item.Monto || "").trim(),
        cuenta: String(item.cuenta || item.Cuenta || "").trim(),
        link: String(item.link || item.comprobante || item.Comprobante || "").trim(),
        observacion: String(item.observacion || item.obs || item.Observacion || "").trim(),
        estado: normalizeEstado(item.estado || item.Estado),
        rowNumber: item.rowNumber || item.fila || item.Fila || ""
      }))
      .filter((item) => item.id || item.fecha || item.local || item.monto)
      .filter((item) => {
        const key = item.id && item.rowNumber ? `${item.id}|${item.rowNumber}` : item.id || `${item.local}|${item.fecha}|${item.monto}|${item.cuenta}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normalizeEstado(value) {
    const status = String(value || "").trim().toUpperCase();
    return status === "CONFIRMADO" ? "CONFIRMADO" : "PENDIENTE";
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function sortDeposits(a, b) {
    const aTime = parseDate(a.fecha);
    const bTime = parseDate(b.fecha);
    return bTime - aTime;
  }

  function sortByAccountThenDate(a, b) {
    const accountCompare = String(a.cuenta || "").localeCompare(String(b.cuenta || ""), "es");
    if (accountCompare !== 0) return accountCompare;
    return sortDeposits(a, b);
  }

  function parseDate(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return 0;
    const [, dd, mm, yyyy, hh = "00", min = "00", ss = "00"] = match;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)).getTime();
  }

  function formatAmount(value) {
    const text = String(value || "").trim();
    if (!text) return "$ 0";
    return text.startsWith("$") ? text : `$ ${text}`;
  }

  function parseAmount(value) {
    const text = String(value || "")
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2
    }).format(value || 0);
  }

  function toDrivePreviewUrl(url) {
    const text = String(url || "").trim();
    const fileMatch = text.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/file/d/${encodeURIComponent(fileMatch[1])}/preview`;
    }

    const idMatch = text.match(/[?&]id=([^&]+)/);
    if (idMatch) {
      return `https://drive.google.com/file/d/${encodeURIComponent(idMatch[1])}/preview`;
    }

    return text;
  }

  function buildStatusText(count) {
    const suffix = count === 1 ? "depósito visible" : "depósitos visibles";
    return `${count} ${suffix}, ordenados desde la fecha más reciente a la más antigua.`;
  }

  function setCardBusy(id, busy) {
    const card = el.depositList.querySelector(`[data-id="${CSS.escape(id || "")}"]`);
    const button = card?.querySelector('[data-action="confirm"]');
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? "Confirmando..." : "Confirmar";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
