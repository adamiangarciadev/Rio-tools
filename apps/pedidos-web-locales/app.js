// app.js — Panel de pedidos por sucursal (RIO) sin tokens en el front
;(() => {
  "use strict";

  // ================== CONFIG ==================

  // 👉 URL de tu Apps Script (Aplicación web, termina en /exec)
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwKpTPkHbXiojgHTi_GEV2R93uzewUNIO7R_w8khh8szSBsO0ITvADB1Gm1hwrWF_-M/exec";

  // Clave para guardar la sucursal elegida en el navegador
  const LS_SUCURSAL = "rio_sucursal_web";

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

    const usuario = prompt("¿Quién recibe el pedido? (nombre)");
    if (!usuario) return; // cancelado

    try {
      estadoCarga.textContent = "Actualizando (recibido)...";

      // 👉 sin headers para evitar preflight/CORS
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "marcarRecibido",
          sucursal: sucursal,
          id_pedido: idPedido,
          usuario: usuario,
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

    const usuario = prompt("¿Quién entrega el pedido? (nombre)");
    if (!usuario) return; // cancelado

    try {
      estadoCarga.textContent = "Actualizando (retirado)...";

      // 👉 sin headers para evitar preflight/CORS
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "marcarRetirado",
          sucursal: sucursal,
          id_pedido: idPedido,
          usuario: usuario,
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
