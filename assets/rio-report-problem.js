(() => {
  "use strict";

  if (window.RioProblemReporterLoaded) return;
  window.RioProblemReporterLoaded = true;

  const API_URL = "https://script.google.com/macros/s/AKfycbxx3xJHX7dknxN87Sz8ABwZKVUD4UeC64RwXNV7K1sfCnwtNPf4P_bu4W44oAnU5UcVUg/exec";
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const BRANCH_KEYS = [
    "rio_sucursal",
    "asistencia_sucursal_v1",
    "rio_remitos_sucursal",
    "rio_sucursal_web",
    "rio_deposito_local",
    "mercaderia_transito_sucursal",
    "sucursal",
  ];

  function init() {
    if (document.getElementById("rioProblemButton")) return;
    const pageName = getPageName();
    const pageLocation = `${pageName} · ${location.pathname || location.href}`;
    const button = document.createElement("button");
    button.id = "rioProblemButton";
    button.type = "button";
    button.className = "rio-problem-button";
    button.textContent = "Informar problema con la página";

    const backButton = findOrCreateBackButton();
    const nav = document.createElement("div");
    nav.className = "rio-problem-nav";
    backButton.parentNode.insertBefore(nav, backButton);
    nav.append(backButton, button);

    const dialog = buildDialog(pageLocation);
    document.body.appendChild(dialog);
    const form = dialog.querySelector("form");
    const closeButtons = dialog.querySelectorAll("[data-rio-problem-close]");
    const message = dialog.querySelector(".rio-problem-message");
    const submit = form.querySelector('button[type="submit"]');

    button.addEventListener("click", () => {
      message.textContent = "";
      message.className = "rio-problem-message";
      dialog.showModal();
      form.elements.reporterCode.focus();
    });
    closeButtons.forEach((node) => node.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      const reporterCode = form.elements.reporterCode.value.trim();
      const description = form.elements.description.value.trim();
      const file = form.elements.attachment.files[0];
      if (!reporterCode || !description) return;
      if (file && file.size > MAX_FILE_SIZE) {
        message.textContent = "El archivo supera el máximo de 10 MB.";
        message.className = "rio-problem-message error";
        return;
      }

      submit.disabled = true;
      submit.textContent = "Enviando…";
      try {
        const attachments = file ? [await fileToPayload(file)] : [];
        const payload = {
          action: "crear",
          branch: getBranch(),
          reporterCode,
          area: "Sistemas",
          priority: "Baja",
          title: `Problema en ${pageName}`.slice(0, 100),
          description: `Página: ${pageName}\nURL: ${location.href}\n\n${description}`,
          attachments,
        };
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo crear el ticket.");
        message.textContent = `Ticket ${result.ticket.id} creado correctamente.`;
        message.className = "rio-problem-message success";
        form.elements.description.value = "";
        form.elements.attachment.value = "";
      } catch (error) {
        message.textContent = error.message || "No se pudo crear el ticket.";
        message.className = "rio-problem-message error";
      } finally {
        submit.disabled = false;
        submit.textContent = "Generar ticket";
      }
    });
  }

  function findOrCreateBackButton() {
    const candidates = Array.from(document.querySelectorAll("a, button"));
    const existing = candidates.find((node) => /volver|inicio/i.test(node.textContent || ""));
    if (existing) return existing;
    const link = document.createElement("a");
    link.href = "../../index.html";
    link.className = "rio-problem-back";
    link.textContent = "← Volver";
    const header = document.querySelector("header") || document.body;
    header.insertBefore(link, header.firstChild);
    return link;
  }

  function getPageName() {
    const heading = document.querySelector("h1");
    return String(heading?.textContent || document.title || "Aplicación RIO").replace(/\s+/g, " ").trim();
  }

  function getBranch() {
    for (const key of BRANCH_KEYS) {
      const value = String(localStorage.getItem(key) || "").trim();
      if (value) return normalizeBranch(value);
    }
    return "SIN SUCURSAL";
  }

  function normalizeBranch(value) {
    const clean = String(value).trim().toUpperCase();
    const aliases = { AVELLANEDA: "AV2", "AVELLANEDA 2": "AV2", DEPOSITO: "DEPÓSITO", PUEYRREDON: "PUEYRREDÓN", ADMINISTRACION: "ADMINISTRACIÓN" };
    return aliases[clean] || clean;
  }

  function fileToPayload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function buildDialog(pageLocation) {
    const dialog = document.createElement("dialog");
    dialog.className = "rio-problem-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="rio-problem-form">
        <div class="rio-problem-head">
          <div>
            <small>MESA DE AYUDA</small>
            <h2>Informar problema con la página</h2>
          </div>
          <button type="button" class="rio-problem-close" data-rio-problem-close aria-label="Cerrar">×</button>
        </div>
        <label>
          <span>Página donde está el error</span>
          <input name="page" value="${escapeHtml(pageLocation)}" readonly>
        </label>
        <label>
          <span>Quién carga el problema <b>*</b></span>
          <input name="reporterCode" maxlength="80" autocomplete="name" placeholder="Código o nombre" required>
        </label>
        <label>
          <span>Descripción del problema <b>*</b></span>
          <textarea name="description" rows="5" maxlength="2000" placeholder="Contanos qué ocurrió y qué estabas intentando hacer" required></textarea>
        </label>
        <label>
          <span>Archivo adjunto <small>Opcional · máximo 10 MB</small></span>
          <input name="attachment" type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt">
        </label>
        <div class="rio-problem-message" role="status"></div>
        <div class="rio-problem-actions">
          <button type="button" data-rio-problem-close>Cancelar</button>
          <button type="submit">Generar ticket</button>
        </div>
      </form>`;
    return dialog;
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  const style = document.createElement("style");
  style.textContent = `
    .rio-problem-nav{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:max-content!important;max-width:100%!important;min-width:0!important;justify-self:start!important;align-self:center!important;position:relative!important;inset:auto!important;margin:0!important;padding:0!important}
    .rio-problem-nav>.rio-problem-button,.rio-problem-nav>a,.rio-problem-nav>button{position:static!important;inset:auto!important;float:none!important;transform:none!important;margin:0!important;width:auto!important;max-width:none!important;flex:0 0 auto!important}
    .rio-problem-button,.rio-problem-back{min-height:38px!important;padding:8px 12px!important;border:1px solid rgba(45,212,191,.42)!important;border-radius:8px!important;background:rgba(34,199,184,.10)!important;color:#e8eef7!important;font:700 12px/1.25 Inter,system-ui,sans-serif!important;cursor:pointer!important;white-space:normal!important;box-sizing:border-box!important}
    .rio-problem-back{display:inline-flex!important;align-items:center!important;justify-content:center!important;text-decoration:none!important}
    .rio-problem-dialog{width:min(560px,calc(100% - 28px))!important;max-width:560px!important;padding:0!important;border:1px solid rgba(148,163,184,.25)!important;border-radius:14px!important;background:#111821!important;color:#e8eef7!important;box-shadow:0 24px 70px rgba(0,0,0,.55)!important}
    .rio-problem-dialog::backdrop{background:rgba(3,7,12,.78)!important;backdrop-filter:blur(3px)}
    .rio-problem-form{display:grid!important;gap:15px!important;padding:20px!important;margin:0!important}
    .rio-problem-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important}
    .rio-problem-head small{color:#2dd4bf!important;font:750 10px/1.2 Inter,system-ui,sans-serif!important;letter-spacing:.1em!important}
    .rio-problem-head h2{margin:5px 0 0!important;color:#e8eef7!important;font:720 21px/1.2 Inter,system-ui,sans-serif!important}
    .rio-problem-close{width:36px!important;height:36px!important;padding:0!important;font-size:22px!important}
    .rio-problem-form label{display:grid!important;gap:7px!important;margin:0!important;color:#e8eef7!important;font:650 13px/1.35 Inter,system-ui,sans-serif!important}
    .rio-problem-form label span small{color:#94a3b8!important;font-weight:500!important}
    .rio-problem-form input,.rio-problem-form textarea{box-sizing:border-box!important;width:100%!important;min-height:42px!important;padding:10px 12px!important;border:1px solid rgba(148,163,184,.24)!important;border-radius:8px!important;background:#091018!important;color:#e8eef7!important;font:400 14px/1.4 Inter,system-ui,sans-serif!important}
    .rio-problem-form input[readonly]{color:#94a3b8!important}
    .rio-problem-form textarea{resize:vertical!important}
    .rio-problem-actions{display:flex!important;justify-content:flex-end!important;gap:9px!important}
    .rio-problem-actions button{min-height:40px!important;padding:9px 14px!important}
    .rio-problem-message{min-height:18px!important;color:#94a3b8!important;font:600 13px/1.35 Inter,system-ui,sans-serif!important}
    .rio-problem-message.success{color:#34d399!important}.rio-problem-message.error{color:#fb7185!important}
    @media(max-width:720px){.rio-problem-nav{flex-wrap:wrap!important;width:auto!important}.rio-problem-button{font-size:11px!important}.rio-problem-form{padding:16px!important}.rio-problem-actions{display:grid!important;grid-template-columns:1fr 1fr!important}}
  `;
  document.head.appendChild(style);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
