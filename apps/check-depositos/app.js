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
    "Supervielle - Nexus Realty SA"
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
    editingId: ""
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

    loadDeposits();
    setInterval(loadDeposits, 60000);
  }

  async function loadDeposits() {
    if (state.loading) return;

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
        if (item.id !== deposit.id) return item;
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
      card.querySelector('[data-field="local"]').textContent = deposit.local || "-";
      card.querySelector('[data-field="id"]').textContent = deposit.id || "Sin ID";
      card.querySelector('[data-field="estado"]').textContent = status;
      card.querySelector('[data-field="estado"]').classList.add(isConfirmed ? "confirmed" : "pending");
      card.querySelector('[data-field="monto"]').textContent = formatAmount(deposit.monto);
      card.querySelector('[data-field="fecha"]').textContent = deposit.fecha || "-";
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
        const haystack = normalizeSearch([item.id, item.local, item.cuenta, item.observacion, item.monto].join(" "));
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
    const deposit = state.deposits.find((item) => item.id === button.dataset.id);
    if (!deposit) return;

    if (button.dataset.action === "confirm") confirmDeposit(deposit);
    if (button.dataset.action === "preview") showPreview(deposit);
    if (button.dataset.action === "edit") openEditModal(deposit);
  }

  function showPreview(deposit) {
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
    el.editDepositId.textContent = `${deposit.local || "-"} · ${deposit.id || "Sin ID"}`;
    el.editAmountInput.value = deposit.monto || "";
    el.editAccountSelect.value = deposit.cuenta || "";
    el.editStatus.textContent = "";
    el.editModal.hidden = false;
    el.editAmountInput.focus();
  }

  function closeEditModal() {
    state.editingId = "";
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

    const deposit = state.deposits.find((item) => item.id === state.editingId);
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
        if (item.id !== deposit.id) return item;
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

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      window.alert("El navegador bloqueo la pestaña del reporte.");
      return;
    }
    reportWindow.opener = null;

    const groups = groupByAccount(pending);
    const generatedAt = new Date().toLocaleString("es-AR");
    const totalAmount = pending.reduce((sum, item) => sum + parseAmount(item.monto), 0);
    const whatsappText = buildWhatsAppPendingText(groups, pending.length, totalAmount);

    reportWindow.document.open();
    reportWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Depositos pendientes por cuenta</title>
  <style>
    :root{color-scheme:dark;--bg:#090d12;--panel:#111821;--line:rgba(148,163,184,.22);--text:#edf3fa;--muted:#94a3b8;--primary:#22c7b8;--warn:#f59e0b}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
    .wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:28px 0 42px}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
    h1{margin:0;font-size:28px;line-height:1.1}
    p{margin:6px 0 0;color:var(--muted)}
    button{min-height:40px;border:1px solid var(--line);border-radius:6px;background:rgba(34,199,184,.12);color:var(--text);font-weight:750;padding:8px 12px;cursor:pointer}
    .actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
    .stat,.account{border:1px solid var(--line);border-radius:8px;background:var(--panel)}
    .stat{padding:13px}
    .stat span{display:block;color:var(--muted);font-size:12px;font-weight:750}
    .stat strong{display:block;margin-top:5px;font-size:23px}
    .account{margin-top:12px;overflow:hidden}
    .account-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);background:rgba(8,13,20,.42)}
    h2{margin:0;font-size:17px}
    .account-total{white-space:nowrap;color:var(--primary);font-weight:850}
    table{width:100%;border-collapse:collapse}
    th,td{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}
    th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    tr:last-child td{border-bottom:0}
    .amount{white-space:nowrap;font-weight:850}
    a{color:var(--primary);font-weight:800;text-decoration:none}
    .missing{color:var(--warn);font-weight:750}
    .message-box{width:100%;min-height:220px;margin:14px 0 4px;padding:12px;border:1px solid var(--line);border-radius:8px;background:rgba(8,13,20,.72);color:var(--text);font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;resize:vertical}
    .hint{font-size:12px}
    @media (max-width:760px){header{display:grid}.stats{grid-template-columns:1fr}table,thead,tbody,tr,th,td{display:block}thead{display:none}td{border-bottom:0;padding:8px 12px}tr{border-bottom:1px solid var(--line)}td::before{content:attr(data-label);display:block;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:2px}}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>Depositos pendientes por cuenta</h1>
        <p>Generado ${escapeHtml(generatedAt)}. Texto listo para WhatsApp con cuenta y montos.</p>
      </div>
      <div class="actions">
        <button id="copyBtn" type="button">Copiar texto</button>
        <button id="whatsappBtn" type="button">Abrir WhatsApp</button>
      </div>
    </header>
    <section class="stats">
      <div class="stat"><span>Pendientes</span><strong>${pending.length}</strong></div>
      <div class="stat"><span>Cuentas</span><strong>${groups.length}</strong></div>
      <div class="stat"><span>Total estimado</span><strong>${formatCurrency(totalAmount)}</strong></div>
    </section>
    <textarea id="whatsappText" class="message-box" readonly>${escapeHtml(whatsappText)}</textarea>
    <p class="hint">El texto incluye solo cuenta y montos.</p>
    ${groups.map(renderAccountReportGroup).join("")}
  </div>
  <script>
    const whatsappText = ${JSON.stringify(whatsappText)};
    document.getElementById("copyBtn").addEventListener("click", async () => {
      const box = document.getElementById("whatsappText");
      try {
        await navigator.clipboard.writeText(whatsappText);
        document.getElementById("copyBtn").textContent = "Copiado";
      } catch (_) {
        box.focus();
        box.select();
        document.execCommand("copy");
        document.getElementById("copyBtn").textContent = "Copiado";
      }
    });
    document.getElementById("whatsappBtn").addEventListener("click", () => {
      window.open("https://wa.me/?text=" + encodeURIComponent(whatsappText), "_blank", "noopener,noreferrer");
    });
  </script>
</body>
</html>`);
    reportWindow.document.close();
  }

  function groupByAccount(items) {
    const map = new Map();
    items.forEach((item) => {
      const account = item.cuenta || "Sin cuenta";
      if (!map.has(account)) map.set(account, []);
      map.get(account).push(item);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([account, deposits]) => ({
        account,
        deposits: deposits.sort(sortDeposits),
        total: deposits.reduce((sum, item) => sum + parseAmount(item.monto), 0)
      }));
  }

  function renderAccountReportGroup(group) {
    return `<section class="account">
      <div class="account-head">
        <h2>${escapeHtml(group.account)}</h2>
        <div class="account-total">${group.deposits.length} pendiente${group.deposits.length === 1 ? "" : "s"} - ${formatCurrency(group.total)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          ${group.deposits.map(renderReportRow).join("")}
        </tbody>
      </table>
    </section>`;
  }

  function renderReportRow(item) {
    return `<tr>
      <td data-label="Monto" class="amount">${escapeHtml(formatAmount(item.monto))}</td>
    </tr>`;
  }

  function buildWhatsAppPendingText(groups, totalCount, totalAmount) {
    const lines = [
      "*Depositos pendientes por cuenta*",
      `Pendientes: ${totalCount}`,
      `Total estimado: ${formatCurrency(totalAmount)}`,
      ""
    ];

    groups.forEach((group) => {
      lines.push(`*${group.account}*`);
      lines.push(`Total: ${formatCurrency(group.total)}`);

      group.deposits.forEach((item, index) => {
        lines.push(`${index + 1}. ${formatAmount(item.monto)}`);
      });

      lines.push("");
    });

    return lines.join("\n").trim();
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
      .map((item) => ({
        id: String(item.id || item.ID || item.codigo || "").trim(),
        fecha: String(item.fecha || item.Fecha || "").trim(),
        local: String(item.local || item.Local || "").trim().toUpperCase(),
        monto: String(item.monto || item.Monto || "").trim(),
        cuenta: String(item.cuenta || item.Cuenta || "").trim(),
        link: String(item.link || item.comprobante || item.Comprobante || "").trim(),
        observacion: String(item.observacion || item.obs || item.Observacion || "").trim(),
        estado: normalizeEstado(item.estado || item.Estado),
        rowNumber: item.rowNumber || item.fila || item.Fila || ""
      }))
      .filter((item) => item.id || item.fecha || item.local || item.monto)
      .filter((item) => {
        const key = item.id || `${item.local}|${item.fecha}|${item.monto}|${item.cuenta}`;
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
