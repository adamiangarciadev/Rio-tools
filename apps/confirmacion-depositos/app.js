;(() => {
  "use strict";

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUbN1TyBTJ1-JWOZD1z3qPO6LZn9YBHJcj3pob1AwUux4fsT06tWtlMWoNwmZoCljKhA/exec";
  const LS_LOCAL = "rio_deposito_local";

  const $ = (sel) => document.querySelector(sel);

  const el = {
    localSelect: $("#localSelect"),
    montoInput: $("#montoInput"),
    cuentaSelect: $("#cuentaSelect"),
    obsInput: $("#obsInput"),
    fileInput: $("#fileInput"),
    fileName: $("#fileName"),
    saveBtn: $("#saveBtn"),
    status: $("#status"),
    refreshBtn: $("#refreshBtn"),
    depositList: $("#depositList"),
    recentTitle: $("#recentTitle"),
  };

  let selectedFile = null;

  init();

  function init() {
    const savedLocal = localStorage.getItem(LS_LOCAL);
    if (savedLocal) el.localSelect.value = savedLocal;

    el.localSelect.addEventListener("change", () => {
      const local = el.localSelect.value || "";
      localStorage.setItem(LS_LOCAL, local);
      loadRecentDeposits();
    });

    el.fileInput.addEventListener("change", onFileSelected);
    el.saveBtn.addEventListener("click", guardarDeposito);
    el.refreshBtn.addEventListener("click", loadRecentDeposits);

    loadRecentDeposits();
    setInterval(loadRecentDeposits, 60000);
  }

  function onFileSelected(e) {
    const f = e.target.files?.[0] || null;
    selectedFile = f;
    el.fileName.textContent = f ? f.name : "Ningún archivo seleccionado";
  }

  async function guardarDeposito() {
    const local = (el.localSelect.value || "").trim();
    const monto = (el.montoInput.value || "").trim();
    const cuenta = (el.cuentaSelect.value || "").trim();
    const observacion = (el.obsInput.value || "").trim();

    if (!local) return setStatus("Seleccioná un local.", true);
    if (!monto) return setStatus("Ingresá el monto.", true);
    if (!cuenta) return setStatus("Seleccioná la cuenta.", true);
    if (!selectedFile) return setStatus("Subí un comprobante.", true);

    try {
      lock(true);
      setStatus("Subiendo comprobante y guardando depósito...");

      const fileBase64 = await fileToBase64(selectedFile);

      const payload = {
        local,
        monto,
        cuenta,
        observacion,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        fileBase64
      };

      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "La respuesta del servidor no es JSON válido.");
      }

      if (!data.ok) {
        throw new Error(data.error || "No se pudo guardar el depósito.");
      }

      if (data.drive_ok) {
        setStatus(`Depósito guardado correctamente. ID: ${data.id}`);
      } else {
        setStatus(`Depósito guardado. ID: ${data.id}. El comprobante no se pudo subir.`, true);
      }

      resetForm();
      loadRecentDeposits();

    } catch (err) {
      setStatus(err.message || "Error al guardar.", true);
    } finally {
      lock(false);
    }
  }

  async function loadRecentDeposits() {
    try {
      el.depositList.innerHTML = `<div class="muted">Cargando depósitos...</div>`;

      const selectedLocal = (el.localSelect.value || localStorage.getItem(LS_LOCAL) || "").trim().toUpperCase();

      el.recentTitle.textContent = selectedLocal
        ? `Últimas 72 hs · ${selectedLocal}`
        : "Últimas 72 hs";

      if (!selectedLocal) {
        el.depositList.innerHTML = `<div class="muted">Seleccioná un local para ver sus depósitos.</div>`;
        return;
      }

      const res = await fetch(`${SCRIPT_URL}?accion=ultimos_depositos&local=${encodeURIComponent(selectedLocal)}`);
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "La respuesta del servidor no es JSON válido.");
      }

      if (!data.ok) {
        throw new Error(data.error || "No se pudieron cargar los depósitos.");
      }

      renderDeposits(data.data || []);
    } catch (err) {
      el.depositList.innerHTML = `<div class="muted">Error al cargar depósitos.</div>`;
      console.error(err);
    }
  }

  function renderDeposits(items) {
    if (!items.length) {
      el.depositList.innerHTML = `<div class="muted">No hay depósitos cargados en las últimas 72 hs.</div>`;
      return;
    }

    el.depositList.innerHTML = items.map(item => {
      const estado = normalizeEstado(item.estado);
      const badgeClass = estado === "CONFIRMADO" ? "confirmado" : "pendiente";

      return `
        <article class="dep-item">
          <div class="dep-top">
            <div>
              <div class="dep-local">${escapeHtml(item.local || "-")}</div>
              <div class="dep-id">${escapeHtml(item.id || "-")}</div>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(estado)}</span>
          </div>

          <div class="dep-monto">$ ${escapeHtml(item.monto || "0")}</div>

          <div class="dep-meta">
            <div><strong>Fecha:</strong> ${escapeHtml(item.fecha || "-")}</div>
            <div><strong>Cuenta:</strong> ${escapeHtml(item.cuenta || "-")}</div>
            <div><strong>Obs:</strong> ${escapeHtml(item.observacion || "-")}</div>
          </div>

          <div class="dep-links">
            ${item.link ? `<a href="${escapeAttr(item.link)}" target="_blank" rel="noopener noreferrer">Ver comprobante</a>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function normalizeEstado(v) {
    const s = String(v || "").trim().toUpperCase();
    if (s === "CONFIRMADO") return "CONFIRMADO";
    return "PENDIENTE";
  }

  function resetForm() {
    el.montoInput.value = "";
    el.cuentaSelect.value = "";
    el.obsInput.value = "";
    el.fileInput.value = "";
    el.fileName.textContent = "Ningún archivo seleccionado";
    selectedFile = null;
  }

  function lock(disabled) {
    el.saveBtn.disabled = disabled;
  }

  function setStatus(msg, isError = false) {
    el.status.textContent = msg;
    el.status.style.color = isError ? "#f87171" : "#9ca3af";
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1];
        if (!base64) {
          reject(new Error("No se pudo leer el archivo."));
          return;
        }
        resolve(base64);
      };

      reader.onerror = () => reject(new Error("Error leyendo el archivo."));
      reader.readAsDataURL(file);
    });
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