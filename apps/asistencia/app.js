;(() => {
  "use strict";

  // ===================== CONFIG =====================
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec";

  const LS_SUCURSAL = "asistencia_sucursal_v1";
  const LS_DEVICE   = "asistencia_device_id_v1";

  // ✅ Cache padrón (precarga)
  const LS_PADRON_CACHE = "asistencia_padron_cache_v1";
  const PADRON_TTL_MS   = 24 * 60 * 60 * 1000; // 24h

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
    const r = await fetch(url, { method: "GET", cache: "no-store" });
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
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getExtFromFile(file) {
    const n = String(file?.name || "");
    const idx = n.lastIndexOf(".");
    if (idx >= 0) return n.slice(idx).toLowerCase();
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

  // ===================== PADRON CACHE =====================
  let padronMap = new Map();      // id -> { nombre, activo? }
  let padronMeta = { version: "", ts: 0 };

  function _parseJSONSafe(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function _setPadronUIStatus(text) {
    const el = $("padronCacheHint");
    if (el) el.textContent = text;
  }

  function _applyPadronRows(rows, version = "") {
    padronMap = new Map();
    for (const r of (rows || [])) {
      const id = String(r?.id ?? r?.vendedor_id ?? "").trim();
      const nombre = String(r?.nombre ?? r?.vendedor_nombre ?? r?.apellido_nombre ?? "").trim();
      if (!id) continue;
      padronMap.set(id, {
        nombre,
        activo: (r && typeof r.activo === "boolean") ? r.activo : undefined,
        rol: r?.rol
      });
    }
    padronMeta = { version: String(version || ""), ts: Date.now() };
  }

  function _savePadronCache() {
    const payload = {
      ts: padronMeta.ts,
      version: padronMeta.version || "",
      rows: Array.from(padronMap.entries()).map(([id, v]) => ({
        id,
        nombre: v?.nombre || "",
        activo: v?.activo
      }))
    };
    localStorage.setItem(LS_PADRON_CACHE, JSON.stringify(payload));
  }

  function _loadPadronCacheFromLS() {
    const raw = localStorage.getItem(LS_PADRON_CACHE);
    if (!raw) return false;
    const data = _parseJSONSafe(raw);
    if (!data || !Array.isArray(data.rows)) return false;

    const age = Date.now() - Number(data.ts || 0);
    if (!Number.isFinite(age) || age > PADRON_TTL_MS) return false;

    _applyPadronRows(data.rows, data.version || "");
    return padronMap.size > 0;
  }

  async function refreshPadronFromBackend() {
    try {
      const res = await apiGet({ accion: "padron_all" });
      if (!res || !res.ok) throw new Error(res?.message || "padron_all no disponible");

      const rows = res.data?.rows || res.data?.padron || res.data?.vendedores || [];
      const version = res.data?.version || "";
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("padron_all sin rows");

      _applyPadronRows(rows, version);
      _savePadronCache();
      _setPadronUIStatus(`Padrón cargado (cache) · ${padronMap.size} vendedores`);
      return true;
    } catch (e) {
      console.warn("No se pudo refrescar padrón:", e);
      return false;
    }
  }

  async function loadPadronCache() {
    const okLocal = _loadPadronCacheFromLS();
    if (okLocal) {
      _setPadronUIStatus(`Padrón en cache · ${padronMap.size} vendedores`);
      refreshPadronFromBackend(); // best-effort
      return true;
    }

    _setPadronUIStatus("Cargando padrón…");
    const ok = await refreshPadronFromBackend();
    if (!ok) _setPadronUIStatus("Padrón: sin cache (usa validación online por ID)");
    return ok;
  }

  function lookupPadronLocal(id) {
    const key = String(id || "").trim();
    if (!key) return null;
    const hit = padronMap.get(key);
    if (!hit) return null;

    if (hit.activo === false) return { ok: false, nombre: hit.nombre || "", message: "Vendedor inactivo" };
    return { ok: true, nombre: hit.nombre || "" };
  }

  // ===================== EVENTOS HOY + ANTI DUPLICADO =====================
  let eventosHoy = []; // cache en memoria (para bloquear duplicados)

  function norm(s){ return String(s ?? "").trim().toUpperCase(); }

  function _getHoyEls(){
    // Estos IDs los agregás en el HTML:
    // - <tbody id="hoyTbody"></tbody>
    // - <div id="hoyHint"></div>
    return {
      tbody: $("hoyTbody"),
      hint: $("hoyHint"),
      table: $("hoyTable"),
    };
  }

  function keyDupe(ev){
    const id   = norm(ev?.vendedor_id ?? ev?.id ?? ev?.legajo ?? ev?.vendedorId ?? "");
    const tipo = norm(ev?.tipo_evento ?? ev?.tipo ?? ev?.evento ?? "");
    return `${id}__${tipo}`;
  }

  function esDuplicadoActual(){
    const id = norm($("vendedorId")?.value || "");
    const tipo = norm($("tipoEvento")?.value || "");
    if(!id || !tipo) return false;
    const k = `${id}__${tipo}`;
    return eventosHoy.some(ev => keyDupe(ev) === k);
  }

  function refreshBloqueoDuplicado(){
    const btn = $("btnGuardar");
    if (!btn) return;
    const { hint } = _getHoyEls();

    const dup = esDuplicadoActual();
    btn.disabled = dup;

    if (hint){
      if (dup) hint.textContent = "⚠️ Ya existe un registro HOY para ese vendedor y ese tipo. No se puede duplicar.";
      else hint.textContent = `Registros cargados: ${eventosHoy.length}`;
    }
  }

  function renderHoyTabla(){
    const { tbody, hint } = _getHoyEls();
    if (!tbody) { refreshBloqueoDuplicado(); return; }

    if (!eventosHoy.length){
      tbody.innerHTML = `<tr><td colspan="5" style="padding:10px; opacity:.8">Sin registros cargados hoy.</td></tr>`;
      if (hint) hint.textContent = "Sin registros hoy.";
      refreshBloqueoDuplicado();
      return;
    }

    // Orden por hora desc (si viene HH:MM)
    const ordenados = eventosHoy.slice().sort((a,b) => {
      const ha = String(a?.hora_declarada ?? a?.hora ?? "").trim();
      const hb = String(b?.hora_declarada ?? b?.hora ?? "").trim();
      return hb.localeCompare(ha);
    });

    // marca duplicados internos (si ya existen en sheet)
    const seen = new Set();
    const dupKeys = new Set();
    for (const ev of ordenados){
      const k = keyDupe(ev);
      if (seen.has(k)) dupKeys.add(k);
      else seen.add(k);
    }

    tbody.innerHTML = ordenados.map(ev => {
      const hora = String(ev?.hora_declarada ?? ev?.hora ?? "—");
      const id   = String(ev?.vendedor_id ?? ev?.id ?? "—");
      const nom  = String(ev?.vendedor_nombre ?? ev?.nombre ?? "—");
      const tipo = String(ev?.tipo_evento ?? ev?.tipo ?? "—");
      const obs  = String(ev?.observacion ?? ev?.obs ?? "—");

      const k = keyDupe(ev);
      const warn = dupKeys.has(k);
      const rowStyle = warn ? `style="background: rgba(248,113,113,.10)"` : "";

      return `
        <tr ${rowStyle}>
          <td style="padding:8px; border-top:1px solid rgba(255,255,255,.06)">${hora}</td>
          <td style="padding:8px; border-top:1px solid rgba(255,255,255,.06)"><b>${id}</b></td>
          <td style="padding:8px; border-top:1px solid rgba(255,255,255,.06)">${nom}</td>
          <td style="padding:8px; border-top:1px solid rgba(255,255,255,.06)">${tipo}${warn ? " ⚠️" : ""}</td>
          <td style="padding:8px; border-top:1px solid rgba(255,255,255,.06)">${obs}</td>
        </tr>
      `;
    }).join("");

    refreshBloqueoDuplicado();
  }

  async function cargarEventosHoy(){
    const { hint, tbody } = _getHoyEls();
    try{
      const suc = (localStorage.getItem(LS_SUCURSAL) || $("sucursalSelect")?.value || "").trim().toUpperCase();
      if (!suc){
        eventosHoy = [];
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding:10px; opacity:.8">Elegí una sucursal.</td></tr>`;
        if (hint) hint.textContent = "Elegí una sucursal para ver registros.";
        refreshBloqueoDuplicado();
        return;
      }

      if (hint) hint.textContent = "Cargando registros de hoy…";
      const res = await apiGet({ accion: "eventos_hoy", local: suc });

      if (!res || !res.ok){
        eventosHoy = [];
        if (hint) hint.textContent = res?.message ? `Error: ${res.message}` : "Error al cargar registros.";
        renderHoyTabla();
        return;
      }

      const items = res.items || res.data?.items || res.data?.rows || res.data?.eventos || [];
      eventosHoy = Array.isArray(items) ? items : [];
      renderHoyTabla();
    }catch(err){
      console.error(err);
      eventosHoy = [];
      if (hint) hint.textContent = "Error de red al cargar registros.";
      renderHoyTabla();
    }
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

      // ✅ al terminar de cargar sucursales, carga registros de hoy
      await cargarEventosHoy();
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

    refreshBloqueoDuplicado();
  }

  function _setVendedorUI_OK(nombre, originText = "OK en padrón") {
    $("vendedorNombre").textContent = nombre || "—";
    $("padronHint").textContent = originText;
    setPill("ok", "Vendedor OK");
    lastLookupOk = true;
    refreshBloqueoDuplicado();
  }

  function _setVendedorUI_ERR(msg = "No encontrado") {
    $("vendedorNombre").textContent = "—";
    $("padronHint").textContent = msg;
    setPill("error", "No válido");
    lastLookupOk = false;
    refreshBloqueoDuplicado();
  }

  async function buscarVendedor() {
    const id = ($("vendedorId")?.value || "").trim();
    if (!id) return (toast("Ingresá N° vendedor."), null);

    const local = lookupPadronLocal(id);
    if (local && local.ok) {
      _setVendedorUI_OK(local.nombre, "OK (cache)");
      return { nombre: local.nombre };
    }
    if (local && local.ok === false) {
      _setVendedorUI_ERR(local.message || "No válido");
      toast(local.message || "Vendedor no válido.");
      return null;
    }

    setPill("loading", "Validando padrón…");
    try {
      const res = await apiGet({ accion: "padron", id });
      if (!res.ok) throw new Error(res.message || "No encontrado");

      const nombre = res.data?.nombre || "";
      if (!nombre) throw new Error("Sin nombre");

      _setVendedorUI_OK(nombre, "OK (online)");

      padronMap.set(String(id), { nombre: String(nombre), activo: true });
      padronMeta.ts = Date.now();
      _savePadronCache();
      _setPadronUIStatus(`Padrón en cache · ${padronMap.size} vendedores`);

      return { nombre };
    } catch (err) {
      console.error(err);
      _setVendedorUI_ERR("No encontrado");
      toast("Vendedor no válido en padrón.");
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

    // ✅ bloqueo duplicado (por si el HTML no tiene la tabla o no cargó aún)
    if (esDuplicadoActual()){
      toast("Ya existe un registro HOY para ese vendedor y ese tipo.");
      refreshBloqueoDuplicado();
      return;
    }

    const currentNombre = ($("vendedorNombre")?.textContent || "").trim();
    let pad = null;

    if (lastLookupOk && currentNombre && currentNombre !== "—") {
      pad = { nombre: currentNombre };
    } else {
      pad = await buscarVendedor();
    }
    if (!pad || !pad.nombre || pad.nombre === "—") return;

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
        attachment: null,
      };

      if (file) {
        const base64 = await fileToBase64NoPrefix(file);
        const renamed = buildRenamedFilename({
          vendedorId: id,
          vendedorNombre: pad.nombre,
          fechaISO: fecha,
          file
        });

        payload.attachment = {
          name: renamed,
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

      // ✅ refresca lista del día y bloqueos
      await cargarEventosHoy();

      clearForm(true);
    } catch (err) {
      console.error(err);
      setPill("error", "Error al guardar");
      toast("Error al guardar. Revisar permisos/Deploy.");
    }
  }

  function wireEvents() {
    $("sucursalSelect")?.addEventListener("change", async () => {
      saveSucursalAuto();
      toast("Sucursal guardada en esta PC: " + ($("sucursalSelect")?.value || ""));
      await cargarEventosHoy();
    });

    $("btnBuscar")?.addEventListener("click", buscarVendedor);
    $("btnGuardar")?.addEventListener("click", guardar);
    $("btnLimpiar")?.addEventListener("click", () => clearForm(true));

    // ✅ Enter SOLO busca (eliminado el segundo Enter para guardar)
    $("vendedorId")?.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      await buscarVendedor();
    });

    // Anti-dup en vivo
    $("vendedorId")?.addEventListener("input", refreshBloqueoDuplicado);
    $("tipoEvento")?.addEventListener("change", refreshBloqueoDuplicado);

    // Autocompleta al salir si está en cache
    $("vendedorId")?.addEventListener("blur", () => {
      const id = ($("vendedorId")?.value || "").trim();
      if (!id) return;

      const local = lookupPadronLocal(id);
      if (local && local.ok) _setVendedorUI_OK(local.nombre, "OK (cache)");
      else if (local && local.ok === false) _setVendedorUI_ERR(local.message || "No válido");
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

    $("btnRefreshPadron")?.addEventListener("click", async () => {
      setPill("loading", "Actualizando padrón…");
      const ok = await refreshPadronFromBackend();
      if (ok) {
        setPill("ok", "Padrón actualizado");
        toast("Padrón actualizado.");
      } else {
        setPill("error", "Sin refresco");
        toast("No se pudo actualizar padrón (padron_all).");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    fillHoras();
    wireEvents();

    await loadPadronCache();
    await loadSucursalesAndRestore();

    setComprobanteUI(getSelectedFile());
    $("vendedorId")?.focus();

    // ✅ por si loadSucursales falla o tarda, intentá igual
    await cargarEventosHoy();
  });
})();
