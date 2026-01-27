;(() => {
  "use strict";

  // ===================== CONFIG =====================
  // Pegá acá la URL de tu Web App (Apps Script Deploy -> Web app URL)
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVFxV8M-nMBUD_HKIREvTYL1Ip_lv6QkqPItzIyU80wek_oOJxqt-qnF3yxyfyaiGH/exec";

  const LS_SUCURSAL = "asistencia_sucursal_v1";
  const LS_DEVICE   = "asistencia_device_id_v1";

  // ===================== HELPERS =====================
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  }

  function setPill(state, text) {
    const dot = $("pillDot");
    const pillText = $("pillText");

    pillText.textContent = text;

    // verde ok, amarillo cargando, rojo error
    if (state === "ok") dot.style.background = "#2dd4bf";
    if (state === "loading") dot.style.background = "#fbbf24";
    if (state === "error") dot.style.background = "#fb7185";
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
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ("dev_" + Date.now() + "_" + Math.random().toString(16).slice(2));
      localStorage.setItem(LS_DEVICE, id);
    }
    return id;
  }

  function buildHoras5min() {
    const out = [];
    for (let h = 0; h <= 23; h++) {
      for (let m = 0; m <= 59; m += 5) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        out.push(`${hh}:${mm}`);
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

  // ===================== UI LOGIC =====================
  function fillHoras() {
    const sel = $("horaSelect");
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

  async function loadSucursalesAndRestore() {
    setPill("loading", "Cargando sucursales…");
    try {
      const res = await apiGet({ accion: "sucursales" });
      if (!res.ok) throw new Error(res.message || "No se pudo cargar sucursales");

      const sel = $("sucursalSelect");
      sel.innerHTML = "";
      for (const s of res.data.sucursales) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        sel.appendChild(opt);
      }

      const saved = localStorage.getItem(LS_SUCURSAL);
      if (saved && res.data.sucursales.includes(saved)) {
        sel.value = saved;
      }

      setPill("ok", "Listo");
    } catch (err) {
      console.error(err);
      setPill("error", "Error sucursales");
      toast("Error al cargar sucursales. Revisar SCRIPT_URL / Deploy.");
    }
  }

  function saveSucursal() {
    const s = ($("sucursalSelect").value || "").trim().toUpperCase();
    if (!s) return toast("Seleccioná una sucursal.");
    localStorage.setItem(LS_SUCURSAL, s);
    toast("Sucursal guardada en esta PC: " + s);
  }

  function clearForm(keepHora = true) {
    $("vendedorId").value = "";
    $("vendedorNombre").textContent = "—";
    $("observacion").value = "";
    if (!keepHora) fillHoras();
    $("vendedorId").focus();
  }

  async function buscarVendedor() {
  const suc = ($("sucursalSelect").value || "").trim().toUpperCase();
  const id = ($("vendedorId").value || "").trim();

  if (!suc) return toast("Seleccioná sucursal.");
  if (!id) return toast("Ingresá N° vendedor.");

  setPill("loading", "Validando padrón…");
  try {
    const res = await apiGet({ accion: "padron", id });
    if (!res.ok) throw new Error(res.message || "No encontrado");

    $("vendedorNombre").textContent = res.data.nombre || "—";
    $("padronHint").textContent = "OK en padrón";
    setPill("ok", "Vendedor OK");

    return {
      nombre: res.data.nombre || "",
    };
  } catch (err) {
    console.error(err);
    $("vendedorNombre").textContent = "—";
    $("padronHint").textContent = "No encontrado";
    setPill("error", "No válido");
    toast("Vendedor no válido en padrón.");
    return null;
  }
}


  async function guardar() {
    const suc = (localStorage.getItem(LS_SUCURSAL) || $("sucursalSelect").value || "").trim().toUpperCase();
    const id = ($("vendedorId").value || "").trim();
    const hora = ($("horaSelect").value || "").trim();
    const tipo = ($("tipoEvento").value || "ENTRADA").trim().toUpperCase();
    const obs = ($("observacion").value || "").trim();

    
    if (!id) return toast("Ingresá N° vendedor.");
    if (!hora) return toast("Seleccioná hora.");

    // validar padrón antes de grabar
    const pad = await buscarVendedor();
    if (!pad) return;

    setPill("loading", "Guardando…");
    try {
      const payload = {
        accion: "registrar",
        sucursal: suc,
        vendedor_id: id,
        vendedor_nombre: pad.nombre,
        fecha_operativa: todayISO(),
        tipo_evento: tipo,
        hora_declarada: hora,
        device_id: ensureDeviceId(),
        observacion: obs,
      };

      const res = await apiPost(payload);
      if (!res.ok) throw new Error(res.message || "No se pudo guardar");

      setPill("ok", "Guardado");
      toast("Guardado OK");
      $("lastSaved").textContent =
        `${res.data.fecha_operativa} | ${res.data.sucursal} | ${res.data.vendedor_id} - ${res.data.vendedor_nombre} | ${res.data.tipo_evento} ${res.data.hora_declarada} | cargado: ${res.data.timestamp_carga}`;

      clearForm(true);
    } catch (err) {
      console.error(err);
      setPill("error", "Error al guardar");
      toast("Error al guardar. Revisar permisos/Deploy.");
    }
  }

  function wireEvents() {
    $("btnCambiarSucursal").addEventListener("click", saveSucursal);
    $("btnBuscar").addEventListener("click", buscarVendedor);
    $("btnGuardar").addEventListener("click", guardar);
    $("btnLimpiar").addEventListener("click", () => clearForm(true));

    // Enter: primero buscar, luego guardar
    $("vendedorId").addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const nombreActual = $("vendedorNombre").textContent;
        if (!nombreActual || nombreActual === "—") {
          await buscarVendedor();
        } else {
          await guardar();
        }
      }
    });
  }

  // ===================== INIT =====================
  (async function init() {
    ensureDeviceId();
    fillHoras();
    wireEvents();
    await loadSucursalesAndRestore();

    // Si ya había sucursal guardada, la reflejamos
    const saved = localStorage.getItem(LS_SUCURSAL);
    if (saved) $("sucursalSelect").value = saved;
    $("vendedorId").focus();
  })();
})();
