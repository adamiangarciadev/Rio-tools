(() => {
  "use strict";
  const API_URL = window.RioObjectivesSupervisionConfig?.apiUrl || "";
  const $ = id => document.getElementById(id);
  const model = window.RioObjectives;
  const demoMode = new URLSearchParams(location.search).get("demo") === "1";
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = date => dateFormat.format(new Date(date + "T12:00:00Z"));
  const signed = value => (value >= 0 ? "+" : "−") + money.format(Math.abs(value));
  const percent = value => value == null ? "—" : value.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
  const row = (label, value, className = "") => `<div class="value-row"><span>${label}</span><strong class="${className}">${value}</strong></div>`;
  let dashboard = null;
  const adminLink = document.querySelector('.module-actions a');
  adminLink.hidden = !window.RioContext?.canUse({ slug: "objetivos-ventas-sistemas", restricted: true });
  $("date").addEventListener("change", render);
  $("refresh").addEventListener("click", load);
  function totalRows(total) {
    return row("Vendido", total.count ? money.format(total.sold) : "—") + row("Objetivo · días informados", total.count ? money.format(total.target) : "—") + `<div class="delta-row">${row("Diferencia", total.count ? signed(total.difference) : "—", total.count ? total.difference >= 0 ? "positive" : "negative" : "")}</div>`;
  }
  function render() {
    if (!dashboard) return;
    const selected = $("date").value;
    if (!selected || selected < $("date").min || selected > $("date").max) return;
    $("cards").innerHTML = dashboard.stores.map(store => {
      const data = model.summarize(store, selected), total = data.month;
      const state = !total.count ? "Sin ventas informadas" : total.difference > 0 ? "↑ Por encima del objetivo" : total.difference < 0 ? "↓ Por debajo del objetivo" : "En objetivo";
      const stateClass = !total.count ? "" : total.difference >= 0 ? "positive" : "negative";
      const daily = data.week.map((day, i) => {
        const future = day.date > selected, hasSale = day.amount != null && !future;
        const status = day.outsideMonth ? "Otro mes" : day.dayType === "closed" ? "Cerrado" : future ? "Pendiente" : hasSale ? "Informado" : day.date === selected ? "Hoy · pendiente" : "Sin dato";
        const targetKnown = !day.outsideMonth && (hasSale || day.date >= dashboard.today || day.dayType === "closed");
        return `<div class="day-row ${day.date === selected ? "is-today" : ""}"><div class="day-heading"><strong>${weekdays[i]} ${formatDate(day.date)}</strong><small>${status}</small></div>${row("Vendido", hasSale ? money.format(day.amount) : "—")}${row("Objetivo", targetKnown ? money.format(day.target) : "—")}${row("Diferencia", hasSale ? signed(day.amount - day.target) : "—", hasSale ? day.amount >= day.target ? "positive" : "negative" : "")}</div>`;
      }).join("");
      const today = data.today;
      const targetKnown = today && (today.amount != null || selected >= dashboard.today || today.dayType === "closed");
      return `<article class="local-card"><div class="local-card-header"><h2>${escape(store.name)}</h2><span class="local-state ${stateClass}">${state}</span></div><div class="today-goal"><p class="eyebrow">Objetivo del día · ${formatDate(selected)}</p><strong>${targetKnown ? money.format(today.target) : "—"}</strong><small>${selected === dashboard.today ? "Meta para vender hoy" : "Meta de la fecha seleccionada"}</small></div><section class="local-section"><h3>Semana · lunes a sábado</h3><p class="section-period">${formatDate(data.week[0].date)} al ${formatDate(data.week[5].date)}</p>${daily}<div class="week-total"><h4>Acumulado de la semana</h4>${totalRows(data.weekTotal)}<p class="coverage-note">${data.weekTotal.count} días informados.</p></div></section><section class="local-section"><h3>Acumulado del mes</h3><p class="section-period">1 al ${formatDate(selected)}</p>${totalRows(total)}<div class="goal-track" role="img" aria-label="Cumplimiento a la fecha: ${percent(total.percent)}"><div class="goal-fill ${stateClass}" style="width:${Math.min(100, Math.max(0, total.percent || 0))}%"></div></div><div class="progress-label"><span>Cumplimiento a la fecha</span><strong>${percent(total.percent)}</strong></div><p class="coverage-note">${total.count} días informados${data.missing ? ` · ${data.missing} días anteriores sin dato` : ""}.</p><div class="month-total">Objetivo mensual <strong>${money.format(data.goal)}</strong><br>Avance del mes: ${percent(data.monthPercent)}</div></section></article>`;
    }).join("");
  }
  async function load() {
    if (!window.RioAccess?.isUnlocked()) { window.RioAccess?.requireSupervisionAccess(); return; }
    $("refresh").disabled = true;
    $("loadStatus").className = "load-status";
    $("loadStatus").textContent = "Cargando objetivos y ventas…";
    try {
      let response;
      if (demoMode) response = model.demo();
      else {
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL)) throw new Error("Falta configurar la URL del Apps Script exclusivo de Supervisión.");
        const credentials = window.RioAccess.administrationCredentials();
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credentials.adminPassword));
        const passwordHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        response = await api(passwordHash);
      }
      if (response.role !== "supervision" || !Array.isArray(response.stores) || !response.stores.every(store => Array.isArray(store.monthPlan))) throw new Error("La API de objetivos necesita actualizarse para habilitar el control de Supervisores.");
      dashboard = response;
      $("demoNotice").hidden = !demoMode;
      $("date").min = response.month + "-01";
      const [year, month] = response.month.split("-").map(Number);
      const end = response.month + "-" + new Date(year, month, 0).getDate();
      $("date").max = response.today < end ? response.today : end;
      if (!$("date").value || $("date").value < $("date").min || $("date").value > $("date").max) $("date").value = $("date").max;
      $("date").disabled = false;
      $("period").textContent = monthFormat.format(new Date(response.month + "-01T12:00:00Z"));
      $("updatedAt").textContent = response.updatedAt ? "Actualizado " + new Date(response.updatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : demoMode ? "Vista previa de diseño" : "Esperando la primera actualización";
      $("loadStatus").textContent = response.stores.length ? "" : "No hay locales configurados.";
      $("dataNote").hidden = false;
      render();
    } catch (error) {
      $("loadStatus").className = "load-status error";
      $("loadStatus").textContent = (dashboard ? "No se pudo actualizar. Se mantienen los últimos datos cargados. " : "") + (error.message || "No se pudieron cargar los datos.");
    } finally { $("refresh").disabled = false; }
  }
  function api(passwordHash) {
    return new Promise((resolve, reject) => {
      const callback = "rioObjectivesSupervision_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timer = setTimeout(() => finish(new Error("La API tardó demasiado en responder. Volvé a intentar.")), 30000);
      let finished = false;
      function finish(error, payload) {
        if (finished) return; finished = true;
        clearTimeout(timer); delete window[callback]; script.remove();
        if (error) reject(error);
        else if (!payload?.ok) reject(new Error(payload?.error || "Respuesta inválida de la API."));
        else resolve(payload.data);
      }
      window[callback] = payload => finish(null, payload);
      script.onerror = () => finish(new Error("No se pudo conectar con la API de objetivos."));
      script.src = API_URL + "?" + new URLSearchParams({ action: "supervisionDashboard", passwordHash, callback, _: String(Date.now()) });
      document.head.appendChild(script);
    });
  }
  load();
})();
