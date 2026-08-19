import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";

const supabase = createClient(
  "https://hczekjyagyoxdqkzdimd.supabase.co",
  "sb_publishable_Fc6lL-Zdb_pBqcob_cvgzQ_NOnnpxII"
);
const $ = (selector) => document.querySelector(selector);
const state = { remitos: [], filtered: [], selected: null, movements: [], selectedIds: new Set() };
const el = {
  search: $("#searchInput"), branch: $("#branchFilter"), status: $("#statusFilter"),
  refresh: $("#refreshBtn"), load: $("#loadStatus"), list: $("#remitoList"),
  count: $("#resultCount"), total: $("#totalRemitos"), movements: $("#totalMovimientos"),
  latest: $("#ultimoMovimiento"), empty: $("#emptyDetail"), content: $("#detailContent"),
  detailRemito: $("#detailRemito"), detailStatus: $("#detailStatus"), facts: $("#detailFacts"),
  timeline: $("#timeline"), export: $("#exportBtn"), confirmOk: $("#confirmOkBtn"),
  selectVisible: $("#selectVisibleBtn"), clearSelection: $("#clearSelectionBtn"), bulkConfirm: $("#bulkConfirmBtn")
};

el.refresh.addEventListener("click", loadAll);
[el.search, el.branch, el.status].forEach(node => node.addEventListener(node.tagName === "INPUT" ? "input" : "change", applyFilters));
el.list.addEventListener("click", event => {
  const checkbox = event.target.closest("[data-select-id]");
  if (checkbox) {
    toggleSelection(checkbox.dataset.selectId, checkbox.checked);
    return;
  }
  const button = event.target.closest("[data-remito]");
  if (button) selectRemito(button.dataset.remito);
});
el.export.addEventListener("click", exportCsv);
el.confirmOk.addEventListener("click", confirmSelectedOk);
el.selectVisible.addEventListener("click", selectVisible);
el.clearSelection.addEventListener("click", clearSelection);
el.bulkConfirm.addEventListener("click", confirmBulkOk);

loadAll();
setInterval(loadAll, 60_000);

async function loadAll() {
  el.load.textContent = "Actualizando…";
  const [remitosResult, movementsResult] = await Promise.all([
    supabase.from("transito_v2_remitos").select("id,remito,fecha,desde,hacia,total_prendas,estado,observacion,tipo_cierre,created_at,updated_at").order("updated_at", { ascending: false }),
    supabase.from("transito_v2_movimientos").select("id,fecha", { count: "exact" }).order("fecha", { ascending: false }).limit(1)
  ]);
  if (remitosResult.error || movementsResult.error) {
    el.load.textContent = `Error: ${(remitosResult.error || movementsResult.error).message}`;
    return;
  }
  state.remitos = remitosResult.data || [];
  const availableIds = new Set(state.remitos.filter(row => !isClosed(row)).map(row => String(row.id)));
  state.selectedIds = new Set([...state.selectedIds].filter(id => availableIds.has(id)));
  el.total.textContent = state.remitos.length.toLocaleString("es-AR");
  el.movements.textContent = (movementsResult.count || 0).toLocaleString("es-AR");
  el.latest.textContent = movementsResult.data?.[0] ? formatDateTime(movementsResult.data[0].fecha) : "Sin movimientos";
  fillFilters();
  applyFilters();
  el.load.textContent = "Actualizado";
  if (state.selected) await selectRemito(state.selected.remito, false);
}

function fillFilters() {
  preserveOptions(el.branch, [...new Set(state.remitos.flatMap(row => [row.desde, row.hacia]).filter(Boolean))].sort());
  preserveOptions(el.status, [...new Set(state.remitos.map(row => row.estado).filter(Boolean))].sort());
}

function preserveOptions(select, values) {
  const current = select.value;
  const first = select.id === "branchFilter" ? "Todas" : "Todos";
  select.innerHTML = `<option value="">${first}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (values.includes(current)) select.value = current;
}

function applyFilters() {
  const term = normalize(el.search.value);
  state.filtered = state.remitos.filter(row => {
    const matchesTerm = !term || normalize(`${row.remito} ${row.desde} ${row.hacia} ${row.estado}`).includes(term);
    const matchesBranch = !el.branch.value || row.desde === el.branch.value || row.hacia === el.branch.value;
    const matchesStatus = !el.status.value || row.estado === el.status.value;
    return matchesTerm && matchesBranch && matchesStatus;
  });
  renderList();
}

function renderList() {
  el.count.textContent = `${state.filtered.length} resultados`;
  if (!state.filtered.length) {
    el.list.innerHTML = '<div class="empty-list">No hay remitos con esos filtros.</div>';
    updateBulkActions();
    return;
  }
  el.list.innerHTML = state.filtered.map(row => `
    <div class="remito-row ${state.selectedIds.has(String(row.id)) ? "checked" : ""}">
      <label class="selection-box" title="${isClosed(row) ? "El remito ya está cerrado" : "Seleccionar remito"}">
        <input type="checkbox" data-select-id="${row.id}" ${state.selectedIds.has(String(row.id)) ? "checked" : ""} ${isClosed(row) ? "disabled" : ""} aria-label="Seleccionar remito ${escapeHtml(row.remito)}" />
      </label>
      <button class="remito-card ${state.selected?.remito === row.remito ? "active" : ""}" data-remito="${escapeHtml(row.remito)}">
        <strong>${escapeHtml(row.remito)}</strong>
        <small>${escapeHtml(row.desde || "—")} → ${escapeHtml(row.hacia || "—")} · ${formatDate(row.fecha)}</small>
        <span class="mini-status">${escapeHtml(row.estado || "SIN ESTADO")}</span>
      </button>
    </div>`).join("");
  updateBulkActions();
}

function isClosed(row) {
  return ["CONFIRMADO OK", "CANCELADO", "CANCELADO/RECHAZADO", "FACTURA"].includes(normalize(row?.estado));
}

function toggleSelection(id, checked) {
  if (checked) state.selectedIds.add(String(id));
  else state.selectedIds.delete(String(id));
  renderList();
}

function selectVisible() {
  state.filtered.filter(row => !isClosed(row)).forEach(row => state.selectedIds.add(String(row.id)));
  renderList();
}

function clearSelection() {
  state.selectedIds.clear();
  renderList();
}

function updateBulkActions() {
  const count = state.selectedIds.size;
  const selectableVisible = state.filtered.filter(row => !isClosed(row));
  el.bulkConfirm.disabled = count === 0;
  el.bulkConfirm.textContent = `CONFIRMAR SELECCIONADOS (${count})`;
  el.clearSelection.hidden = count === 0;
  el.selectVisible.disabled = selectableVisible.length === 0 || selectableVisible.every(row => state.selectedIds.has(String(row.id)));
}

async function selectRemito(remito, showLoading = true) {
  const selected = state.remitos.find(row => row.remito === remito);
  if (!selected) return;
  state.selected = selected;
  renderList();
  el.empty.hidden = true;
  el.content.hidden = false;
  el.detailRemito.textContent = selected.remito;
  el.detailStatus.textContent = selected.estado || "SIN ESTADO";
  updateConfirmButton(selected);
  el.facts.innerHTML = [
    ["Fecha del remito", formatDate(selected.fecha)], ["Origen", selected.desde || "—"],
    ["Destino", selected.hacia || "—"], ["Prendas", selected.total_prendas ?? "—"],
    ["Última actualización", formatDateTime(selected.updated_at)]
  ].map(([label, value]) => `<div class="fact"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
  if (showLoading) el.timeline.innerHTML = '<li class="empty-list">Cargando historial…</li>';
  const { data, error } = await supabase.from("transito_v2_movimientos").select("*").eq("remito", remito).order("fecha", { ascending: false }).limit(250);
  if (error) {
    el.timeline.innerHTML = `<li class="empty-list">Error: ${escapeHtml(error.message)}</li>`;
    return;
  }
  state.movements = data || [];
  renderTimeline();
}

function updateConfirmButton(row) {
  el.confirmOk.hidden = isClosed(row);
  el.confirmOk.disabled = false;
  el.confirmOk.textContent = "DAR OK AL REMITO";
}

async function confirmBulkOk() {
  const rows = state.remitos.filter(row => state.selectedIds.has(String(row.id)) && !isClosed(row));
  if (!rows.length || el.bulkConfirm.disabled) return;

  const code = prompt(`CONFIRMACIÓN MASIVA · ${rows.length} remitos\n\nIngresá el código de personal:`)?.trim();
  if (!code) return;
  if (!confirm(`¿Confirmás como OK los ${rows.length} remitos seleccionados?\n\nEsta acción quedará registrada individualmente en cada remito.`)) return;

  const ids = rows.map(row => row.id);
  el.bulkConfirm.disabled = true;
  el.bulkConfirm.textContent = `CONFIRMANDO ${rows.length}…`;
  el.load.textContent = `Confirmando ${rows.length} remitos…`;

  const { data, error } = await supabase
    .from("transito_v2_remitos")
    .update({ estado: "CONFIRMADO OK", cod_cierre: code, tipo_cierre: "CONFIRMADO OK", updated_at: new Date().toISOString() })
    .in("id", ids)
    .select("id,remito,fecha,desde,hacia,total_prendas,estado,observacion,tipo_cierre,created_at,updated_at");

  if (error) {
    el.load.textContent = `Error: ${error.message}`;
    updateBulkActions();
    alert(`No se pudo realizar la confirmación masiva: ${error.message}`);
    return;
  }

  const updatedById = new Map((data || []).map(row => [String(row.id), row]));
  state.remitos = state.remitos.map(row => updatedById.get(String(row.id)) || row);
  state.selectedIds.clear();
  if (state.selected && updatedById.has(String(state.selected.id))) state.selected = updatedById.get(String(state.selected.id));
  fillFilters();
  applyFilters();
  if (state.selected) await selectRemito(state.selected.remito, false);
  el.load.textContent = `${(data || []).length} remitos confirmados OK`;
}

async function confirmSelectedOk() {
  const row = state.selected;
  if (!row || el.confirmOk.disabled) return;

  const code = prompt(`CONFIRMADO OK · Remito ${row.remito}\n\nIngresá el código de personal:`)?.trim();
  if (!code) return;
  if (!confirm(`¿Confirmás que el remito ${row.remito} está OK?`)) return;

  el.confirmOk.disabled = true;
  el.confirmOk.textContent = "GUARDANDO…";
  el.load.textContent = `Confirmando ${row.remito}…`;

  const patch = {
    estado: "CONFIRMADO OK",
    cod_cierre: code,
    tipo_cierre: "CONFIRMADO OK",
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from("transito_v2_remitos")
    .update(patch)
    .eq("id", row.id)
    .select("id,remito,fecha,desde,hacia,total_prendas,estado,observacion,tipo_cierre,created_at,updated_at")
    .single();

  if (error) {
    el.confirmOk.disabled = false;
    el.confirmOk.textContent = "DAR OK AL REMITO";
    el.load.textContent = `Error: ${error.message}`;
    alert(`No se pudo confirmar el remito: ${error.message}`);
    return;
  }

  state.remitos = state.remitos.map(item => item.id === data.id ? data : item);
  state.selected = data;
  fillFilters();
  applyFilters();
  await selectRemito(data.remito, false);
  el.load.textContent = `Remito ${data.remito} confirmado OK`;
}

function renderTimeline() {
  if (!state.movements.length) {
    el.timeline.innerHTML = '<li class="empty-list">Todavía no hay movimientos registrados.</li>';
    return;
  }
  el.timeline.innerHTML = state.movements.map(item => {
    const change = item.estado_anterior && item.estado_anterior !== item.estado_nuevo
      ? `${item.estado_anterior} → ${item.estado_nuevo}`
      : item.estado_nuevo || "Actualización del remito";
    const meta = [item.codigo_personal && `Código: ${item.codigo_personal}`, item.origen && `Origen: ${originLabel(item.origen)}`, item.sucursal && `Sucursal: ${item.sucursal}`].filter(Boolean);
    return `<li class="event"><div class="event-top"><span class="event-title">${actionLabel(item.accion)}</span><time class="event-time">${formatDateTime(item.fecha)}</time></div><div class="event-change">${escapeHtml(change)}</div>${item.observacion_nueva ? `<div class="event-change">Observación: ${escapeHtml(item.observacion_nueva)}</div>` : ""}<div class="event-meta">${meta.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div></li>`;
  }).join("");
}

function exportCsv() {
  if (!state.selected || !state.movements.length) return;
  const headers = ["Fecha", "Remito", "Acción", "Estado anterior", "Estado nuevo", "Código", "Origen", "Sucursal", "Observación"];
  const rows = state.movements.map(item => [item.fecha, item.remito, actionLabel(item.accion), item.estado_anterior, item.estado_nuevo, item.codigo_personal, originLabel(item.origen), item.sucursal, item.observacion_nueva]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `historial-${state.selected.remito}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function actionLabel(value) { return ({ ALTA: "Alta del remito", CAMBIO_ESTADO: "Cambio de estado", OBSERVACION: "Cambio de observación", ACTUALIZACION: "Actualización", ESTADO_INICIAL: "Estado al iniciar la auditoría" })[value] || value || "Movimiento"; }
function originLabel(value) { return ({ app_v2: "Mercadería V.2", sincronizacion: "Sincronización", importacion_inicial: "Carga inicial", base_de_datos: "Base de datos" })[value] || value || "—"; }
function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim(); }
function formatDate(value) { if (!value) return "—"; return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function formatDateTime(value) { if (!value) return "—"; return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value)); }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
