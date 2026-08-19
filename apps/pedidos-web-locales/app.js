// app.js — Panel de pedidos por sucursal (RIO) sin tokens en el front
;(() => {
  "use strict";

  // ================== CONFIG ==================

  // 👉 URL de tu Apps Script (Aplicación web, termina en /exec)
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwKpTPkHbXiojgHTi_GEV2R93uzewUNIO7R_w8khh8szSBsO0ITvADB1Gm1hwrWF_-M/exec";

  // Clave para guardar la sucursal elegida en el navegador
  const LS_SUCURSAL = "rio_sucursal_web";
  const PADRON_URLS = [
    "../../data/ASISTENCIA_RIO%20-%20PADRON.csv",
    "../asistencia/ASISTENCIA_RIO%20-%20PADRON.csv",
  ];
  let padronUsuarios = new Map();

  // Referencias a elementos del DOM
  const sucursalSelect = document.getElementById("sucursalSelect");
  const tablaPedidos = document.getElementById("tablaPedidos");
  const estadoCarga = document.getElementById("estadoCarga");

  if (!sucursalSelect || !tablaPedidos || !estadoCarga) {
    console.error(
      "[RIO] Faltan elementos en el DOM. Revisá los IDs: sucursalSelect, tablaPedidos, estadoCarga."
    );
    return;
  }

  // ================== INICIO ==================

  function init() {
    // Cargar sucursal desde localStorage (si ya eligieron antes)
    const sucursalGuardada = localStorage.getItem(LS_SUCURSAL);
    if (sucursalGuardada) {
      sucursalSelect.value = sucursalGuardada;
      cargarPedidos(true);
    }

    // Cuando cambian la sucursal
    sucursalSelect.addEventListener("change", () => {
      const suc = sucursalSelect.value;
      if (!suc) return;
      localStorage.setItem(LS_SUCURSAL, suc);
      cargarPedidos(true);
    });

    // Refresco automático cada 60 segundos si hay sucursal seleccionada
    setInterval(() => {
      if (sucursalSelect.value) {
        cargarPedidos(false);
      }
    }, 60 * 1000);
  }

  // ================== API CALLS ==================

  async function cargarPadronUsuarios() {
    for (const url of PADRON_URLS) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const lines = (await res.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
        const headers = lines.shift().split(",").map((value) => value.replace(/^"|"$/g, "").trim());
        const map = new Map();
        lines.forEach((line) => {
          const values = line.split(",").map((value) => value.replace(/^"|"$/g, "").trim());
          const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
          const codigo = String(row.vendedor_id || row.id || row.codigo || "").trim();
          const nombre = String(row.apellido_nombre || row.nombre || row.vendedor_nombre || "").trim();
          if (codigo && nombre) map.set(codigo, nombre);
        });
        if (map.size) { padronUsuarios = map; return true; }
      } catch (error) { console.warn("[RIO] No se pudo cargar el padrón", url, error); }
    }
    return false;
  }

  async function pedirVendedor() {
    if (!padronUsuarios.size && !(await cargarPadronUsuarios())) {
      alert("No se pudo cargar el padrón. No se permite modificar pedidos.");
      return null;
    }
    const codigo = String(prompt("Código de vendedor") || "").trim();
    if (!codigo) { alert("Tenés que ingresar tu código de vendedor para modificar el pedido."); return null; }
    const nombre = padronUsuarios.get(codigo);
    if (!nombre) { alert("Código de vendedor no encontrado en el padrón."); return null; }
    return { codigo, nombre };
  }

  async function cargarPedidos(mostrarLoading = true) {
    const sucursal = sucursalSelect.value;
    if (!sucursal) return;

    if (mostrarLoading) {
      estadoCarga.textContent = `Cargando pedidos para ${sucursal}...`;
    }

    try {
      const url = `${SCRIPT_URL}?accion=listar&sucursal=${encodeURIComponent(
        sucursal
      )}`;

      const res = await fetch(url, { method: "GET" });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[RIO] La respuesta no es JSON. Texto recibido:", text);
        estadoCarga.textContent = "Error: respuesta no válida del servidor.";
        return;
      }

      if (!data.ok) {
        estadoCarga.textContent = "Error: " + (data.error || "Error desconocido");
        console.error("[RIO] Error listar:", data);
        return;
      }

      const pedidos = data.pedidos || [];
      renderTabla(pedidos);
      estadoCarga.textContent = `Actualizado: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error("[RIO] Error de red listar:", err);
      estadoCarga.textContent = "Error al cargar pedidos (red).";
    }
  }

  async function marcarRecibido(idPedido) {
    const sucursal = sucursalSelect.value;
    if (!sucursal) return;

    const vendedor = await pedirVendedor();
    if (!vendedor) return;

    try {
      estadoCarga.textContent = "Actualizando (recibido)...";

      // 👉 sin headers para evitar preflight/CORS
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "marcarRecibido",
          sucursal: sucursal,
          id_pedido: idPedido,
          usuario: vendedor.nombre,
          usuario_codigo: vendedor.codigo,
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[RIO] Respuesta no JSON en marcarRecibido:", text);
        alert("Error: respuesta no válida del servidor.");
        estadoCarga.textContent = "Error al actualizar pedido.";
        return;
      }

      if (!data.ok) {
        alert("Error al marcar recibido: " + (data.error || "Error desconocido"));
        console.error("[RIO] Error marcarRecibido:", data);
        estadoCarga.textContent = "Error al actualizar pedido.";
        return;
      }

      // Recargar tabla
      cargarPedidos(true);
    } catch (err) {
      console.error("[RIO] Error de red marcarRecibido:", err);
      alert("Error de red al marcar recibido.");
      estadoCarga.textContent = "Error de red al actualizar.";
    }
  }

  async function marcarRetirado(idPedido) {
    const sucursal = sucursalSelect.value;
    if (!sucursal) return;

    const vendedor = await pedirVendedor();
    if (!vendedor) return;

    try {
      estadoCarga.textContent = "Actualizando (retirado)...";

      // 👉 sin headers para evitar preflight/CORS
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "marcarRetirado",
          sucursal: sucursal,
          id_pedido: idPedido,
          usuario: vendedor.nombre,
          usuario_codigo: vendedor.codigo,
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[RIO] Respuesta no JSON en marcarRetirado:", text);
        alert("Error: respuesta no válida del servidor.");
        estadoCarga.textContent = "Error al actualizar pedido.";
        return;
      }

      if (!data.ok) {
        alert("Error al marcar retirado: " + (data.error || "Error desconocido"));
        console.error("[RIO] Error marcarRetirado:", data);
        estadoCarga.textContent = "Error al actualizar pedido.";
        return;
      }

      // Recargar tabla
      cargarPedidos(true);
    } catch (err) {
      console.error("[RIO] Error de red marcarRetirado:", err);
      alert("Error de red al marcar retirado.");
      estadoCarga.textContent = "Error de red al actualizar.";
    }
  }

  // ================== RENDER ==================

  function renderTabla(pedidos) {
    tablaPedidos.innerHTML = "";

    if (!pedidos.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "No hay pedidos pendientes para esta sucursal.";
      tr.appendChild(td);
      tablaPedidos.appendChild(tr);
      return;
    }

    pedidos.forEach((p) => {
      const tr = document.createElement("tr");

      // Si el backend manda alerta_36hs = "ALERTA", marcamos visualmente
      if (String(p.alerta_36hs || "").toUpperCase() === "ALERTA") {
        tr.classList.add("alerta");
      }

      tr.innerHTML = `
        <td>${p.id_pedido ?? ""}</td>
        <td>${p.cliente ?? ""}</td>
        <td>${p.dni ?? ""}</td>
        <td>${p.monto ?? ""}</td>
        <td>${p.estado ?? ""}</td>
        <td>${p.alerta_36hs ?? ""}</td>
        <td class="acciones"></td>
      `;

      const accionesTd = tr.querySelector(".acciones");
      const estado = String(p.estado || "").toUpperCase();

      // ===== LÓGICA DE BOTONES SEGÚN ESTADO =====
      if (estado === "ENVIADO A SUCURSAL") {
        // Pedido ya salió, sucursal puede marcarlo como recibido
        const btnRecibido = document.createElement("button");
        btnRecibido.textContent = "Marcar recibido";
        btnRecibido.className = "recibido";
        btnRecibido.addEventListener("click", () => marcarRecibido(p.id_pedido));
        accionesTd.appendChild(btnRecibido);
      } else if (estado === "EN SUCURSAL") {
        // Pedido ya está en sucursal, se puede marcar como retirado
        const btnRetirado = document.createElement("button");
        btnRetirado.textContent = "Marcar retirado";
        btnRetirado.className = "retirado";
        btnRetirado.addEventListener("click", () => marcarRetirado(p.id_pedido));
        accionesTd.appendChild(btnRetirado);
      } else {
        // PENDIENTE ENVÍO, RETIRADO, CANCELADO, etc.
        accionesTd.textContent = "-";
      }

      tablaPedidos.appendChild(tr);
    });
  }

  // ================== ARRANQUE ==================

  init();
})();
