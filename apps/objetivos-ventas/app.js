(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbylSdpa7qTV9FMa7roN5U9iIPIT9IC7AMSmP0JJYDFFYihxuwld8xZ2JOyhz_3-yDF9/exec";
  const SESSION_KEY = "rio_objetivos_ventas_token";
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  let token = sessionStorage.getItem(SESSION_KEY) || "";

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginBusy(true);
    $("loginError").textContent = "";
    try {
      const passwordHash = await sha256($("password").value);
      const response = await api("login", { email: $("email").value.trim(), passwordHash });
      token = response.token;
      sessionStorage.setItem(SESSION_KEY, token);
      render(response.dashboard);
    } catch (error) {
      $("loginError").textContent = error.message || "No se pudo ingresar.";
    } finally {
      setLoginBusy(false);
    }
  });

  $("logoutButton").addEventListener("click", () => {
    if (token) api("logout", { token }).catch(() => {});
    token = "";
    sessionStorage.removeItem(SESSION_KEY);
    $("dashboardView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("password").value = "";
  });

  if (token) {
    api("dashboard", { token })
      .then(render)
      .catch(() => {
        token = "";
        sessionStorage.removeItem(SESSION_KEY);
      });
  }

  function api(action, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackName = "rioJsonp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => finish(new Error("La API tardó demasiado en responder.")), 20000);

      function finish(error, payload) {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        if (error) reject(error);
        else if (!payload || !payload.ok) reject(new Error(payload && payload.error ? payload.error : "Respuesta inválida de la API."));
        else resolve(payload.data);
      }

      window[callbackName] = (payload) => finish(null, payload);
      script.onerror = () => finish(new Error("No se pudo conectar con la API de ventas."));
      const query = new URLSearchParams({ action, ...params, callback: callbackName, _: Date.now().toString() });
      script.src = API_URL + "?" + query.toString();
      document.head.appendChild(script);
    });
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function setLoginBusy(busy) {
    $("loginButton").disabled = busy;
    $("loginButton").textContent = busy ? "Ingresando…" : "Ingresar";
  }

  function pct(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function signedMoney(value) {
    const number = Number(value || 0);
    return (number >= 0 ? "+" : "−") + money.format(Math.abs(number));
  }

  function render(data) {
    $("storeName").textContent = data.store.name;
    $("period").textContent = "Período " + data.month + (data.updatedAt ? " · actualizado " + new Date(data.updatedAt).toLocaleString("es-AR") : " · esperando la primera actualización");
    $("goal").textContent = money.format(data.goal);
    $("accumulated").textContent = "Acumulado " + money.format(data.accumulated);
    $("monthPercent").textContent = data.progressPercent + "% cumplido";
    $("monthBar").style.width = pct(data.progressPercent) + "%";
    $("remaining").textContent = money.format(data.remaining);
    $("remainingPercent").textContent = data.remainingPercent + "% pendiente";
    $("todayAmount").textContent = money.format(data.today.amount);
    $("todayDifference").textContent = signedMoney(data.today.difference) + " contra el objetivo";
    $("todayDifference").className = "sub " + (data.today.difference >= 0 ? "positive" : "negative");
    $("todayTarget").textContent = money.format(data.today.target);
    $("todayPercent").textContent = data.today.achievedPercent + "% del objetivo diario";
    $("todayBar").style.width = pct(data.today.achievedPercent) + "%";
    $("requiredPerDay").textContent = money.format(data.requiredPerDay);
    $("remainingDays").textContent = data.remainingBusinessDays + " días de venta restantes · sábados reforzados";
    const dayLabels = { weekday: "Normal", saturday: "Sábado", holiday: "Feriado", closed: "Cerrado" };
    $("monthPlan").innerHTML = data.monthPlan.map((row) => {
      const hasSale = row.amount != null;
      const differenceClass = hasSale ? (row.difference >= 0 ? "positive" : "negative") : "muted";
      return `<tr class="${row.dayType}"><td>${dateFormat.format(new Date(row.date + "T12:00:00Z"))}<span class="day-type">${dayLabels[row.dayType] || row.dayType}</span></td><td>${money.format(row.target)}</td><td>${hasSale ? money.format(row.amount) : "—"}</td><td>${hasSale ? row.achievedPercent + "%" : "—"}</td><td class="${differenceClass}">${hasSale ? signedMoney(row.difference) : "—"}</td></tr>`;
    }).join("");
    $("history").innerHTML = data.history.length
      ? data.history.map((row) => `<tr><td>${dateFormat.format(new Date(row.date + "T12:00:00Z"))}</td><td>${money.format(row.amount)}</td><td>${money.format(row.target)}</td><td>${row.achievedPercent}%</td><td class="${row.difference >= 0 ? "positive" : "negative"}">${signedMoney(row.difference)}</td></tr>`).join("")
      : '<tr><td colspan="5" class="muted">Todavía no hay ventas procesadas este mes.</td></tr>';
    $("loginView").classList.add("hidden");
    $("dashboardView").classList.remove("hidden");
  }
})();
