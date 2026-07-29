;(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbyK5RuQXTqm3VsYn5kMbP48OSxGNper_pJbdE8Che7jOsMOydG9k8c9j63ywbL53HWl/exec";
  const PUBLIC_TRACKING_URL = "https://adamiangarciadev.github.io/Rio-tools/apps/envios/";
  const PDF_LOGO_URL = "./logo-rio-label.png";

  const HOME_TRACKING_URL = location.href.split("#")[0].split("?")[0];
  const LOCALES_CSV_URL = "./locales.csv";
  const PADRON_CSV_URL = "./Padron.csv";
  const SUCURSAL_ORIGEN_STORAGE_KEY = "rio_shipnow_sucursal_origen";

  const LOCALES_FALLBACK = [
    "CASTELLI", "CORRIENTES", "PUEYRREDON", "QUILMES", "SARMIENTO",
    "LAMARCA", "NAZCA", "AVELLANEDA", "AVELLANEDA (WEB)"
  ];

  const LOCALES_FALLBACK_DATA = {
    CASTELLI: {
      sucursal: "CASTELLI",
      domicilio: "CASTELLI 344",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1032",
      telefono: "11 2858-3205",
      pais: "AR"
    },
    CORRIENTES: {
      sucursal: "CORRIENTES",
      domicilio: "AV CORRIENTES 2557",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1046",
      telefono: "11 2859-3658",
      pais: "AR"
    },
    PUEYRREDON: {
      sucursal: "PUEYRREDON",
      domicilio: "AV PUEYRREDON 49",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1032",
      telefono: "11 5666-9191",
      pais: "AR"
    },
    QUILMES: {
      sucursal: "QUILMES",
      domicilio: "PEATONAL RIVADAVIA 261",
      localidad: "QUILMES",
      provincia: "BUENOS AIRES",
      cp: "1878",
      telefono: "11 5602-7674",
      pais: "AR"
    },
    SARMIENTO: {
      sucursal: "SARMIENTO",
      domicilio: "SARMIENTO 2566",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1045",
      telefono: "11 3622-2701",
      pais: "AR"
    },
    LAMARCA: {
      sucursal: "LAMARCA",
      domicilio: "AV AVELLANEDA 3494",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1407",
      telefono: "11 2277-9170",
      pais: "AR"
    },
    NAZCA: {
      sucursal: "NAZCA",
      domicilio: "AVELLANEDA 2900",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1406",
      telefono: "11 2858-3205",
      pais: "AR"
    },
    AVELLANEDA: {
      sucursal: "AVELLANEDA",
      domicilio: "AV AVELLANEDA 3249",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1406",
      telefono: "11 5127-8308",
      pais: "AR"
    },
    "AVELLANEDA (WEB)": {
      sucursal: "AVELLANEDA (WEB)",
      domicilio: "AV AVELLANEDA 3249",
      localidad: "CABA",
      provincia: "CABA",
      cp: "1406",
      telefono: "11 2851-9621",
      pais: "AR"
    }
  };

  const JS_BARCODE_URL = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
  let jsBarcodeLoader = null;

  const ESTADOS = [
    "CARGADO EN LOCAL",
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

  function getTrackingBaseUrl() {
    const current = HOME_TRACKING_URL;

    if (/^https?:\/\//i.test(current) && !current.startsWith("file:")) {
      return current;
    }

    return PUBLIC_TRACKING_URL;
  }

  document.addEventListener("DOMContentLoaded", bootstrap);

  async function bootstrap() {
    try {
      if (!locales.length) {
        cargarLocalesFallback();
      } else {
        fillSelects();
      }
    } catch (err) {
      console.warn("No se pudieron precargar locales fallback:", err);
    }

    await init();
  }

  async function init() {
    try {
      await loadLocalesCsv();
      fillSelects();
      await cargarPadron();
      bindTabs();
      bindCarga();
      bindPanel();
      bindDashboard();
      bindTracking();
      bindRecepcionRapida();
      bindReimpresionRotuloGlobal();
      bindWhatsappLogisticaGlobal();
      bindAccionesOperativasGlobal();
      toggleTipoEnvio();
      setApiStatus();
      cargarPanel();
    } catch (err) {
      console.error("Error al iniciar la app:", err);
      if (!locales.length) {
        cargarLocalesFallback();
      }
      fillSelects();
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

  function loadJsBarcode() {
    if (window.JsBarcode) return Promise.resolve();
    if (jsBarcodeLoader) return jsBarcodeLoader;

    jsBarcodeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = JS_BARCODE_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar JsBarcode"));
      document.head.appendChild(script);
    });

    return jsBarcodeLoader;
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
      fillSelects();

      console.log("LOCALES cargados:", LOCALES);
    } catch (err) {
      console.warn("No se pudo cargar locales.csv:", err);
      cargarLocalesFallback();
      fillSelects();
    }
  }

  function cargarLocalesFallback() {
    locales = [...LOCALES_FALLBACK];

    LOCALES = {};
    locales.forEach((s) => {
      const key = normalizarTexto(s);
      const fallback = LOCALES_FALLBACK_DATA[key] || {};
      LOCALES[key] = {
        sucursal: fallback.sucursal || key,
        domicilio: fallback.domicilio || "",
        localidad: fallback.localidad || "",
        provincia: fallback.provincia || "",
        cp: fallback.cp || "",
        telefono: fallback.telefono || "",
        pais: fallback.pais || "AR",
        centro: resolverCentroInicial(key)
      };
    });

    console.warn("Usando locales fallback:", LOCALES);
    fillSelects();
  }

  function asegurarLocalesMinimos() {
    LOCALES_FALLBACK.forEach((sucursal) => {
      const key = normalizarTexto(sucursal);

      if (!LOCALES[key]) {
        const fallback = LOCALES_FALLBACK_DATA[key] || {};
        LOCALES[key] = {
          sucursal: fallback.sucursal || key,
          domicilio: fallback.domicilio || "",
          localidad: fallback.localidad || "",
          provincia: fallback.provincia || "",
          cp: fallback.cp || "",
          telefono: fallback.telefono || "",
          pais: fallback.pais || "AR",
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

      restaurarSucursalOrigenGuardada(sucursalSelect);
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
    $("#sucursalOrigen")?.addEventListener("change", guardarSucursalOrigenSeleccionada);
    $("#tipoEnvio")?.addEventListener("change", toggleTipoEnvio);

    bindMayusculasFormulario();

    $("#btnLimpiar")?.addEventListener("click", () => {
      $("#formEnvio").reset();
      restaurarSucursalOrigenGuardada($("#sucursalOrigen"));
      toggleTipoEnvio();
      $("#resultadoCard")?.classList.add("hidden");
      ocultarBotonWhatsappWeb();
      ultimoEnvio = null;
    });

    $("#btnPDF")?.addEventListener("click", async () => {
      if (!ultimoEnvio) return;

      try {
        const faltan = validarEnvioParaPDF(ultimoEnvio);
        if (faltan.length) {
          alert("No se puede generar el PDF. Faltan datos obligatorios: " + faltan.map(etiquetaCampoObligatorio).join(", "));
          return;
        }

        await generarPDFRotulo(ultimoEnvio);
        habilitarBotonWhatsappWeb(ultimoEnvio);
      } catch (err) {
        console.error("No se pudo generar el PDF manualmente:", err);
        alert("No se pudo generar el rótulo PDF. " + (err.message || err));
      }
    });

    $("#btnWhatsappWeb")?.addEventListener("click", () => {
      if (!ultimoEnvio) return;

      const url = generarLinkWhatsappWeb(ultimoEnvio);
      if (!url) {
        alert("El mensaje a Web solo está disponible para envíos Shipnow a domicilio u OCA.");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
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
        normalizarPayloadFormulario(data);
        data.direccionOca = String(data.direccionOca || "").trim();

        data.sucursalOrigen = normalizarTexto(data.sucursalOrigen);
        guardarSucursalOrigen(data.sucursalOrigen);
        data.centroAsignado = "";
        data.hubAsignado = "";
        data.estado = "CARGADO EN LOCAL";
        data.ultimaUbicacion = data.sucursalOrigen;
        data.accion = "crearEnvio";
        data.urlSeguimientoBase = getTrackingBaseUrl();

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

        ultimoEnvio = { ...data, ...(res.envio || {}) };

        if (!ultimoEnvio.idTracking) {
          ultimoEnvio.idTracking = generarTrackingInterno();
        }

        ultimoEnvio.remitente = remitente;

        $("#trackingGenerado").textContent = ultimoEnvio.idTracking;
        $("#hubGenerado").textContent = ultimoEnvio.tipoEnvio || data.tipoEnvio;
        $("#estadoGenerado").textContent = ultimoEnvio.estado || data.estado;
        $("#resultadoCard").classList.remove("hidden");
        ocultarBotonWhatsappWeb();

        try {
          const faltanPdf = validarEnvioParaPDF(ultimoEnvio);
          if (faltanPdf.length) {
            alert("El tracking se generó, pero no se puede generar el PDF. Faltan datos obligatorios: " + faltanPdf.map(etiquetaCampoObligatorio).join(", "));
            return;
          }

          await generarPDFRotulo(ultimoEnvio);
          habilitarBotonWhatsappWeb(ultimoEnvio);
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

  function restaurarSucursalOrigenGuardada(select) {
    if (!select) return;

    const guardada = normalizarTexto(localStorage.getItem(SUCURSAL_ORIGEN_STORAGE_KEY) || "");
    if (!guardada) return;

    const existe = Array.from(select.options).some((option) => normalizarTexto(option.value) === guardada);
    if (existe) select.value = guardada;
  }

  function guardarSucursalOrigenSeleccionada(ev) {
    guardarSucursalOrigen(ev?.target?.value || "");
  }

  function guardarSucursalOrigen(value) {
    const sucursal = normalizarTexto(value);
    if (sucursal) {
      localStorage.setItem(SUCURSAL_ORIGEN_STORAGE_KEY, sucursal);
    }
  }

  function esEnvioShipnowWeb(envio) {
    const tipo = String(envio?.tipoEnvio || "").toUpperCase();
    return tipo.includes("SHIPNOW") && (tipo.includes("DOMICILIO") || tipo.includes("OCA"));
  }

  function ocultarBotonWhatsappWeb() {
    $("#btnWhatsappWeb")?.classList.add("hidden");
  }

  function habilitarBotonWhatsappWeb(envio) {
    const btn = $("#btnWhatsappWeb");
    if (!btn) return;

    btn.classList.toggle("hidden", !esEnvioShipnowWeb(envio));
  }

  function generarLinkWhatsappWeb(envio) {
    if (!esEnvioShipnowWeb(envio)) return "";

    const numero = "5491128519621";
    const mensaje = generarMensajeWhatsappWeb(envio);
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  }

  function agregarLineaMensaje(lineas, label, value) {
    const texto = String(value || "").trim();
    if (texto) lineas.push(`${label}: ${texto}`);
  }

  function generarMensajeWhatsappWeb(envio) {
    const tipo = String(envio.tipoEnvio || "").toUpperCase();
    const esOca = tipo.includes("OCA");
    const remitente = envio.remitente || obtenerRemitente(envio.sucursalOrigen) || {};
    const lineas = [
      "Hola Web, se generó un envío para despachar.",
      "",
      `Tipo: ${tipoEnvioLegible(envio.tipoEnvio)}`,
      `Tracking: ${envio.idTracking || ""}`,
      ""
    ];

    agregarLineaMensaje(lineas, "Cliente", envio.cliente);
    agregarLineaMensaje(lineas, "Mail", envio.mail);
    agregarLineaMensaje(lineas, "Teléfono", envio.telefono);
    agregarLineaMensaje(lineas, "DNI/CUIL", envio.dniCuil);

    if (esOca) {
      agregarLineaMensaje(lineas, "Dirección OCA", envio.direccionOca);
    } else {
      agregarLineaMensaje(lineas, "Domicilio", envio.domicilio);
      agregarLineaMensaje(lineas, "Entrecalles", envio.entrecalles);
    }

    agregarLineaMensaje(lineas, "Localidad", envio.localidad);
    agregarLineaMensaje(lineas, "Provincia", envio.provincia);
    agregarLineaMensaje(lineas, "CP", envio.cp);
    lineas.push("");
    agregarLineaMensaje(lineas, "Sucursal origen", remitente.sucursal || envio.sucursalOrigen);
    agregarLineaMensaje(lineas, "Responsable", envio.responsableNombre || envio.responsableCodigo || envio.responsable);
    agregarLineaMensaje(lineas, "Observaciones", envio.observaciones);

    return lineas.join("\n");
  }

  function tipoEnvioLegible(tipoEnvio) {
    const tipo = String(tipoEnvio || "").toUpperCase();
    if (tipo.includes("SHIPNOW") && tipo.includes("OCA")) return "SHIPNOW - SUCURSAL OCA";
    if (tipo.includes("SHIPNOW") && tipo.includes("DOMICILIO")) return "SHIPNOW - DOMICILIO";
    return tipo || "SIN TIPO";
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

    setRequired("#domicilio", tipo !== "SHIPNOW_OCA");
    setRequired("#entrecalles", tipo !== "SHIPNOW_OCA");
    setRequired("#direccionOca", tipo === "SHIPNOW_OCA");
    setRequired("#transporte", tipo === "TRANSPORTE");
  }

  function setRequired(selector, required) {
    const el = $(selector);
    if (!el) return;
    el.required = Boolean(required);
  }

  function bindMayusculasFormulario() {
    $("#formEnvio")?.addEventListener("input", (ev) => {
      const el = ev.target;
      if (!el?.matches?.("input, textarea")) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = String(el.value || "").toLocaleUpperCase("es-AR");

      if (typeof start === "number" && typeof end === "number") {
        el.setSelectionRange(start, end);
      }
    });
  }

  function normalizarPayloadFormulario(data) {
    Object.keys(data).forEach((key) => {
      data[key] = String(data[key] || "").trim().toLocaleUpperCase("es-AR");
    });
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
      base.push("direccionOca");
    } else {
      base.push("domicilio");
      base.push("entrecalles");
    }

    if (d.tipoEnvio === "TRANSPORTE") base.push("transporte");

    return base.filter((k) => !String(d[k] || "").trim());
  }

  function etiquetaCampoObligatorio(campo) {
    const labels = {
      sucursalOrigen: "Sucursal origen",
      tipoEnvio: "Tipo de envío",
      responsable: "Responsable",
      responsableCodigo: "Responsable",
      cliente: "Cliente",
      mail: "Mail",
      telefono: "Teléfono",
      dniCuil: "DNI/CUIL",
      domicilio: "Domicilio",
      entrecalles: "Entrecalles",
      localidad: "Localidad",
      provincia: "Provincia",
      cp: "Código postal",
      sucursalOca: "Sucursal OCA",
      direccionOca: "Dirección OCA",
      transporte: "Transporte"
    };

    return labels[campo] || campo;
  }

  function validarEnvioParaPDF(envio) {
    const faltan = validarPayload({
      ...envio,
      responsable: envio.responsable || envio.responsableCodigo
    });

    if (!envio.idTracking) {
      faltan.push("idTracking");
    }

    return Array.from(new Set(faltan));
  }

  function resolverCentroInicial(suc) {
    return "";
  }

  function resolverUltimaUbicacionPorEstado(envio) {
    const estado = String(envio.estado || "").toUpperCase();

    if (estado.includes("DESPACHADO")) return "DESPACHADO";

    return envio.sucursalOrigen || "";
  }

  function flujoPorEnvio(x) {
    const tipo = x.tipoEnvio || "";

    const final = tipo === "TRANSPORTE"
      ? "DESPACHADO POR TRANSPORTE"
      : "DESPACHADO POR SHIPNOW";

    return [
      "CARGADO EN LOCAL",
      final
    ];
  }

  function bindPanel() {
    $("#btnActualizarPanel")?.addEventListener("click", cargarPanel);

    ["filtroEstado", "buscarPanel"].forEach((id) => {
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
    const estado = $("#filtroEstado")?.value || "TODOS";
    const q = ($("#buscarPanel")?.value || "").toLowerCase().trim();

    let rows = cache.slice();

    rows.forEach((x) => {
      x.ultimaUbicacion = x.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x);
    });

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
    const botonWhatsappLogistica = esEnvioShipnowWeb(x)
      ? `<button
          class="btn whatsapp whatsapp-logistica-action"
          type="button"
          data-id="${escapeHtml(x.idTracking)}"
          aria-label="Reenviar los datos del envío a logística por WhatsApp"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12.04 2.2A9.74 9.74 0 0 0 2.3 11.93c0 1.72.45 3.4 1.3 4.89l-1.38 5.02 5.14-1.35a9.72 9.72 0 0 0 4.68 1.2h.01a9.74 9.74 0 0 0-.01-19.49Zm0 17.84a8.04 8.04 0 0 1-4.1-1.12l-.29-.17-3.05.8.81-2.97-.19-.3a8.05 8.05 0 1 1 6.82 3.76Zm4.41-6.02c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
          </svg>
          Reenviar WhatsApp a logística
        </button>`
      : "";

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
        <div><span>Ubicación actual</span>${escapeHtml(ubicacion)}</div>
        <div><span>Tipo</span>${escapeHtml(x.tipoEnvio || "")}</div>
        <div><span>Responsable</span>${escapeHtml(x.responsableCodigo || x.responsable || "")}</div>
      </div>

      <div class="actions">
        <button
          class="btn primary reprint-label-action"
          type="button"
          data-id="${escapeHtml(x.idTracking)}"
        >
          Descargar rótulo PDF
        </button>
        ${botonWhatsappLogistica}
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

    const activos = cache.filter((x) => !/^DESPACHADO|CANCELADO/.test(x.estado || ""));
    const demoras = activos.filter(calcularDemora);

    $("#mTotal").textContent = activos.length;
    $("#mPendientes").textContent = activos.filter((x) => x.estado === "CARGADO EN LOCAL").length;
    $("#mHubs").textContent = cache.filter((x) => /^DESPACHADO/.test(x.estado || "")).length;
    $("#mWeb").textContent = activos.filter((x) => x.estado === "CON PROBLEMA").length;
    $("#mDemora").textContent = demoras.length;

    renderBars("#dashHub", groupCount(cache, "tipoEnvio"));
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

    return false;
  }

  function esEstadoFinalSeguimiento(estado) {
    return [
      "DESPACHADO POR SHIPNOW",
      "DESPACHADO POR TRANSPORTE",
      "CANCELADO",
      "CON PROBLEMA"
    ].includes(String(estado || "").toUpperCase());
  }

  function bindRecepcionRapida() {
    const input = $("#scanInput");
    const punto = $("#scanPunto");
    const responsable = $("#scanResponsable");
    const historial = $("#scanHistorial");

    if (!input) return;

    punto.value = localStorage.getItem("scan_punto") || "SHIPNOW";
    responsable.value = localStorage.getItem("scan_responsable") || "";

    punto.addEventListener("change", () => {
      localStorage.setItem("scan_punto", punto.value);
    });

    responsable.addEventListener("change", () => {
      localStorage.setItem("scan_responsable", responsable.value);
    });

    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;

      e.preventDefault();

      const tracking = input.value.trim();
      if (!tracking) return;

      const mapa = {
        SHIPNOW: "DESPACHADO POR SHIPNOW",
        TRANSPORTE: "DESPACHADO POR TRANSPORTE"
      };

      try {
        const res = await api({
          accion: "actualizarEstado",
          idTracking: tracking,
          tracking,
          nuevoEstado: mapa[punto.value],
          estado: mapa[punto.value],
          responsableCodigo: responsable.value,
          responsable: responsable.value,
          ultimaUbicacion: "DESPACHADO"
        });

        const ok = !!res.ok;

        const div = document.createElement("div");
        div.className = ok ? "scan-ok" : "scan-error";

        div.innerHTML = ok
          ? `✅ ${tracking} · ${mapa[punto.value]}`
          : `❌ ${tracking} · ERROR`;

        historial.prepend(div);

        if (historial.children.length > 15) {
          historial.removeChild(historial.lastChild);
        }

        input.value = "";
        input.focus();

        if (ok) {
          await cargarPanel();
        }

      } catch (err) {
        console.error(err);
      }
    });
  }

  async function generarBarcodeCode128(texto) {
    await loadJsBarcode();
    const canvas = document.createElement("canvas");

    JsBarcode(canvas, texto, {
      format: "CODE128",
      displayValue: true,
      fontSize: 11,
      height: 28,
      margin: 0
    });

    return canvas.toDataURL("image/png");
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

  function renderBotonReimprimirRotulo(envio) {
    const idTracking = envio?.idTracking || "";
    if (!idTracking) return "";

    return `
      <div class="actions tracking-actions">
        <button
          class="btn primary reprint-label-action"
          type="button"
          data-id="${escapeHtml(idTracking)}"
        >
          Descargar rótulo PDF
        </button>
      </div>
    `;
  }

  function renderTracking(x) {
    if (esEstadoFinalSeguimiento(x.estado)) {
      $("#trackingDetalle").innerHTML = `<div class="op-card">
        <div class="op-top">
          <strong>${escapeHtml(x.idTracking)}</strong>
          <span class="badge">${escapeHtml(x.estado)}</span>
        </div>

        <div class="meta-grid">
          <div><span>Seguimiento</span>El acceso por QR fue deshabilitado para este envío.</div>
          <div><span>Estado final</span>${escapeHtml(x.estado)}</div>
        </div>

        ${renderBotonReimprimirRotulo(x)}
      </div>`;
      return;
    }

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
        <div><span>Ubicación actual</span>${escapeHtml(x.ultimaUbicacion || resolverUltimaUbicacionPorEstado(x))}</div>
        <div><span>Tipo</span>${escapeHtml(x.tipoEnvio)}</div>
      </div>

      <div class="timeline">
        ${flow.map((e, i) => `<div class="step ${i < idx ? "done" : i === idx ? "current" : ""}">
          <div class="dot">${i < idx ? "✓" : i + 1}</div>
          <div><strong>${escapeHtml(e)}</strong></div>
        </div>`).join("")}
      </div>

      ${renderBotonReimprimirRotulo(x)}
      ${renderBotonesOperativos(x)}
    </div>`;
  }

  function bindReimpresionRotuloGlobal() {
    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".reprint-label-action");
      if (!btn) return;

      ev.preventDefault();

      const idTracking = btn.dataset.id;
      if (!idTracking) {
        alert("Falta tracking para reimprimir el rótulo.");
        return;
      }

      const textoOriginal = btn.textContent.trim();
      btn.disabled = true;
      btn.textContent = "Generando PDF...";

      try {
        const res = await api({ accion: "obtenerEnvio", idTracking, tracking: idTracking });

        if (!res.ok || !res.envio) {
          alert("No se pudo recuperar el envío para reimprimir. " + (res.error || ""));
          return;
        }

        await generarPDFRotulo(res.envio);
      } catch (err) {
        console.error("No se pudo reimprimir el rótulo PDF:", err);
        alert("No se pudo reimprimir el rótulo PDF. " + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });
  }

  function bindWhatsappLogisticaGlobal() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".whatsapp-logistica-action");
      if (!btn) return;

      ev.preventDefault();

      const idTracking = btn.dataset.id;
      const envio = cache.find((item) => String(item.idTracking) === String(idTracking));
      const url = generarLinkWhatsappWeb(envio);

      if (!url) {
        alert("No se encontraron los datos del envío Shipnow para reenviar.");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    });
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

    const faltan = validarEnvioParaPDF(e);
    if (faltan.length) {
      throw new Error("Faltan datos obligatorios: " + faltan.map(etiquetaCampoObligatorio).join(", "));
    }

    const branchName = normalizarTexto(e.sucursalOrigen || e.remitenteSucursal || "");
    const branchData = e.remitente || obtenerRemitente(branchName) || {};

    const responsableTexto = e.responsableCodigo || e.responsable || "";

    const data = {
      tracking: e.idTracking,
      qrUrl: `${getTrackingBaseUrl()}?tracking=${encodeURIComponent(e.idTracking)}`,
      estado: e.estado || "",
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
        mail: e.mail || "",
        dni: e.dniCuil || "",
        telefono: e.telefono || "",
        domicilio: e.domicilio || "",
        entrecalles: e.entrecalles || "",
        sucursalOca: e.sucursalOca || "",
        direccionOca: e.direccionOca || "",
        localidad: e.localidad || "",
        cp: e.cp || "",
        provincia: e.provincia || ""
      },

      transporte: {
        nombre: e.transporte || "SHIPNOW",
        sucursalOca: e.sucursalOca || "",
        direccionOca: e.direccionOca || "",
        guia: e.guia || "",
        observaciones: e.observaciones || ""
      },

      fecha: e.fecha || fechaHoyAR(),
      impresoPor: responsableTexto,
      etapas: e.etapas || etiquetasPDFPorEnvio(e)
    };

    await generarRotuloDespacho(data);
  }

  function etiquetasPDFPorEnvio(e) {
    return [
      "CARGADO EN\nSUCURSAL",
      String(e.tipoEnvio || "").toUpperCase().includes("TRANSPORTE")
        ? "DESPACHADO POR\nTRANSPORTE"
        : "DESPACHADO POR\nSHIPNOW"
    ];
  }

  async function generarRotuloDespacho(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4"
    });

    const tipoEnvioRaw = String(data.tipoEnvio || "").toUpperCase();
    const esTransporte = tipoEnvioRaw.includes("TRANSPORTE") || tipoEnvioRaw.includes("EXPRESO");
    const esShipnowOca = tipoEnvioRaw.includes("SHIPNOW") && tipoEnvioRaw.includes("OCA");

    const pageW = 297;
    const pageH = 210;

    const labelY = 8;
    const labelH = 194;

    const labelW = esTransporte ? 276 : 136;
    const labelX1 = esTransporte ? 10.5 : 7;
    const labelX2 = pageW - 7 - 136;
    const cutX = pageW / 2;

    async function qrDataUrl(text) {
      if (window.QRCode && typeof window.QRCode.toDataURL === "function") {
        return window.QRCode.toDataURL(text, {
          margin: 2,
          width: 700,
          errorCorrectionLevel: "H"
        });
      }

      try {
        const url = "https://api.qrserver.com/v1/create-qr-code/?size=700x700&data=" + encodeURIComponent(text);
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

    async function imageDataUrl(url) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return null;

        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn("No se pudo cargar imagen:", url, err);
        return null;
      }
    }

    const tracking = data.tracking || generarTrackingInterno();
    const qrText = data.qrUrl || `${getTrackingBaseUrl()}?tracking=${encodeURIComponent(tracking)}`;
    const qr = await qrDataUrl(qrText);
    const barcode = await generarBarcodeCode128(tracking);
    const logoRio = await imageDataUrl(PDF_LOGO_URL);

    const tipoEnvio = data.tipoEnvio || "";
    const estado = data.estado || "";
    const remitente = data.remitente || {};
    const destinatario = data.destinatario || {};
    const transporte = data.transporte || {};
    const fecha = data.fecha || fechaHoyAR();
    const responsable = data.impresoPor || "";

    function resetColors() {
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      doc.setFillColor(255, 255, 255);
    }

    function drawSection(title, x, y, w, fontSize = 8.2) {
      doc.setDrawColor(0, 0, 0);
      doc.setFillColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.rect(x, y, w, 7, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      doc.text(title, x + 3, y + 5);

      resetColors();
    }

    function drawRow(label, value, x, y, w, h = 7.5, label2 = "", value2 = "", label3 = "", value3 = "", opts = {}) {
      resetColors();
      doc.setLineWidth(0.22);
      doc.rect(x, y, w, h);

      const labelW = opts.labelW || 31;
      const fs = opts.fontSize || 6.5;
      const valueFs = opts.valueFontSize || fs;
      const valueFontStyle = opts.valueFontStyle || "normal";
      doc.line(x + labelW, y, x + labelW, y + h);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(fs);
      doc.text(String(label || ""), x + 2, y + h - 2.4);

      const x2Start = x + w * 0.60;
      const x3Start = x + w * 0.78;
      const value1MaxWidth = label2
        ? Math.max(16, (label3 ? x2Start : x2Start) - (x + labelW + 5))
        : w - labelW - 5;

      doc.setFont("helvetica", "normal");
      doc.setFont("helvetica", valueFontStyle);
      doc.setFontSize(valueFs);
      doc.text(String(value || ""), x + labelW + 3, y + h - 2.4, {
        maxWidth: value1MaxWidth
      });

      if (label2) {
        const x2 = label3 ? x2Start : x + w * 0.58;
        const label2W = label3 ? 10 : 26;
        doc.line(x2, y, x2, y + h);
        doc.line(x2 + label2W, y, x2 + label2W, y + h);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs);
        doc.text(String(label2), x2 + 2, y + h - 2.4);

        doc.setFont("helvetica", valueFontStyle);
        const value2MaxWidth = label3
          ? Math.max(8, x3Start - (x2 + label2W + 4))
          : Math.max(12, (x + w) - (x2 + label2W + 4));
        doc.setFontSize(valueFs);
        doc.text(String(value2 || ""), x2 + label2W + 2, y + h - 2.4, {
          maxWidth: value2MaxWidth
        });
      }

      if (label3) {
        const x3 = x3Start;
        const label3W = 14;
        doc.line(x3, y, x3, y + h);
        doc.line(x3 + label3W, y, x3 + label3W, y + h);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs);
        doc.text(String(label3), x3 + 2, y + h - 2.4);

        doc.setFont("helvetica", valueFontStyle);
        const value3MaxWidth = Math.max(8, (x + w) - (x3 + label3W + 4));
        doc.setFontSize(valueFs);
        doc.text(String(value3 || ""), x3 + label3W + 2, y + h - 2.4, {
          maxWidth: value3MaxWidth
        });
      }
    }

    function textoPDF(value) {
      return String(value || "").trim().toLocaleUpperCase("es-AR");
    }

    function tipoEnvioPDF(value) {
      const tipo = textoPDF(value).replace(/_/g, " ");

      if (tipo.includes("SHIPNOW") && tipo.includes("OCA")) return "SHIPNOW - SUCURSAL OCA";
      if (tipo.includes("SHIPNOW") && tipo.includes("DOMICILIO")) return "SHIPNOW - DOMICILIO";

      return tipo;
    }

    function drawRoundedRect(x, y, w, h, r, style = "S") {
      if (typeof doc.roundedRect === "function") {
        doc.roundedRect(x, y, w, h, r, r, style);
        return;
      }

      doc.rect(x, y, w, h, style);
    }

    function drawFitText(text, x, y, maxW, size, style = "bold", color = [0, 0, 0]) {
      const value = textoPDF(text);
      let fontSize = size;

      doc.setFont("helvetica", style);
      doc.setFontSize(fontSize);
      while (fontSize > 6 && doc.getTextWidth(value) > maxW) {
        fontSize -= 0.35;
        doc.setFontSize(fontSize);
      }

      doc.setTextColor(...color);
      doc.setFontSize(fontSize);
      doc.text(value, x, y, { maxWidth: maxW });
      resetColors();
    }

    function drawMethodBadge(x, y, w, h, text) {
      doc.setFillColor(255, 241, 242);
      drawRoundedRect(x, y, w, h, 2.8, "F");
      doc.setFillColor(242, 111, 120);
      drawRoundedRect(x, y, 2.7, h, 1.4, "F");
      drawFitText(text, x + 5, y + 6.3, w - 8, 10.2, "bold", [22, 22, 22]);
    }

    function drawSoftSection(title, x, y, w) {
      doc.setFillColor(244, 245, 247);
      drawRoundedRect(x, y, w, 10, 2.4, "F");
      doc.setFillColor(242, 111, 120);
      drawRoundedRect(x, y, 2.7, 10, 1.4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.2);
      doc.setTextColor(22, 22, 22);
      doc.text(textoPDF(title), x + 5.4, y + 6.7);
      resetColors();
    }

    function drawModernRow(x, y, w, h, items, valueSize = 10.2) {
      doc.setDrawColor(214, 220, 227);
      doc.setLineWidth(0.25);
      doc.line(x, y, x + w, y);

      const colW = w / items.length;
      items.forEach((item, index) => {
        const [label, value, strong = true] = item;
        const colX = x + index * colW;

        if (index) {
          doc.setDrawColor(237, 240, 243);
          doc.line(colX, y + 2, colX, y + h - 2);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(102, 112, 133);
        doc.text(textoPDF(label), colX + 3, y + 4.6);

        drawFitText(
          value,
          colX + 3,
          y + h - 1.6,
          colW - 6,
          strong ? valueSize : valueSize - 1.4,
          strong ? "bold" : "normal",
          [22, 22, 22]
        );
      });

      resetColors();
    }

    function drawLabel(x, y, modoGrande = false) {
      resetColors();

      const w = modoGrande ? 276 : 136;
      const h = labelH;
      const innerX = x + (modoGrande ? 12 : 8);
      const innerW = w - (modoGrande ? 24 : 16);

      const qrEnabled = !esEstadoFinalSeguimiento(estado);

      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, h, "F");
      doc.setLineWidth(0.5);
      doc.rect(x, y, w, h);

      if (modoGrande) {
        // =========================
        // RÓTULO ÚNICO A4 HORIZONTAL - TRANSPORTE / EXPRESO
        // =========================
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16.5);
        doc.setTextColor(22, 22, 22);
        doc.text("DESPACHO DE PEDIDO", innerX, y + 14);

        doc.setDrawColor(242, 111, 120);
        doc.setLineWidth(0.55);
        doc.line(innerX, y + 19, innerX + 62, y + 19);

        drawMethodBadge(innerX, y + 24, 72, 11, tipoEnvioPDF(tipoEnvio));

        doc.setFillColor(0, 0, 0);
        drawRoundedRect(x + w / 2 - 39, y + 8, 78, 13, 2.4, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10.6);
        doc.text(tracking, x + w / 2, y + 16.5, { align: "center" });
        resetColors();

        const headerBarcodeW = 78;
        const headerBarcodeH = 12;
        const headerBarcodeX = x + w - 92;
        const headerBarcodeY = y + 16;
        const headerBarcodeCenterX = headerBarcodeX + headerBarcodeW / 2;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(102, 112, 133);
        doc.text("CÓDIGO DE BARRAS", headerBarcodeCenterX, headerBarcodeY - 3, { align: "center" });
        doc.addImage(barcode, "PNG", headerBarcodeX, headerBarcodeY, headerBarcodeW, headerBarcodeH);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.3);
        doc.setTextColor(22, 22, 22);

        doc.setDrawColor(214, 220, 227);
        doc.setLineWidth(0.25);
        doc.line(innerX, y + 40, innerX + innerW, y + 40);

        if (logoRio) {
          doc.addImage(logoRio, "PNG", innerX, y + 49, 42, 20.4);
        } else {
          doc.setFont("times", "italic");
          doc.setFontSize(20);
          doc.text("Lencería", innerX + 4, y + 59);
          doc.setFont("times", "bold");
          doc.setFontSize(30);
          doc.text("RÍO", innerX + 8, y + 73);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.2);
        doc.setTextColor(22, 22, 22);
        doc.text("REMITENTE", innerX + 54, y + 48);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.8);
        doc.text("LENCERIA RIO", innerX + 54, y + 56);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.3);
        doc.text(textoPDF(remitente.domicilio), innerX + 54, y + 63);
        doc.text(`${textoPDF(remitente.localidad)}${remitente.cp ? `, CP ${textoPDF(remitente.cp)}` : ""}`, innerX + 54, y + 70);
        doc.text(`TEL. ${textoPDF(remitente.telefono)}`, innerX + 54, y + 77);

        const qrX = x + w - 54;
        const qrY = y + 46;
        const qrSize = 30;

        if (qrEnabled) {
          doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
        } else {
          doc.rect(qrX, qrY, qrSize, qrSize);
          doc.line(qrX, qrY, qrX + qrSize, qrY + qrSize);
          doc.line(qrX + qrSize, qrY, qrX, qrY + qrSize);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.8);
        doc.setTextColor(102, 112, 133);
        doc.text("SEGUIMIENTO", qrX + qrSize / 2, qrY + qrSize + 7, { align: "center" });

        const destY = y + 86;
        drawSoftSection("DATOS DEL DESTINATARIO", innerX, destY, innerW);

        const destRowH = 10.5;
        const firstDestRowY = destY + 10;
        drawModernRow(innerX, firstDestRowY, innerW, destRowH, [["NOMBRE COMPLETO", destinatario.nombre, true]], 12);
        drawModernRow(innerX, firstDestRowY + destRowH, innerW, destRowH, [["DNI/CUIL", destinatario.dni, true], ["TELEFONO", destinatario.telefono, true]], 10.8);
        drawModernRow(innerX, firstDestRowY + destRowH * 2, innerW, destRowH, [["DOMICILIO", destinatario.domicilio, true]], 11.6);
        drawModernRow(innerX, firstDestRowY + destRowH * 3, innerW, destRowH, [["ENTRECALLES", destinatario.entrecalles, false]], 10);
        drawModernRow(innerX, firstDestRowY + destRowH * 4, innerW, destRowH, [["LOCALIDAD", destinatario.localidad, true], ["CP", destinatario.cp, true], ["PROVINCIA", destinatario.provincia, true]], 10.4);

        const transY = y + 151;
        drawSoftSection("DATOS DEL TRANSPORTE", innerX, transY, innerW);
        drawModernRow(innerX, transY + 10, innerW, 11, [["TRANSPORTE", transporte.nombre || "A DESIGNAR", true], ["GUIA/COD.", transporte.guia || "A DESIGNAR", true]], 9.2);
        drawModernRow(innerX, transY + 21, innerW, 11, [["FECHA", fecha, false], ["IMPRESO POR", responsable, true]], 8.8);

        return;
      }

      // =========================
      // RÓTULO DOBLE - SHIPNOW / OCA
      // =========================
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(22, 22, 22);
      doc.text("DESPACHO DE PEDIDO", innerX, y + 12);

      doc.setFillColor(0, 0, 0);
      drawRoundedRect(x + w - 67, y + 7, 63, 12, 2.2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9.7);
      doc.text(tracking, x + w - 35.5, y + 14.8, { align: "center" });
      resetColors();

      doc.setDrawColor(242, 111, 120);
      doc.setLineWidth(0.45);
      doc.line(innerX, y + 16, innerX + 43, y + 16);

      drawMethodBadge(innerX, y + 20, 47, 9, tipoEnvioPDF(tipoEnvio));

      doc.setDrawColor(214, 220, 227);
      doc.setLineWidth(0.25);
      doc.line(innerX, y + 35, innerX + innerW, y + 35);

      if (logoRio) {
        doc.addImage(logoRio, "PNG", x + 8, y + 49, 32, 15.5);
      } else {
        doc.setFont("times", "italic");
        doc.setFontSize(15);
        doc.text("Lencería", x + 10, y + 55);
        doc.setFont("times", "bold");
        doc.setFontSize(22);
        doc.text("RÍO", x + 13, y + 66);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(22, 22, 22);
      doc.text("REMITENTE", x + 47, y + 48);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.3);
      doc.text("LENCERIA RIO", x + 47, y + 54);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.7);
      doc.text(textoPDF(remitente.domicilio), x + 47, y + 60);
      doc.text(`${textoPDF(remitente.localidad)}${remitente.cp ? `, CP ${textoPDF(remitente.cp)}` : ""}`, x + 47, y + 66);
      doc.text(`TEL. ${textoPDF(remitente.telefono)}`, x + 47, y + 72);

      const qrX = x + w - 38;
      const qrY = y + 43;
      const qrSize = 30;

      if (qrEnabled) {
        doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
      } else {
        doc.rect(qrX, qrY, qrSize, qrSize);
        doc.line(qrX, qrY, qrX + qrSize, qrY + qrSize);
        doc.line(qrX + qrSize, qrY, qrX, qrY + qrSize);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.2);
      doc.setTextColor(102, 112, 133);
      doc.text("SEGUIMIENTO", qrX + qrSize / 2, qrY + qrSize + 7, { align: "center" });

      const destY = y + 76;
      drawSoftSection("DATOS DEL DESTINATARIO", innerX, destY, innerW);

      const rowH = 11.2;
      const firstRowY = destY + 10;
      drawModernRow(innerX, firstRowY, innerW, rowH, [["NOMBRE COMPLETO", destinatario.nombre, true]], 11.8);
      drawModernRow(innerX, firstRowY + rowH, innerW, rowH, [["MAIL", destinatario.mail, true]], 9.8);
      drawModernRow(innerX, firstRowY + rowH * 2, innerW, rowH, [["DNI/CUIL", destinatario.dni, true], ["TELEFONO", destinatario.telefono, true]], 10.8);
      if (esShipnowOca) {
        drawModernRow(innerX, firstRowY + rowH * 3, innerW, rowH, [["DIRECCIÓN OCA", destinatario.direccionOca, true]], 11.5);
        drawModernRow(innerX, firstRowY + rowH * 4, innerW, rowH, [["LOCALIDAD", destinatario.localidad, true], ["CP", destinatario.cp, true]], 10.6);
        drawModernRow(innerX, firstRowY + rowH * 5, innerW, rowH, [["PROVINCIA", destinatario.provincia, true]], 10.6);
      } else {
        drawModernRow(innerX, firstRowY + rowH * 3, innerW, rowH, [["DOMICILIO", destinatario.domicilio, true]], 11.5);
        drawModernRow(innerX, firstRowY + rowH * 4, innerW, rowH, [["ENTRECALLES", destinatario.entrecalles, false]], 10);
        drawModernRow(innerX, firstRowY + rowH * 5, innerW, rowH, [["LOCALIDAD", destinatario.localidad, true], ["CP", destinatario.cp, true]], 10.6);
        drawModernRow(innerX, firstRowY + rowH * 6, innerW, rowH, [["PROVINCIA", destinatario.provincia, true]], 10.6);
      }

      const barcodeTitleY = y + 170;
      const barcodeY = y + 174;
      const barcodeX = x + 32;
      const barcodeW = w - 64;
      const barcodeH = 12;

      doc.setFillColor(255, 255, 255);
      doc.rect(innerX, barcodeTitleY - 5, innerW, 24, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(102, 112, 133);
      doc.text("CÓDIGO DE BARRAS", x + w / 2, barcodeTitleY, { align: "center" });

      doc.addImage(barcode, "PNG", barcodeX, barcodeY, barcodeW, barcodeH);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.3);
      doc.setTextColor(22, 22, 22);
      doc.text(tracking, x + w / 2, barcodeY + barcodeH + 5, { align: "center" });
      resetColors();
    }

    drawLabel(labelX1, labelY, esTransporte);

    if (!esTransporte) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(cutX, 5, cutX, pageH - 5);
      doc.setLineDashPattern([], 0);

      drawLabel(labelX2, labelY, false);
    }

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
