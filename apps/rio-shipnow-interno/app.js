;(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbwi4i-Xsud2rISeNV8cjAJ8iX47ksiuAxfQgRPZFf7LRI75-2wFZEttbX1xeHj815gcVg/exec";

  const HOME_TRACKING_URL = location.href.split("#")[0].split("?")[0];
  const LOCALES_CSV_URL = "./locales.csv";
  const PADRON_CSV_URL = "./Padron.csv";

  const LOCALES_FALLBACK = [
    "CASTELLI", "CORRIENTES", "PUEYRREDON", "QUILMES", "SARMIENTO",
    "LAMARCA", "NAZCA", "AVELLANEDA", "AVELLANEDA (WEB)"
  ];

  const PASAN_POR_SARMIENTO = ["CASTELLI", "CORRIENTES", "PUEYRREDON", "QUILMES"];
  const DIRECTO_AVELLANEDA = ["SARMIENTO", "LAMARCA", "NAZCA", "AVELLANEDA", "AVELLANEDA (WEB)"];

  const ESTADOS = [
    "CARGADO EN LOCAL",
    "ENVIADO A SARMIENTO",
    "RECIBIDO EN SARMIENTO",
    "ENVIADO A AVELLANEDA",
    "RECIBIDO EN AVELLANEDA",
    "RECIBIDO EN LOGISTICA WEB",
    "DESPACHADO POR SHIPNOW",
    "DESPACHADO POR TRANSPORTE",
    "CANCELADO",
    "CON PROBLEMA"
  ];

  let locales = [];
  let LOCALES = {};
  let PADRON = [];
  let cache = [];
  let ultimoEnvio = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const apiStatus = $("#apiStatus");

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    try {
      await loadLocalesCsv();
      await cargarPadron();
      fillSelects();
      bindTabs();
      bindCarga();
      bindPanel();
      bindDashboard();
      bindTracking();
      bindAccionesOperativasGlobal();
      toggleTipoEnvio();
      setApiStatus();
      cargarPanel();
    } catch (err) {
      console.error("Error al iniciar la app:", err);
      setApiStatus("err", "Error al iniciar");
      alert("La app no pudo inicializarse correctamente. " + (err.message || err));
    }
  }

  function setApiStatus(state, text) {
    if (!apiStatus) return;

    if (state && text) {
      apiStatus.textContent = text;
      apiStatus.className = `status-pill ${state}`;
      return;
    }

    if (!API_URL || API_URL.includes("PEGAR_URL")) {
      apiStatus.textContent = "Configurar API_URL";
      apiStatus.className = "status-pill err";
    } else {
      apiStatus.textContent = "API conectada";
      apiStatus.className = "status-pill ok";
    }
  }

  function normalizarTexto(v) {
    return String(v || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parseCSV(text) {
    const clean = String(text || "").replace(/^\uFEFF/, "");
    const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (!lines.length) return [];

    const delimiter = detectarSeparador(lines[0]);
    const headers = splitCSVLine(lines[0], delimiter).map((h) => normalizarTexto(h));

    return lines.slice(1).map((line) => {
      const values = splitCSVLine(line, delimiter);
      const obj = {};

      headers.forEach((h, i) => {
        obj[h] = (values[i] || "").trim();
      });

      return obj;
    });
  }

  function detectarSeparador(line) {
    const coma = (line.match(/,/g) || []).length;
    const puntoComa = (line.match(/;/g) || []).length;
    return puntoComa > coma ? ";" : ",";
  }

  function splitCSVLine(line, sep) {
    const out = [];
    let cur = "";
    let q = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const n = line[i + 1];

      if (c === "\"") {
        if (q && n === "\"") {
          cur += "\"";
          i++;
        } else {
          q = !q;
        }
      } else if (c === sep && !q) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }

    out.push(cur.trim());
    return out;
  }

  async function loadLocalesCsv() {
    try {
      const res = await fetch(LOCALES_CSV_URL, { cache: "no-store" });

      if (!res.ok) {
        cargarLocalesFallback();
        return;
      }

      const text = await res.text();
      const rows = parseCSV(text);

      LOCALES = {};
      locales = [];

      rows.forEach((row) => {
        const sucursal =
          row["SUCURSAL"] ||
          row["LOCAL"] ||
          row["NOMBRE"] ||
          row[Object.keys(row)[0]] ||
          "";

        const suc = normalizarTexto(sucursal);
        if (!suc) return;

        const calle =
          row["DIRECCION"] ||
          row["DIRECCIÓN"] ||
          row["DOMICILIO"] ||
          row["CALLE"] ||
          row["AVENIDA"] ||
          "";

        const altura =
          row["ALTURA"] ||
          row["NUMERO"] ||
          row["NÚMERO"] ||
          row["NRO"] ||
          row["NUM"] ||
          "";

        const domicilio = `${calle} ${altura}`.trim();

        LOCALES[suc] = {
          sucursal: suc,
          domicilio,
          localidad:
            row["LOCALIDAD"] ||
            row["CIUDAD"] ||
            row["PARTIDO"] ||
            "",
          provincia:
            row["PROVINCIA"] ||
            row["PROV"] ||
            "",
          cp:
            row["CP"] ||
            row["C.P."] ||
            row["CODIGO POSTAL"] ||
            row["CÓDIGO POSTAL"] ||
            row["COD_POSTAL"] ||
            "",
          telefono:
            row["TELEFONO"] ||
            row["TELÉFONO"] ||
            row["TEL"] ||
            row["CELULAR"] ||
            row["CONTACTO"] ||
            "",
          pais:
            row["PAIS"] ||
            row["PAÍS"] ||
            "AR",
          centro: resolverCentroInicial(suc)
        };
        console.log("LOCAL CARGADO:", suc, LOCALES[suc], row);

        locales.push(suc);
      });

      asegurarLocalesMinimos();
      locales = Array.from(new Set(locales)).sort((a, b) => a.localeCompare(b, "es"));

      if (!locales.length) cargarLocalesFallback();

      console.log("LOCALES cargados:", LOCALES);
    } catch (err) {
      console.warn("No se pudo cargar locales.csv:", err);
      cargarLocalesFallback();
    }
  }

  function cargarLocalesFallback() {
    locales = [...LOCALES_FALLBACK];

    LOCALES = {};
    locales.forEach((s) => {
      const key = normalizarTexto(s);
      LOCALES[key] = {
        sucursal: key,
        domicilio: "",
        localidad: "",
        provincia: "",
        cp: "",
        telefono: "",
        pais: "AR",
        centro: resolverCentroInicial(key)
      };
    });

    console.warn("Usando locales fallback:", LOCALES);
  }

  function asegurarLocalesMinimos() {
    LOCALES_FALLBACK.forEach((sucursal) => {
      const key = normalizarTexto(sucursal);

      if (!LOCALES[key]) {
        LOCALES[key] = {
          sucursal: key,
          domicilio: "",
          localidad: "",
          provincia: "",
          cp: "",
          telefono: "",
          pais: "AR",
          centro: resolverCentroInicial(key)
        };
      }

      locales.push(key);
    });
  }

  async function cargarPadron() {
    try {
      const res = await fetch(PADRON_CSV_URL, { cache: "no-store" });

      if (!res.ok) {
        console.warn("No se pudo cargar Padron.csv");
        PADRON = [];
        return;
      }

      const text = await res.text();
      const rows = parseCSV(text);

      PADRON = rows
        .map((row) => {
          const id =
            row["VENDEDOR_ID"] ||
            row["ID"] ||
            row["CODIGO"] ||
            row["CÓDIGO"] ||
            row["LEGAJO"] ||
            "";

          let nombre =
            row["APELLIDO_NOMBRE"] ||
            row["APELLIDO Y NOMBRE"] ||
            row["NOMBRE Y APELLIDO"] ||
            row["NOMBRE_APELLIDO"] ||
            row["NOMBRE"] ||
            "";

          if (!nombre && row["APELLIDO"]) {
            nombre = `${row["APELLIDO"]} ${row["NOMBRE"] || ""}`.trim();
          }

          if (!nombre) {
            const vals = Object.values(row).filter(Boolean);
            nombre = vals[1] || vals[0] || "";
          }

          const telefono =
            row["TELEFONO"] ||
            row["TELÉFONO"] ||
            row["TEL"] ||
            row["CELULAR"] ||
            "";

          return {
            id: String(id || "").trim(),
            nombre: String(nombre || "").trim(),
            telefono: String(telefono || "").trim()
          };
        })
        .filter((r) => r.id || r.nombre);

      PADRON.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

      console.log("PADRON cargado:", PADRON);
    } catch (err) {
      console.warn("Error cargando Padron.csv:", err);
      PADRON = [];
    }
  }

  function buscarResponsable(codigo) {
    const c = normalizarTexto(codigo);
    if (!c) return null;

    return PADRON.find(
      (r) =>
        normalizarTexto(r.id) === c ||
        normalizarTexto(r.nombre) === c
    ) || null;
  }

  function fillSelects() {
    const sucursalSelect = $("#sucursalOrigen");
    if (sucursalSelect) {
      sucursalSelect.innerHTML =
        '<option value="">Seleccionar...</option>' +
        locales.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    }

    const responsable = $("#responsableLocal");
    if (responsable) {
      responsable.placeholder = "Código de responsable";
    }

    const filtroEstado = $("#filtroEstado");
    if (filtroEstado) {
      filtroEstado.innerHTML =
        '<option value="TODOS">Todos los estados</option>' +
        ESTADOS.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
    }

    const filtroHub = $("#filtroHub");
    if (filtroHub) {
      filtroHub.innerHTML = `
        <option value="TODOS">Todos</option>
        <option value="SARMIENTO">Sarmiento</option>
        <option value="AVELLANEDA">Avellaneda</option>
        <option value="WEB">Logística Web</option>
      `;
    }
  }

  function bindTabs() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".tab").forEach((b) => b.classList.remove("active"));
        $$(".view").forEach((v) => v.classList.remove("active"));

        btn.classList.add("active");
        $(`#view-${btn.dataset.view}`).classList.add("active");

        if (btn.dataset.view === "seguimiento") cargarPanel();
        if (btn.dataset.view === "dashboard") cargarDashboard();
      });
    });
  }

  function bindCarga() {
    $("#tipoEnvio")?.addEventListener("change", toggleTipoEnvio);

    $("#btnLimpiar")?.addEventListener("click", () => {
      $("#formEnvio").reset();
      toggleTipoEnvio();
      $("#resultadoCard")?.classList.add("hidden");
      ultimoEnvio = null;
    });

    $("#btnPDF")?.addEventListener("click", async () => {
      if (!ultimoEnvio) return;

      try {
        await generarPDFRotulo(ultimoEnvio);
      } catch (err) {
        console.error("No se pudo generar el PDF manualmente:", err);
        alert("No se pudo generar el rótulo PDF. " + (err.message || err));
      }
    });

    $("#btnCopiarTracking")?.addEventListener("click", async () => {
      if (!ultimoEnvio) return;

      try {
        await copiarTexto(ultimoEnvio.idTracking);
        alert("Tracking copiado.");
      } catch (err) {
        console.error("No se pudo copiar el tracking:", err);
        alert("No se pudo copiar el tracking automáticamente. " + (err.message || err));
      }
    });

    $("#formEnvio")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();

      const form = ev.target;
      const submitBtn = $('button[type="submit"]', form);
      const originalText = submitBtn?.textContent || "";

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Generando...";
        }

        const data = Object.fromEntries(new FormData(form).entries());
        data.direccionOca = String(data.direccionOca || "").trim();

        data.sucursalOrigen = normalizarTexto(data.sucursalOrigen);
        data.centroAsignado = resolverCentroInicial(data.sucursalOrigen);
        data.hubAsignado = data.centroAsignado;
        data.estado = "CARGADO EN LOCAL";
        data.ultimaUbicacion = data.sucursalOrigen;
        data.accion = "crearEnvio";
        data.urlSeguimientoBase = HOME_TRACKING_URL;

        data.responsableCodigo = String(data.responsable || "").trim();
        data.responsable = data.responsableCodigo;

        const respPadron = buscarResponsable(data.responsableCodigo);
        data.responsableNombre = respPadron?.nombre || "";
        data.responsableTelefono = respPadron?.telefono || "";

        const remitente = obtenerRemitente(data.sucursalOrigen);

        if (!remitente) {
          alert("No se encontró el remitente para la sucursal: " + data.sucursalOrigen);
          return;
        }

        data.remitenteSucursal = remitente.sucursal;
        data.remitenteDomicilio = remitente.domicilio;
        data.remitenteLocalidad = remitente.localidad;
        data.remitenteProvincia = remitente.provincia;
        data.remitenteCp = remitente.cp;
        data.remitenteTelefono = remitente.telefono;

        const faltan = validarPayload(data);
        if (faltan.length) {
          alert("Faltan datos: " + faltan.join(", "));
          return;
        }

        const res = await api(data);

        if (!res.ok) {
          alert("Error: " + (res.error || "No se pudo crear el envío"));
          return;
        }

        ultimoEnvio = res.envio || data;

        if (!ultimoEnvio.idTracking) {
          ultimoEnvio.idTracking = generarTrackingInterno();
        }

        ultimoEnvio.remitente = remitente;

        $("#trackingGenerado").textContent = ultimoEnvio.idTracking;
        $("#hubGenerado").textContent = ultimoEnvio.centroAsignado || ultimoEnvio.hubAsignado || data.centroAsignado;
        $("#estadoGenerado").textContent = ultimoEnvio.estado || data.estado;
        $("#resultadoCard").classList.remove("hidden");

        try {
          await generarPDFRotulo(ultimoEnvio);
        } catch (pdfErr) {
          console.error("No se pudo generar el rótulo PDF:", pdfErr);
          alert(`El tracking se generó, pero falló el PDF: ${pdfErr.message || pdfErr}`);
        }

        cargarPanel();
      } catch (err) {
        console.error("Error al generar tracking:", err);
        alert("No se pudo generar el tracking + rótulo. " + (err.message || err));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }

  function obtenerRemitente(sucursal) {
    const key = normalizarTexto(sucursal);
    return LOCALES[key] || null;
  }

  function toggleTipoEnvio() {
    const tipo = $("#tipoEnvio")?.value || "";

    $$(".field-oca").forEach((e) => e.classList.toggle("hidden", tipo !== "SHIPNOW_OCA"));
    $$(".field-transporte").forEach((e) => e.classList.toggle("hidden", tipo !== "TRANSPORTE"));
    $$(".field-domicilio").forEach((e) => e.classList.toggle("hidden", tipo === "SHIPNOW_OCA"));
  }

  function validarPayload(d) {
    const base = [
      "sucursalOrigen",
      "tipoEnvio",
      "responsable",
      "cliente",
      "mail",
      "telefono",
      "dniCuil",
      "localidad",
      "provincia",
      "cp"
    ];

    if (d.tipoEnvio === "SHIPNOW_OCA") {
      base.push("sucursalOca");
    } else {
      base.push("domicilio");
    }

    if (d.tipoEnvio === "TRANSPORTE") base.push("transporte");

    return base.filter((k) => !String(d[k] || "").trim());
  }

  function necesitaSarmiento(suc) {
    return PASAN_POR_SARMIENTO.includes(normalizarTexto(suc));
  }

  function resolverCentroInicial(suc) {
    return necesitaSarmiento(suc) ? "SARMIENTO" : "AVELLANEDA";
  }

  function resolverUltimaUbicacionPorEstado(envio) {
    const estado = String(envio.estado || "").toUpperCase();

    if (estado.includes("SARMIENTO")) return "SARMIENTO";
    if (estado.includes("AVELLANEDA")) return "AVELLANEDA";
    if (estado.includes("LOGISTICA WEB") || estado.includes("DESPACHADO")) return "LOGISTICA WEB";

    return envio.sucursalOrigen || "";
  }

  function flujoPorEnvio(x) {
    const tipo = x.tipoEnvio || "";

    const final = tipo === "TRANSPORTE"
      ? "DESPACHADO POR TRANSPORTE"
      : "DESPACHADO POR SHIPNOW";

    if (necesitaSarmiento(x.sucursalOrigen)) {
      return [
        "CARGADO EN LOCAL",
        "ENVIADO A SARMIENTO",
        "RECIBIDO EN SARMIENTO",
        "ENVIADO A AVELLANEDA",
        "RECIBIDO EN AVELLANEDA",
        "RECIBIDO EN LOGISTICA WEB",
        final
      ];
    }

    return [
      "CARGADO EN LOCAL",
      "ENVIADO A AVELLANEDA",
      "RECIBIDO EN AVELLANEDA",
      "RECIBIDO EN LOGISTICA WEB",
      final
    ];
  }

  function bindPanel() {
    $("#btnActualizarPanel")?.addEventListener("click", cargarPanel);

    ["filtroHub", "filtroEstado", "buscarPanel"].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.addEventListener("input", renderPanel);
    });
  }

  async function cargarPanel() {
    const res = await api({ accion: "listarEnvios" });

    if (!res.ok) {
      $("#panelLista").innerHTML = `<div class="op-card">Error: ${escapeHtml(res.error || "No se pudo listar")}</div>`;
      return;
    }

    cache = res.envios || [];
    renderPanel();
  }

  function renderPanel() {
    const filtroCentro = $("#filtroHub")?.value || "TODOS";
    const estado = $("#filtroEstado")?.value || "TODOS";
    const q = ($("#buscarPanel")?.value || "").toLowerCase().trim();

    let rows = cache.slice();

    rows.forEach((x) => {
      x.ultimaUbicacion = x.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x);
      x.centroAsignado = x.centroAsignado || x.hubAsignado || resolverCentroInicial(x.sucursalOrigen);
    });

    if (filtroCentro !== "TODOS") {
      rows = rows.filter((x) => {
        if (filtroCentro === "WEB") return x.ultimaUbicacion === "LOGISTICA WEB";
        return x.ultimaUbicacion === filtroCentro || x.centroAsignado === filtroCentro;
      });
    }

    if (estado !== "TODOS") {
      rows = rows.filter((x) => x.estado === estado);
    }

    if (q) {
      rows = rows.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
    }

    $("#panelLista").innerHTML = rows.length
      ? rows.map(renderOpCard).join("")
      : '<div class="op-card">Sin envíos para el filtro seleccionado.</div>';

  }

  function renderOpCard(x) {
    const demora = calcularDemora(x);
    const next = siguientesEstados(x);
    const ubicacion = x.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x);
    const centro = x.centroAsignado || x.hubAsignado || resolverCentroInicial(x.sucursalOrigen);

    return `<article class="op-card">
      <div class="op-top">
        <div>
          <strong>${escapeHtml(x.idTracking)}</strong>
          <span class="badge ${demora ? "warn" : "ok"}">${demora ? "DEMORA" : "OK"}</span>
        </div>
        <span class="badge">${escapeHtml(x.estado || "")}</span>
      </div>

      <div class="meta-grid">
        <div><span>Cliente</span>${escapeHtml(x.cliente || "")}</div>
        <div><span>Origen</span>${escapeHtml(x.sucursalOrigen || "")}</div>
        <div><span>Centro</span>${escapeHtml(centro)}</div>
        <div><span>Ubicación actual</span>${escapeHtml(ubicacion)}</div>
        <div><span>Tipo</span>${escapeHtml(x.tipoEnvio || "")}</div>
        <div><span>Responsable</span>${escapeHtml(x.responsableCodigo || x.responsable || "")}</div>
      </div>

      <div class="actions">
        ${next.map((e) => `<button class="btn op-action" data-id="${escapeHtml(x.idTracking)}" data-estado="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join("")}
      </div>
    </article>`;
  }

  function siguientesEstados(x) {
    const estado = x.estado || "CARGADO EN LOCAL";

    if (["CANCELADO", "CON PROBLEMA", "DESPACHADO POR SHIPNOW", "DESPACHADO POR TRANSPORTE"].includes(estado)) {
      return [];
    }

    const flujo = flujoPorEnvio(x);
    const idx = flujo.indexOf(estado);
    const next = [];

    if (idx >= 0 && idx < flujo.length - 1) {
      next.push(flujo[idx + 1]);
    }

    next.push("CON PROBLEMA", "CANCELADO");

    return next;
  }

  function bindDashboard() {
    $("#btnActualizarDashboard")?.addEventListener("click", cargarDashboard);
  }

  async function cargarDashboard() {
    const res = await api({ accion: "listarEnvios" });
    if (!res.ok) return;

    cache = res.envios || [];

    cache.forEach((x) => {
      x.ultimaUbicacion = x.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x);
      x.centroAsignado = x.centroAsignado || x.hubAsignado || resolverCentroInicial(x.sucursalOrigen);
    });

    const activos = cache.filter((x) => !/^DESPACHADO|CANCELADO/.test(x.estado || ""));
    const demoras = activos.filter(calcularDemora);

    $("#mTotal").textContent = activos.length;
    $("#mPendientes").textContent = activos.filter((x) => x.estado === "CARGADO EN LOCAL").length;
    $("#mHubs").textContent = activos.filter((x) => ["SARMIENTO", "AVELLANEDA"].includes(x.ultimaUbicacion)).length;
    $("#mWeb").textContent = activos.filter((x) => x.ultimaUbicacion === "LOGISTICA WEB").length;
    $("#mDemora").textContent = demoras.length;

    renderBars("#dashHub", groupCount(activos, "ultimaUbicacion"));
    renderBars("#dashEstado", groupCount(activos, "estado"));

    $("#dashAlertas").innerHTML =
      demoras.slice(0, 20).map(renderOpCard).join("") ||
      '<div class="op-card">Sin alertas.</div>';
  }

  function groupCount(rows, key) {
    return rows.reduce((a, x) => {
      const k = x[key] || "SIN DATO";
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {});
  }

  function renderBars(sel, obj) {
    const max = Math.max(1, ...Object.values(obj));

    $(sel).innerHTML = Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<div class="bar-row"><strong>${escapeHtml(k)}</strong> · ${v}<div class="line"><div class="fill" style="width:${(v / max) * 100}%"></div></div></div>`)
      .join("") || '<div class="bar-row">Sin datos</div>';
  }

  function calcularDemora(x) {
    if (/DESPACHADO|CANCELADO/.test(x.estado || "")) return false;

    const raw = x.fechaEstado || x.fecha || "";
    const t = new Date(raw).getTime();

    if (!t) return false;

    const hs = (Date.now() - t) / 36e5;

    if (x.estado === "CARGADO EN LOCAL" && hs > 24) return true;

    if (
      [
        "ENVIADO A SARMIENTO",
        "RECIBIDO EN SARMIENTO",
        "ENVIADO A AVELLANEDA",
        "RECIBIDO EN AVELLANEDA",
        "RECIBIDO EN LOGISTICA WEB"
      ].includes(x.estado) &&
      hs > 12
    ) {
      return true;
    }

    return false;
  }

  function bindTracking() {
    $("#btnBuscarTracking")?.addEventListener("click", buscarTracking);

    $("#trackingInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") buscarTracking();
    });

    const url = new URL(location.href);
    const id = url.searchParams.get("tracking") || url.searchParams.get("t");

    if (id) {
      $$(".tab").find((b) => b.dataset.view === "seguimiento")?.click();
      $("#trackingInput").value = id;
      buscarTracking();
    }
  }

  async function buscarTracking() {
    const input = $("#trackingInput");
    const detalle = $("#trackingDetalle");
    const idTracking = input?.value.trim() || "";

    if (!idTracking || !detalle) return;

    const res = await api({ accion: "obtenerEnvio", idTracking, tracking: idTracking });

    if (!res.ok) {
      detalle.innerHTML = `<div class="op-card">${escapeHtml(res.error || "No encontrado")}</div>`;
      return;
    }

    renderTracking(res.envio);
  }

  function renderBotonesOperativos(envio) {
    const acciones = siguientesEstados(envio)
      .filter((e) => !["CON PROBLEMA", "CANCELADO"].includes(e));

    if (!acciones.length) return "";

    return `
      <div class="actions tracking-actions">
        ${acciones.map((estado) => `
          <button
            class="btn primary op-action"
            data-id="${escapeHtml(envio.idTracking)}"
            data-estado="${escapeHtml(estado)}"
          >
            ${escapeHtml(estado)}
          </button>
        `).join("")}

        <button
          class="btn op-action"
          data-id="${escapeHtml(envio.idTracking)}"
          data-estado="CON PROBLEMA"
        >
          CON PROBLEMA
        </button>

        <button
          class="btn danger op-action"
          data-id="${escapeHtml(envio.idTracking)}"
          data-estado="CANCELADO"
        >
          CANCELADO
        </button>
      </div>
    `;
  }

  function renderTracking(x) {
    const flow = flujoPorEnvio(x);
    const idx = flow.indexOf(x.estado);

    $("#trackingDetalle").innerHTML = `<div class="op-card">
      <div class="op-top">
        <strong>${escapeHtml(x.idTracking)}</strong>
        <span class="badge">${escapeHtml(x.estado)}</span>
      </div>

      <div class="meta-grid">
        <div><span>Cliente</span>${escapeHtml(x.cliente)}</div>
        <div><span>Origen</span>${escapeHtml(x.sucursalOrigen)}</div>
        <div><span>Centro</span>${escapeHtml(x.centroAsignado || x.hubAsignado || resolverCentroInicial(x.sucursalOrigen))}</div>
        <div><span>Ubicación actual</span>${escapeHtml(x.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x))}</div>
        <div><span>Tipo</span>${escapeHtml(x.tipoEnvio)}</div>
      </div>

      <div class="timeline">
        ${flow.map((e, i) => `<div class="step ${i < idx ? "done" : i === idx ? "current" : ""}">
          <div class="dot">${i < idx ? "✓" : i + 1}</div>
          <div><strong>${escapeHtml(e)}</strong></div>
        </div>`).join("")}
      </div>

      ${renderBotonesOperativos(x)}
    </div>`;
  }

  function bindAccionesOperativasGlobal() {
    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".op-action");
      if (!btn) return;

      ev.preventDefault();

      const idTracking = btn.dataset.id;
      const nuevoEstado = btn.dataset.estado;

      if (!idTracking || !nuevoEstado) {
        alert("Falta tracking o estado en el botón.");
        return;
      }

      const responsable = prompt("Código de responsable que actualiza el estado:");
      if (!responsable) return;

      const textoOriginal = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Actualizando...";

      try {
        const res = await api({
          accion: "actualizarEstado",
          idTracking,
          tracking: idTracking,
          nuevoEstado,
          estado: nuevoEstado,
          responsableCodigo: responsable,
          responsable,
          ultimaUbicacion: resolverUltimaUbicacionPorEstado({ estado: nuevoEstado })
        });

        if (!res.ok) {
          alert("Error: " + (res.error || "No se pudo actualizar"));
          return;
        }

        const input = $("#trackingInput");
        if (input && input.value.trim() === idTracking) {
          await buscarTracking();
        }

        await cargarPanel();

        const dashView = $("#view-dashboard");
        if (dashView && dashView.classList.contains("active")) {
          await cargarDashboard();
        }
      } catch (err) {
        console.error("Error actualizando estado:", err);
        alert("No se pudo actualizar el estado. " + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });
  }

  async function generarPDFRotulo(e) {
    if (!window.jspdf?.jsPDF) {
      throw new Error("No cargó la librería jsPDF");
    }

    const branchName = normalizarTexto(e.sucursalOrigen || e.remitenteSucursal || "");
    const branchData = e.remitente || obtenerRemitente(branchName) || {};

    const responsableTexto = e.responsableCodigo || e.responsable || "";

    const data = {
      tracking: e.idTracking,
      qrUrl: `${HOME_TRACKING_URL}?tracking=${encodeURIComponent(e.idTracking)}`,
      tipoEnvio: e.tipoEnvio,
      centro: e.centroAsignado || e.hubAsignado || resolverCentroInicial(e.sucursalOrigen),

      remitente: {
        sucursal: branchData.sucursal || branchName || e.remitenteSucursal || "",
        domicilio: branchData.domicilio || e.remitenteDomicilio || "",
        localidad: branchData.localidad || e.remitenteLocalidad || "",
        provincia: branchData.provincia || e.remitenteProvincia || "",
        cp: branchData.cp || e.remitenteCp || "",
        telefono: branchData.telefono || e.remitenteTelefono || ""
      },

      destinatario: {
        nombre: e.cliente || "",
        dni: e.dniCuil || "",
        telefono: e.telefono || "",
        domicilio: e.domicilio || "",
        entrecalles: e.entrecalles || "",
        localidad: e.localidad || "",
        cp: e.cp || "",
        provincia: e.provincia || ""
      },

      transporte: {
        nombre: e.transporte || (e.tipoEnvio === "TRANSPORTE" ? "" : "SHIPNOW"),
        sucursalOca: e.sucursalOca || "",
        direccionOca: e.direccionOca || "",
        guia: e.guia || e.numeroGuia || "",
        observaciones: e.observaciones || ""
      },

      fecha: e.fecha || fechaHoyAR(),
      impresoPor: responsableTexto,
      etapas: e.etapas || etiquetasPDFPorEnvio(e)
    };

    await generarRotuloDespacho(data);
  }

  function etiquetasPDFPorEnvio(e) {
    if (necesitaSarmiento(e.sucursalOrigen)) {
      return [
        "CARGADO EN\nSUCURSAL",
        "RECIBIDO EN\nSARMIENTO",
        "RECIBIDO EN\nAVELLANEDA",
        "RECIBIDO EN\nLOGÍSTICA WEB"
      ];
    }

    return [
      "CARGADO EN\nSUCURSAL",
      "RECIBIDO EN\nAVELLANEDA",
      "RECIBIDO EN\nLOGÍSTICA WEB"
    ];
  }

  async function generarRotuloDespacho(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const W = 210;
    const H = 297;
    const M = 6;
    const GAP = 5;
    const LABEL_H = (H - M * 2 - GAP) / 2;
    const negro = [0, 0, 0];

    function rect(x, y, w, h, fill = false) {
      if (fill) {
        doc.setFillColor(...negro);
        doc.rect(x, y, w, h, "F");
      } else {
        doc.rect(x, y, w, h);
      }
    }

    function tituloBarra(texto, x, y, w) {
      rect(x, y, w, 6, true);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(texto, x + 2.5, y + 4.3);
      doc.setTextColor(0, 0, 0);
    }

    function campo(label, value, x, y, wLabel, wValue, h = 6, size = 8) {
      rect(x, y, wLabel, h);
      rect(x + wLabel, y, wValue, h);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.text(label, x + 1.5, y + 4.1);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const txt = String(value || "").toUpperCase();
      doc.text(txt, x + wLabel + 2, y + 4.1, { maxWidth: wValue - 4 });
    }

    async function qrDataUrl(text) {
      if (window.QRCode && typeof window.QRCode.toDataURL === "function") {
        return window.QRCode.toDataURL(text, {
          margin: 1,
          width: 300,
          errorCorrectionLevel: "M"
        });
      }

      try {
        const url = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(text);
        const res = await fetch(url);
        const blob = await res.blob();

        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn("No se pudo generar QR. Se genera rótulo sin QR:", err);
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
      }
    }

    const tracking = data.tracking || generarTrackingInterno();
    const qrText = data.qrUrl || `${location.origin}${location.pathname}?tracking=${encodeURIComponent(tracking)}`;
    const qr = await qrDataUrl(qrText);

    function drawLabel(offsetY) {
      const innerX = M + 3;
      const innerW = W - M * 2 - 6;
      const qrSize = 25;
      let y = offsetY + 4;

      doc.setLineWidth(0.6);
      rect(M, offsetY, W - M * 2, LABEL_H);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("DESPACHO DE PEDIDOS", innerX, y + 6);

      doc.setFontSize(8);
      doc.text("N° DE SEGUIMIENTO INTERNO", innerX, y + 13);

      doc.setFillColor(0, 0, 0);
      doc.rect(innerX, y + 15, 62, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(tracking, innerX + 2, y + 20.5);
      doc.setTextColor(0, 0, 0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("TIPO DE ENVÍO:", innerX, y + 28);
      doc.setFont("helvetica", "normal");
      doc.text(String(data.tipoEnvio || "").toUpperCase(), innerX + 24, y + 28);

      doc.setFont("helvetica", "bold");
      doc.text("CENTRO:", innerX + 72, y + 28);
      doc.setFont("helvetica", "normal");
      doc.text(String(data.centro || "").toUpperCase(), innerX + 86, y + 28);

      doc.addImage(qr, "PNG", M + W - M * 2 - qrSize - 7, y + 1, qrSize, qrSize);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text("SEGUIMIENTO", M + W - M * 2 - qrSize - 1, y + qrSize + 4, { align: "right" });

      y += 34;

      tituloBarra("REMITENTE", innerX, y, innerW);
      y += 6;
      campo("SUCURSAL:", data.remitente?.sucursal, innerX, y, 32, innerW - 32);
      y += 6;
      campo("DOMICILIO:", data.remitente?.domicilio, innerX, y, 32, innerW - 32);
      y += 6;
      campo("LOCALIDAD:", data.remitente?.localidad, innerX, y, 32, 70);
      campo("CP:", data.remitente?.cp, innerX + 102, y, 14, innerW - 116);
      y += 6;
      campo("TELÉFONO:", data.remitente?.telefono, innerX, y, 32, innerW - 32);
      y += 8;

      tituloBarra("DESTINATARIO", innerX, y, innerW);
      y += 6;
      campo("NOMBRE:", data.destinatario?.nombre, innerX, y, 32, innerW - 32);
      y += 6;
      campo("DNI/CUIL:", data.destinatario?.dni, innerX, y, 32, 58);
      campo("TEL:", data.destinatario?.telefono, innerX + 90, y, 18, innerW - 108);
      y += 6;
      campo("DOMICILIO:", data.destinatario?.domicilio, innerX, y, 32, innerW - 32);
      y += 6;
      campo("ENTRECALLES:", data.destinatario?.entrecalles, innerX, y, 32, innerW - 32);
      y += 6;
      campo("LOCALIDAD:", data.destinatario?.localidad, innerX, y, 32, 58);
      campo("CP:", data.destinatario?.cp, innerX + 90, y, 18, 26);
      campo("PROV.:", data.destinatario?.provincia, innerX + 134, y, 22, innerW - 156);
      y += 8;

      tituloBarra("TRANSPORTE", innerX, y, innerW);
      y += 6;
      campo("NOMBRE:", data.transporte?.nombre, innerX, y, 32, innerW - 32);
      y += 6;

      if (String(data.tipoEnvio || "").toUpperCase().includes("OCA")) {
        campo("SUC. OCA:", data.transporte?.sucursalOca, innerX, y, 32, innerW - 32);
        y += 6;
        campo("DIR. OCA:", data.transporte?.direccionOca, innerX, y, 32, innerW - 32);
        y += 6;
      } else {
        campo("GUÍA/CÓD.:", data.transporte?.guia || "A DESIGNAR", innerX, y, 32, innerW - 32);
        y += 6;
      }

      campo("OBS.:", data.transporte?.observaciones, innerX, y, 32, innerW - 32);
      y += 8;
      campo("FECHA:", data.fecha || fechaHoyAR(), innerX, y, 32, 56);
      campo("IMPRESO POR:", data.impresoPor || "", innerX + 88, y, 34, innerW - 122);

      doc.setFont("times", "bold");
      doc.setFontSize(20);
      doc.text("LENCERIA RÍO", M + ((W - M * 2) / 2), offsetY + 18, { align: "center" });
    }

    drawLabel(M);
    drawLabel(M + LABEL_H + GAP);

    doc.save(`${tracking}.pdf`);
  }

  function generarTrackingInterno() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const rnd = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");

    return `RIO-SN-${yy}${mm}${dd}-${rnd}`;
  }

  function fechaHoyAR() {
    return new Date().toLocaleDateString("es-AR");
  }

  async function copiarTexto(texto) {
    const value = String(texto || "");

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement("input");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(input);

    if (!ok) {
      throw new Error("El navegador bloqueó el copiado");
    }
  }

  async function api(payload) {
    if (!API_URL || API_URL.includes("PEGAR_URL")) return mockApi(payload);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const text = await res.text();

      try {
        return JSON.parse(text);
      } catch (e) {
        console.error("Apps Script no devolvió JSON:", text);
        return mockApi(payload);
      }
    } catch (err) {
      console.warn("Apps Script falló. Genero rótulo local:", err);
      return mockApi(payload);
    }
  }

  async function mockApi(payload) {
    const k = "rio_shipnow_mock";
    const db = JSON.parse(localStorage.getItem(k) || "[]");

    if (payload.accion === "crearEnvio") {
      const idTracking = payload.idTracking || generarTrackingInterno();

      const envio = {
        ...payload,
        idTracking,
        fecha: new Date().toISOString(),
        fechaEstado: new Date().toISOString(),
        ultimaUbicacion: payload.ultimaUbicacion || payload.sucursalOrigen || "",
        centroAsignado: payload.centroAsignado || payload.hubAsignado || resolverCentroInicial(payload.sucursalOrigen)
      };

      delete envio.accion;

      db.unshift(envio);
      localStorage.setItem(k, JSON.stringify(db));

      return {
        ok: true,
        envio
      };
    }

    if (payload.accion === "listarEnvios") {
      return {
        ok: true,
        envios: db
      };
    }

    if (payload.accion === "actualizarEstado") {
      const id = payload.idTracking || payload.tracking;
      const x = db.find((e) => e.idTracking === id);

      if (!x) {
        return {
          ok: false,
          error: "No encontrado"
        };
      }

      x.estado = payload.nuevoEstado || payload.estado;
      x.fechaEstado = new Date().toISOString();
      x.responsableUltimoEstado = payload.responsableCodigo || payload.responsable;
      x.ultimaUbicacion = payload.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x);

      localStorage.setItem(k, JSON.stringify(db));

      return {
        ok: true,
        envio: x
      };
    }

    if (payload.accion === "obtenerEnvio") {
      const id = payload.idTracking || payload.tracking;
      const x = db.find((e) => e.idTracking === id);

      return x
        ? { ok: true, envio: x }
        : { ok: false, error: "Tracking no encontrado" };
    }

    return {
      ok: false,
      error: "Acción no válida"
    };
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    }[c]));
  }
})();
