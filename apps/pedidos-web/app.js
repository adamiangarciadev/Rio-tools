;(() => {
  "use strict";

  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzGKHbA-H474RmyjTCd9CXrY6Tw0LpM-1K3UHDTBQiSFX6scwLoq9a5zyUE-zWIeBAB/exec";

  const tablaPedidos = document.getElementById("tablaPedidos");
  const estadoCarga = document.getElementById("estadoCarga");

  // Buscador (opcional, si existe en el HTML)
  const inputQ = document.getElementById("q");
  const btnLimpiar = document.getElementById("btnLimpiar");

  if (!tablaPedidos || !estadoCarga) {
    console.error(
      "[RIO] Faltan elementos en el DOM. Revisá los IDs: tablaPedidos, estadoCarga."
    );
    return;
  }

  // =========================
  // CONFIG
  // =========================

  // Estados que NO deben verse en Ecommerce
  const ESTADOS_OCULTOS = new Set([
    "RETIRADO",
    "ENVIADO",
    "CANCELADO",
    "ENTREGADO",
  ]);

  // Cache global para buscador
  let PEDIDOS_CACHE = [];
  let QUERY = "";

  // =========================
  // FLUJO / TRANSICIONES
  // =========================
  // Nota: CANCELADO siempre disponible.
  // Nota: "PARA ARMAR" viene por default y NO se ofrece botón para setearlo.
  // Nota: "PENDIENTE DE ENVIO" debe existir en ESTADOS_VALIDOS del backend si lo vas a usar como botón.
  const TRANSICIONES_BASE = {
    "PARA ARMAR": ["ARMANDOSE"],
    ARMANDOSE: ["PICKEADO/ARMADO", "ESPERANDO MERCADERIA"],
    "PICKEADO/ARMADO": ["CONTROLADO"],
    "ESPERANDO MERCADERIA": ["ARMANDOSE", "PICKEADO/ARMADO"],
    CONTROLADO: ["ESPERANDO PAGO"],
    "ESPERANDO PAGO": [], // no ofrecemos volver a PARA ARMAR desde la web
    "PENDIENTE DE ENVIO": [],
    "LISTO PARA RETIRO": ["ENVIADO A SUCURSAL", "EN SUCURSAL", "RETIRADO"],
    "ENVIADO A SUCURSAL": ["EN SUCURSAL"],
    "EN SUCURSAL": ["RETIRADO"],
  };

  const ORDEN_BOTONES = [
    "ARMANDOSE",
    "PICKEADO/ARMADO",
    "ESPERANDO MERCADERIA",
    "CONTROLADO",
    "ESPERANDO PAGO",
    "PENDIENTE DE ENVIO",
    "LISTO PARA RETIRO",
    "ENVIADO A SUCURSAL",
    "EN SUCURSAL",
    "ENVIADO",
    "RETIRADO",
    "CANCELADO",
  ];

  // =========================
  // INIT
  // =========================

  function init() {
    // Listeners del buscador (si existe en el DOM)
    if (inputQ) {
      inputQ.addEventListener("input", () => {
        QUERY = String(inputQ.value || "").toUpperCase().trim();
        renderTabla(aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY));
      });
    }

    if (btnLimpiar && inputQ) {
      btnLimpiar.addEventListener("click", () => {
        inputQ.value = "";
        QUERY = "";
        renderTabla(PEDIDOS_CACHE);
        inputQ.focus();
      });
    }

    // Cerrar dropdowns al clickear afuera o ESC
    document.addEventListener("click", () => cerrarTodosLosDropdowns_());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarTodosLosDropdowns_();
    });

    cargarPedidos(true);
    setInterval(() => cargarPedidos(false), 30 * 1000);
  }

  // =========================
  // API
  // =========================

  async function cargarPedidos(mostrarLoading = true) {
    if (mostrarLoading) estadoCarga.textContent = "Cargando pedidos...";

    try {
      // Vista global sin selector: usamos listar+sucursal=WEB
      const url = `${SCRIPT_URL}?accion=listar&sucursal=WEB`;
      const res = await fetch(url, { method: "GET" });
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("[RIO] Respuesta no JSON:", text);
        estadoCarga.textContent = "Error: respuesta no válida del servidor.";
        return;
      }

      if (!data.ok) {
        estadoCarga.textContent =
          "Error: " + (data.error || "Error desconocido");
        console.error("[RIO] Error listar WEB:", data);
        return;
      }

      const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];

      // 1) FILTRO FRONT (oculta estados finales)
      const pedidosFiltrados = pedidos.filter((p) => {
        const estado = String(p?.estado || "").toUpperCase().trim();
        return !ESTADOS_OCULTOS.has(estado);
      });

      // 2) ORDEN: nuevos arriba / viejos abajo
      pedidosFiltrados.sort((a, b) => {
        const da = toDate_(a?.fecha_venta);
        const db = toDate_(b?.fecha_venta);
        if (da && db) return db - da;
        if (da && !db) return -1;
        if (!da && db) return 1;

        const fa = Number(a?.fila);
        const fb = Number(b?.fila);
        if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) {
          return fa - fb;
        }

        const ia =
          Number(String(a?.id_pedido || "").replace(/\D/g, "")) || 0;
        const ib =
          Number(String(b?.id_pedido || "").replace(/\D/g, "")) || 0;
        return ib - ia;
      });

      // Cache para buscador
      PEDIDOS_CACHE = pedidosFiltrados;

      // Render con búsqueda aplicada si corresponde
      const vista = QUERY
        ? aplicarFiltroBusqueda_(PEDIDOS_CACHE, QUERY)
        : PEDIDOS_CACHE;

      renderTabla(vista);
      estadoCarga.textContent = `Actualizado: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error("[RIO] Error de red:", err);
      estadoCarga.textContent = "Error al cargar pedidos (red).";
    }
  }

  async function postAccion(payload) {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload), // sin headers para evitar preflight
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Respuesta no válida del servidor (no JSON).");
    }
    if (!data.ok) throw new Error(data.error || "Error desconocido");
    return data;
  }

  // =========================
  // ENVIO/RETIRO + ACCIONES
  // =========================

  function esShipnow_(p) {
    const tipo = String(p?.tipo_envio || "").toUpperCase().trim();
    return tipo.includes("SHIPNOW");
  }

  function envioRetiroLabel(p) {
    const tipo = String(p?.tipo_envio || "").toUpperCase().trim();
    const suc = String(p?.sucursal_retiro || "").toUpperCase().trim();

    if (tipo.includes("SHIPNOW")) return "ENVÍO - SHIPNOW";
    if (tipo.includes("ENVÍO")) return "ENVÍO";
    if (tipo.includes("RETIRO")) return `RETIRO - ${suc || "SIN SUCURSAL"}`;
    return suc ? `RETIRO - ${suc}` : tipo || "SIN DATO";
  }

  function accionesDisponibles_(p) {
    const estado = String(p?.estado || "").toUpperCase().trim();
    if (ESTADOS_OCULTOS.has(estado)) return [];

    const acciones = new Set();
    acciones.add("CANCELADO"); // siempre

    const base = TRANSICIONES_BASE[estado] || [];
    base.forEach((x) => acciones.add(x));

    // Dinámicas desde CONTROLADO/PENDIENTE
    if (estado === "CONTROLADO" || estado === "PENDIENTE DE ENVIO") {
      if (esShipnow_(p)) {
        acciones.add("ENVIADO");
      } else {
        acciones.add("PENDIENTE DE ENVIO");
        acciones.add("LISTO PARA RETIRO");
        acciones.add("ENVIADO A SUCURSAL");
        acciones.add("EN SUCURSAL");
        acciones.add("RETIRADO");
      }
    }

    // No permitir setear "PARA ARMAR" desde la web
    acciones.delete("PARA ARMAR");

    const arr = Array.from(acciones);
    arr.sort((a, b) => ORDEN_BOTONES.indexOf(a) - ORDEN_BOTONES.indexOf(b));
    return arr;
  }

  // =========================
  // BUSCADOR
  // =========================

  function aplicarFiltroBusqueda_(pedidos, qUpper) {
    if (!qUpper) return pedidos;

    return pedidos.filter((p) => {
      const canal = String(p?.canal || "").toUpperCase().trim();
      const id = String(p?.id_pedido || "").toUpperCase().trim();
      const cliente = String(p?.cliente || "").toUpperCase().trim();
      const dni = String(p?.dni || "").toUpperCase().trim();
      const estado = String(p?.estado || "").toUpperCase().trim();
      const sucursal = String(p?.sucursal_retiro || "").toUpperCase().trim();
      const tipo = String(p?.tipo_envio || "").toUpperCase().trim();
      const quien = String(p?.quien_registra || "").toUpperCase().trim();
      const envioRet = String(envioRetiroLabel(p) || "").toUpperCase().trim();

      const texto = [
        canal,
        "WEB",
        id,
        cliente,
        dni,
        estado,
        sucursal,
        tipo,
        envioRet,
        quien,
      ].join(" ");

      return texto.includes(qUpper);
    });
  }

  // =========================
  // DROPDOWN HELPERS
  // =========================

  function cerrarTodosLosDropdowns_() {
    document
      .querySelectorAll(".dd-menu.open")
      .forEach((m) => m.classList.remove("open"));
  }

  // =========================
  // RENDER
  // =========================
  // Orden final de columnas:
  // CANAL | ID | CLIENTE | DNI | ESTADO | ACCIONES | ÚLTIMO USUARIO | ENVIO/RETIRO
  function renderTabla(pedidos) {
    tablaPedidos.innerHTML = "";

    if (!pedidos.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "No hay pedidos pendientes.";
      tr.appendChild(td);
      tablaPedidos.appendChild(tr);
      return;
    }

    pedidos.forEach((p) => {
      const tr = document.createElement("tr");

      const estadoTxt = String(p?.estado || "").toUpperCase().trim();
      const envioRet = envioRetiroLabel(p);
      const ultimoUsuario = String(p?.quien_registra || "").trim() || "-";
      const canal = String(p?.canal || "").toUpperCase().trim();
      const canalLabel = canal ? `WEB - ${canal}` : "WEB";

      tr.innerHTML = `
        <td>${escapeHtml_(canalLabel)}</td>
        <td>${p?.id_pedido ?? ""}</td>
        <td>${escapeHtml_(p?.cliente ?? "")}</td>
        <td>${p?.dni ?? ""}</td>
        <td>${escapeHtml_(estadoTxt)}</td>
        <td class="acciones"></td>
        <td>${escapeHtml_(ultimoUsuario)}</td>
        <td>${escapeHtml_(envioRet)}</td>
      `;

      const accionesTd = tr.querySelector(".acciones");
      const acciones = accionesDisponibles_(p);

      if (!acciones.length) {
        accionesTd.textContent = "-";
      } else {
        // Dropdown
        const wrap = document.createElement("div");
        wrap.className = "dd";

        const btnToggle = document.createElement("button");
        btnToggle.className = "dd-toggle";
        btnToggle.type = "button";
        btnToggle.textContent = "Acciones ▾";

        const menu = document.createElement("div");
        menu.className = "dd-menu";

        acciones.forEach((nuevoEstado) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "dd-item";

          // clase por estado para colorear desde CSS si querés
          item.classList.add("st-" + slugEstado_(nuevoEstado));
          if (nuevoEstado === "CANCELADO") item.classList.add("cancelado");

          item.textContent = nuevoEstado;

          item.addEventListener("click", async () => {
            // cerrar menú al elegir
            menu.classList.remove("open");

            const usuario = prompt("¿Quién realiza la acción? (nombre)");
            if (!usuario) return;

            const sucursalReal = String(p?.sucursal_retiro || "")
              .toUpperCase()
              .trim();
            if (!sucursalReal) {
              alert(
                "Este pedido no tiene SUCURSAL_RETIRO. No se puede actualizar por seguridad."
              );
              return;
            }

            try {
              estadoCarga.textContent = "Actualizando...";
              await postAccion({
                accion: "cambiarEstado",
                sucursal: sucursalReal,
                id_pedido: p?.id_pedido,
                estado: nuevoEstado,
                usuario,
              });
              await cargarPedidos(true);
            } catch (err) {
              console.error("[RIO] Error cambiarEstado:", err);
              alert("Error: " + err.message);
              estadoCarga.textContent = "Error al actualizar.";
            }
          });

          menu.appendChild(item);
        });

        btnToggle.addEventListener("click", (ev) => {
          ev.stopPropagation();
          cerrarTodosLosDropdowns_();
          menu.classList.toggle("open");
        });

        wrap.appendChild(btnToggle);
        wrap.appendChild(menu);
        accionesTd.appendChild(wrap);
      }

      tablaPedidos.appendChild(tr);
    });
  }

  // =========================
  // HELPERS
  // =========================

  function toDate_(v) {
    if (!v) return null;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  function escapeHtml_(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function slugEstado_(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // sin tildes
      .replace(/\//g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/\-+/g, "-");
  }

  init();
})();
