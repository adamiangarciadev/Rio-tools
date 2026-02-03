;(() => {
  "use strict";

  // ===================== CONFIG =====================
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec";

  const LS_SUCURSAL = "asistencia_sucursal_v1";
  const LS_DEVICE   = "asistencia_device_id_v1";

  // Comprobante (archivo)
  const MAX_FILE_MB = 12;
  const ALLOWED_MIME = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
  ]);

  // ===================== HELPERS =====================
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const t = $("toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  }

  function setPill(state, text) {
    const dot = $("pillDot");
    const pillText = $("pillText");
    if (pillText) pillText.textContent = text;

    if (!dot) return;
    if (state === "ok")      dot.style.background = "#2dd4bf";
    if (state === "loading") dot.style.background = "#fbbf24";
    if (state === "error")   dot.style.background = "#fb7185";
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function ensureDeviceId() {
    let id = localStorage.getItem(LS_DEVICE);
    if (!id) {
      id = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("dev_" + Date.now() + "_" + Math.random().toString(16).slice(2));
      localStorage.setItem(LS_DEVICE, id);
    }
    return id;
  }

  function buildHoras5min() {
    const out = [];
    for (let h = 0; h <= 23; h++) {
      for (let m = 0; m <= 59; m += 5) {
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return out;
  }

  async function apiGet(params) {
    const url = SCRIPT_URL + "?" + new URLSearchParams(params).toString();
    const r = await fetch(url, { method: "GET" });
    return r.json();
  }

  async function apiPost(payload) {
    const r = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return r.json();
  }

  function formatBytes(n) {
    if (!Number.isFinite(n)) return "";
    const units = ["B","KB","MB","GB"];
    let i = 0, v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // Sanitiza para nombre de archivo (sin tildes raras / caracteres prohibidos)
  function safeNamePart(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getExtFromFile(file) {
    const n = String(file?.name || "");
    const idx = n.lastIndexOf(".");
    if (idx >= 0) return n.slice(idx).toLowerCase();
    // fallback por mime
    const mt = String(file?.type || "").toLowerCase();
    if (mt === "application/pdf") return ".pdf";
    if (mt === "image/jpeg") return ".jpg";
    if (mt === "image/png") return ".png";
    if (mt === "image/webp") return ".webp";
    if (mt === "image/heic") return ".heic";
    if (mt === "image/heif") return ".heif";
    return "";
  }

  function setComprobanteUI(file, renamedName = "") {
    const nameEl = $("comprobanteName");
    if (!nameEl) return;
    if (!file) {
      nameEl.textContent = "—";
      return;
    }
    const base = `${file.name} (${formatBytes(file.size)})`;
    nameEl.textContent = renamedName ? `${base} → se guardará como: ${renamedName}` : base;
  }

  function getSelectedFile() {
    const input = $("comprobanteFile");
    if (!input || !input.files || input.files.length === 0) return null;
    return input.files[0] || null;
  }

  function clearSelectedFile() {
    const input = $("comprobanteFile");
    if (input) input.value = "";
    setComprobanteUI(null);
  }

  function validateFile(file) {
    if (!file) return { ok: true };

    const maxBytes = MAX_FILE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return { ok: false, message: `El archivo supera ${MAX_FILE_MB} MB.` };
    }

    // Si el navegador no informa type (a veces pasa), lo dejamos pasar.
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return { ok: false, message: "Tipo de archivo no permitido. Usá PDF o imagen (JPG/PNG/WEBP/HEIC)." };
    }

    return { ok: true };
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("No se pudo leer el archivo."));
      fr.readAsDataURL(file);
    });
  }

  async function fileToBase64NoPrefix(file) {
    const dataUrl = await readFileAsDataURL(file);
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : "";
  }

  // Arma el nombre requerido: COD-NOMBRE-FECHA.ext
  function buildRenamedFilename({ vendedorId, vendedorNombre, fechaISO, file }) {
    const cod = safeNamePart(vendedorId || "SIN_COD") || "SIN_COD";
    const nom = safeNamePart(vendedorNombre || "SIN_NOMBRE") || "SIN_NOMBRE";
    const fec = safeNamePart(fechaISO || todayISO()) || todayISO();
    const ext = getExtFromFile(file);
    return `${cod}-${nom}-${fec}${ext}`;
  }

  // ===================== UI LOGIC =====================
  let lastLookupOk = false;

  function fillHoras() {
    const sel = $("horaSelect");
    if (!sel) return;

    sel.innerHTML = "";
    const horas = buildHoras5min();

    for (const h of horas) {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      sel.appendChild(opt);
    }

    // default: hora actual redondeada a 5
    const d = new Date();
    const m = Math.round(d.getMinutes() / 5) * 5;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(m === 60 ? 0 : m).padStart(2, "0");
    const val = `${hh}:${mm}`;
    sel.value = horas.includes(val) ? val : "09:00";
  }

  function saveSucursalAuto() {
    const sel = $("sucursalSelect");
    if (!sel) return;
    const s = (sel.value || "").trim().toUpperCase();
    if (s) localStorage.setItem(LS_SUCURSAL, s);
  }

  async function loadSucursalesAndRestore() {
    setPill("loading", "Cargando sucursales…");
    try {
      const res = await apiGet({ accion: "sucursales" });
      if (!res.ok) throw new Error(res.message || "No se pudo cargar sucursales");

      const sel = $("sucursalSelect");
      if (!sel) throw new Error("No existe #sucursalSelect");
      sel.innerHTML = "";

      const list = (res.data && res.data.sucursales) ? res.data.sucursales : [];
      for (const s of list) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        sel.appendChild(opt);
      }

      const saved = localStorage.getItem(LS_SUCURSAL);
      if (saved && list.includes(saved)) sel.value = saved;

      saveSucursalAuto();
      setPill("ok", "Listo");
    } catch (err) {
      console.error(err);
      setPill("error", "Error sucursales");
      toast("Error al cargar sucursales. Revisar SCRIPT_URL / Deploy.");
    }
  }

  function clearForm(keepHora = true) {
    const vendedorId = $("vendedorId");
    if (vendedorId) vendedorId.value = "";

    const vendedorNombre = $("vendedorNombre");
    if (vendedorNombre) vendedorNombre.textContent = "—";

    const padronHint = $("padronHint");
    if (padronHint) padronHint.textContent = "Se valida contra padrón.";

    const obs = $("observacion");
    if (obs) obs.value = "";

    clearSelectedFile();

    lastLookupOk = false;
    if (!keepHora) fillHoras();
    if (vendedorId) vendedorId.focus();
  }

  async function buscarVendedor() {
    const id = ($("vendedorId")?.value || "").trim();
    if (!id) return (toast("Ingresá N° vendedor."), null);

    setPill("loading", "Validando padrón…");
    try {
      const res = await apiGet({ accion: "padron", id });
      if (!res.ok) throw new Error(res.message || "No encontrado");

      $("vendedorNombre").textContent = res.data.nombre || "—";
      $("padronHint").textContent = "OK en padrón";
      setPill("ok", "Vendedor OK");
      lastLookupOk = true;

      return { nombre: res.data.nombre || "" };
    } catch (err) {
      console.error(err);
      $("vendedorNombre").textContent = "—";
      $("padronHint").textContent = "No encontrado";
      setPill("error", "No válido");
      toast("Vendedor no válido en padrón.");
      lastLookupOk = false;
      return null;
    }
  }

  async function guardar() {
    const suc = (localStorage.getItem(LS_SUCURSAL) || $("sucursalSelect")?.value || "").trim().toUpperCase();
    const id  = ($("vendedorId")?.value || "").trim();
    const hora = ($("horaSelect")?.value || "").trim();
    const tipo = ($("tipoEvento")?.value || "ENTRADA").trim().toUpperCase();
    const obs  = ($("observacion")?.value || "").trim();
    const fecha = todayISO();

    if (!suc) return toast("Seleccioná sucursal.");
    if (!id)  return toast("Ingresá N° vendedor.");
    if (!hora) return toast("Seleccioná hora.");

    // validar padrón antes de grabar
    const pad = lastLookupOk
      ? { nombre: ($("vendedorNombre")?.textContent || "").trim() }
      : await buscarVendedor();

    if (!pad || !pad.nombre || pad.nombre === "—") return;

    // archivo opcional
    const file = getSelectedFile();
    const v = validateFile(file);
    if (!v.ok) return toast(v.message);

    setPill("loading", file ? "Subiendo certificado y guardando…" : "Guardando…");

    try {
      const payload = {
        accion: "registrar",
        sucursal: suc,
        vendedor_id: id,
        vendedor_nombre: pad.nombre,
        fecha_operativa: fecha,
        tipo_evento: tipo,
        hora_declarada: hora,
        device_id: ensureDeviceId(),
        observacion: obs,

        // IMPORTANTE: el backend nuevo usa "attachment"
        attachment: null,
      };

      if (file) {
        const base64 = await fileToBase64NoPrefix(file);

        // ✅ nombre que pide el backend: COD-NOMBRE-FECHA.ext
        const renamed = buildRenamedFilename({
          vendedorId: id,
          vendedorNombre: pad.nombre,
          fechaISO: fecha,
          file
        });

        payload.attachment = {
          name: renamed, // <- ACA va el nombre renombrado
          mimeType: file.type || "application/octet-stream",
          base64
        };
      }

      const res = await apiPost(payload);
      if (!res.ok) throw new Error(res.message || "No se pudo guardar");

      setPill("ok", "Guardado");
      toast("Guardado OK");

      const link = res.data?.comprobante_url || "";

      $("lastSaved").textContent =
        `${res.data.fecha_operativa} | ${res.data.sucursal} | ${res.data.vendedor_id} - ${res.data.vendedor_nombre} | ${res.data.tipo_evento} ${res.data.hora_declarada} | cargado: ${res.data.timestamp_carga}` +
        (link ? ` | comprobante: ${link}` : "");

      clearForm(true);
    } catch (err) {
      console.error(err);
      setPill("error", "Error al guardar");
      toast("Error al guardar. Revisar permisos/Deploy.");
    }
  }

  function wireEvents() {
    $("sucursalSelect")?.addEventListener("change", () => {
      saveSucursalAuto();
      toast("Sucursal guardada en esta PC: " + ($("sucursalSelect")?.value || ""));
    });

    $("btnBuscar")?.addEventListener("click", buscarVendedor);
    $("btnGuardar")?.addEventListener("click", guardar);
    $("btnLimpiar")?.addEventListener("click", () => clearForm(true));

    // Enter: 1° Enter busca, 2° Enter guarda
    $("vendedorId")?.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!lastLookupOk) await buscarVendedor();
      else await guardar();
    });

    // Archivo
    $("comprobanteFile")?.addEventListener("change", () => {
      const f = getSelectedFile();
      const vv = validateFile(f);
      if (!vv.ok) {
        toast(vv.message);
        clearSelectedFile();
        return;
      }

      // mostramos cómo se va a guardar (si ya hay vendedor validado, mejor)
      const id = ($("vendedorId")?.value || "").trim();
      const nombre = ($("vendedorNombre")?.textContent || "").trim();
      const fecha = todayISO();
      const renamed = (id && nombre && nombre !== "—")
        ? buildRenamedFilename({ vendedorId: id, vendedorNombre: nombre, fechaISO: fecha, file: f })
        : "";

      setComprobanteUI(f, renamed);
    });

    $("btnClearFile")?.addEventListener("click", () => {
      clearSelectedFile();
      toast("Comprobante eliminado.");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    fillHoras();
    wireEvents();
    loadSucursalesAndRestore();
    setComprobanteUI(getSelectedFile());
    $("vendedorId")?.focus();
  });
})();
