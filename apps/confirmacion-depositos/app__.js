;(() => {
  "use strict";

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwH7Z2pCJc3fJDYUw1qGqcC_54BHZXVZM9vX6MJYh5enc0tUAXeIN5Ijk5yIdvRkvIp/exec";
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
  };

  let selectedFile = null;

  init();

  function init() {
    const savedLocal = localStorage.getItem(LS_LOCAL);
    if (savedLocal) el.localSelect.value = savedLocal;

    el.localSelect.addEventListener("change", () => {
      localStorage.setItem(LS_LOCAL, el.localSelect.value || "");
    });

    el.fileInput.addEventListener("change", onFileSelected);
    el.saveBtn.addEventListener("click", guardarDeposito);
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
      let data = null;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("La respuesta del servidor no es JSON válido.");
      }

      if (!data.ok) {
        throw new Error(data.error || "No se pudo guardar el depósito.");
      }

      setStatus(`Depósito guardado correctamente. ID: ${data.id}`);
      resetForm();

    } catch (err) {
      setStatus(err.message || "Error al guardar.", true);
    } finally {
      lock(false);
    }
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
})();