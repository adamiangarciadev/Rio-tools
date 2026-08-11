(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbylSdpa7qTV9FMa7roN5U9iIPIT9IC7AMSmP0JJYDFFYihxuwld8xZ2JOyhz_3-yDF9/exec";
  const SESSION_KEY = "rio_objetivos_admin_token";
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  let token = sessionStorage.getItem(SESSION_KEY) || "";
  let dashboard = null;

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
      const timeout = setTimeout(() => finish(new Error("La API tardó demasiado en responder.")), 20000);
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
