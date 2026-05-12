// app.js — Panel de pedidos por sucursal (RIO) sin tokens en el front
;(() => {
  "use strict";

  // ================== CONFIG ==================

  // 👉 URL de tu Apps Script (Aplicación web, termina en /exec)
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwKpTPkHbXiojgHTi_GEV2R93uzewUNIO7R_w8khh8szSBsO0ITvADB1Gm1hwrWF_-M/exec";

  // Clave para guardar la sucursal elegida en el navegador
  const LS_SUCURSAL = "rio_sucursal_web";

  // 🔧 Opcional: ocultar estado "ENVIADO" (si tu backend lo usa como estado intermedio sin acción)
  const HIDE_ENVIADO_SIMPLE = true;

  // Referencias a elementos del DOM
  const sucursalSelect = document.getElementById("sucursalSelect");
  const tablaPedidos = document.getElementById("tablaPedidos");
  const estadoCarga = document.getElementById("estadoCarga");
  const buscarPedido = document.getElementById("buscarPedido");
  let pedidosActuales = [];
  let filtroActual = "";

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

      const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];
      pedidosActuales = pedidos;
      renderTabla(pedidosActuales);
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

  // ================== ORDEN / PRIORIDAD ==================

  function normEstado(p) {
    return String(p?.estado || "").trim().toUpperCase();
  }

  // Menor número = más arriba
  // 1) ENVIADO A SUCURSAL -> botón "Marcar recibido"
  // 2) EN SUCURSAL        -> botón "Marcar retirado/entregado"
  // 3) resto
  function prioridadPedido(p) {
    const e = normEstado(p);
    if (e === "ENVIADO A SUCURSAL") return 1;
    if (e === "EN SUCURSAL") return 2;
    return 9;
  }

  // desempate: ALERTA primero dentro de la misma prioridad
  function prioridadAlerta(p) {
    return String(p?.alerta_36hs || "").trim().toUpperCase() === "ALERTA" ? 0 : 1;
  }

  function ordenarPedidos(pedidos) {
    return pedidos.slice().sort((a, b) => {
      const pa = prioridadPedido(a);
      const pb = prioridadPedido(b);
      if (pa !== pb) return pa - pb;

      const aa = prioridadAlerta(a);
      const ab = prioridadAlerta(b);
      if (aa !== ab) return aa - ab;

      // último desempate: id_pedido (numérico si aplica)
      const ida = Number(a?.id_pedido);
      const idb = Number(b?.id_pedido);
      if (Number.isFinite(ida) && Number.isFinite(idb)) return idb - ida; // más nuevo arriba
      return String(b?.id_pedido || "").localeCompare(String(a?.id_pedido || ""), "es");
    });
  }

  // ================== RENDER ==================

  function renderTabla(pedidos) {
    tablaPedidos.innerHTML = "";

    let list = Array.isArray(pedidos) ? pedidos.slice() : [];

    // Opcional: ocultar estado "ENVIADO"
    if (HIDE_ENVIADO_SIMPLE) {
      list = list.filter((p) => normEstado(p) !== "ENVIADO");
    }

    // Ordenar: primero los que tienen botones
    list = ordenarPedidos(list);

    const q = normalizeText(filtroActual);
    if (q) {
      list = list.filter((p) => normalizeText([
        p.id_pedido,
        p.cliente,
        p.dni,
        p.monto,
        p.estado,
        p.alerta_36hs
      ].join(" ")).includes(q));
    }

    if (!list.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = q ? "No hay pedidos que coincidan con la busqueda." : "No hay pedidos pendientes para esta sucursal.";
      tr.appendChild(td);
      tablaPedidos.appendChild(tr);
      return;
    }

    list.forEach((p) => {
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
      const estado = normEstado(p);

      // ===== LÓGICA DE BOTONES SEGÚN ESTADO =====
      if (estado === "ENVIADO A SUCURSAL") {
        const btnRecibido = document.createElement("button");
        btnRecibido.textContent = "Marcar recibido";
        btnRecibido.className = "recibido";
        btnRecibido.addEventListener("click", () => marcarRecibido(p.id_pedido));
        accionesTd.appendChild(btnRecibido);
      } else if (estado === "EN SUCURSAL") {
        const btnRetirado = document.createElement("button");
        btnRetirado.textContent = "Marcar retirado";
        btnRetirado.className = "retirado";
        btnRetirado.addEventListener("click", () => marcarRetirado(p.id_pedido));
        accionesTd.appendChild(btnRetirado);
      } else {
        accionesTd.textContent = "-";
      }

      tablaPedidos.appendChild(tr);
    });
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
  }

  if (buscarPedido) {
    buscarPedido.addEventListener("input", () => {
      filtroActual = buscarPedido.value.trim();
      renderTabla(pedidosActuales);
    });
  }

  // ================== ARRANQUE ==================

  init();
})();
