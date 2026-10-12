(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbylSdpa7qTV9FMa7roN5U9iIPIT9IC7AMSmP0JJYDFFYihxuwld8xZ2JOyhz_3-yDF9/exec";
  const SESSION_KEY = "rio_objetivos_admin_token";
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  let token = sessionStorage.getItem(SESSION_KEY) || "";
  let dashboard = null;

  $("salesDate").addEventListener("change", renderSales);
  $("salesForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const sales = {};
    document.querySelectorAll("[data-sale-id]").forEach((input) => {
      if (input.value.trim() !== "") sales[input.dataset.saleId] = Number(input.value);
    });
    $("salesMessage").textContent = "";
    $("salesMessage").style.color = "var(--rio-danger)";
    if (!Object.keys(sales).length) { $("salesMessage").textContent = "Ingresá al menos una venta."; return; }
    setBusy($("saveSalesButton"), true, "Guardando…", "Guardar ventas del día");
    try {
      const data = await api("updateSales", { token, date: $("salesDate").value, sales: JSON.stringify(sales) });
      if (!data || data.role !== "admin" || !Array.isArray(data.stores)) throw new Error("La API necesita actualizarse para permitir la carga manual.");
      render(data);
      $("salesMessage").style.color = "var(--rio-ok)";
      $("salesMessage").textContent = "Ventas guardadas. El acumulado de cada local ya está actualizado.";
    } catch (error) {
      $("salesMessage").textContent = error.message || "No se pudieron guardar las ventas.";
    } finally {
      setBusy($("saveSalesButton"), false, "Guardando…", "Guardar ventas del día");
    }
  });

  function renderSales() {
    if (!dashboard) return;
    $("salesMessage").textContent = "";
    const supported = dashboard.stores.every((store) => Array.isArray(store.sales));
    $("saveSalesButton").disabled = !supported;
    if (!supported) $("salesMessage").textContent = "La carga manual estará disponible cuando se actualice la API de ventas.";
    $("salesStores").innerHTML = dashboard.stores.map((store) => {
      const sale = (store.sales || []).find((item) => item.date === $("salesDate").value);
      return `<tr><td><label for="sale-${store.id}">${store.name}${sale ? " · cargado" : " · sin dato"}</label></td><td><input id="sale-${store.id}" class="goal-input" data-sale-id="${store.id}" type="number" min="0" max="9999999999" step="0.01" placeholder="Sin cambios" value="${sale ? sale.amount : ""}"></td></tr>`;
    }).join("");
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy($("loginButton"), true, "Ingresando…", "Ingresar");
    $("loginError").textContent = "";
    try {
      const response = await api("login", { email: $("email").value.trim(), passwordHash: await sha256($("password").value) });
      if (response.role !== "admin") throw new Error("Esta cuenta no tiene permisos de Sistemas.");
      token = response.token;
      sessionStorage.setItem(SESSION_KEY, token);
      render(response.dashboard);
    } catch (error) {
      $("loginError").textContent = error.message || "No se pudo ingresar.";
    } finally {
      setBusy($("loginButton"), false, "Ingresando…", "Ingresar");
    }
  });

  $("saveButton").addEventListener("click", async () => {
    const goals = {};
    document.querySelectorAll("[data-goal-id]").forEach((input) => { goals[input.dataset.goalId] = Number(input.value); });
    $("message").textContent = "";
    setBusy($("saveButton"), true, "Guardando…", "Guardar objetivos");
    try {
      render(await api("updateGoals", { token, goals: JSON.stringify(goals) }));
      $("message").textContent = "Objetivos guardados. Los locales ya verán el nuevo cálculo.";
    } catch (error) {
      $("message").textContent = error.message || "No se pudieron guardar los objetivos.";
      $("message").style.color = "var(--rio-danger)";
    } finally {
      setBusy($("saveButton"), false, "Guardando…", "Guardar objetivos");
    }
  });

  $("logoutButton").addEventListener("click", () => {
    if (token) api("logout", { token }).catch(() => {});
    token = ""; dashboard = null; sessionStorage.removeItem(SESSION_KEY);
    $("adminView").classList.add("hidden"); $("loginView").classList.remove("hidden"); $("password").value = "";
  });

  if (token) api("adminDashboard", { token }).then(render).catch(() => { token = ""; sessionStorage.removeItem(SESSION_KEY); });

  function render(data) {
    dashboard = data;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
    $("salesDate").min = data.month + "-01";
    const [year, month] = data.month.split("-").map(Number);
    const monthEnd = data.month + "-" + new Date(year, month, 0).getDate();
    $("salesDate").max = today < monthEnd ? today : monthEnd;
    if (!$("salesDate").value || $("salesDate").value.slice(0, 7) !== data.month) $("salesDate").value = $("salesDate").max;
    renderSales();
    const totalGoal = data.stores.reduce((sum, store) => sum + store.goal, 0);
    const totalSales = data.stores.reduce((sum, store) => sum + store.accumulated, 0);
    $("period").textContent = "Período " + data.month + (data.updatedAt ? " · actualizado " + new Date(data.updatedAt).toLocaleString("es-AR") : "");
    $("totalGoal").textContent = money.format(totalGoal); $("totalSales").textContent = money.format(totalSales); $("totalPercent").textContent = (totalGoal ? Math.round(totalSales / totalGoal * 1000) / 10 : 0) + "%";
    $("stores").innerHTML = data.stores.map((store) => `<tr><td><strong>${store.name}</strong></td><td>${money.format(store.accumulated)}</td><td>${store.progressPercent}%</td><td><input class="goal-input" data-goal-id="${store.id}" type="number" min="1" step="100000" value="${store.goal}"></td></tr>`).join("");
    $("message").style.color = "var(--rio-ok)";
    $("loginView").classList.add("hidden"); $("adminView").classList.remove("hidden");
  }

  function api(action, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackName = "rioAdminJsonp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timeout = setTimeout(() => finish(new Error("La API tardó demasiado en responder. Volvé a intentar en unos instantes.")), 60000);
      function finish(error, payload) { clearTimeout(timeout); delete window[callbackName]; script.remove(); if (error) reject(error); else if (!payload || !payload.ok) reject(new Error(payload && payload.error ? payload.error : "Respuesta inválida.")); else resolve(payload.data); }
      window[callbackName] = (payload) => finish(null, payload);
      script.onerror = () => finish(new Error("No se pudo conectar con la API."));
      script.src = API_URL + "?" + new URLSearchParams({ action, ...params, callback: callbackName, _: Date.now().toString() }).toString();
      document.head.appendChild(script);
    });
  }

  async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
  function setBusy(button, busy, busyText, idleText) { button.disabled = busy; button.textContent = busy ? busyText : idleText; }
})();
