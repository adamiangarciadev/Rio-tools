;(() => {
  "use strict";
  const API_LECTURA_URL = "https://script.google.com/macros/s/AKfycbyHeHtA935aruQE6YsBM0lTp51_TWdNqMkz1CEfQ9Cem_uKKse9xOeRdezzD65riCaq/exec";
  const API_ESCRITURA_URL = "https://script.google.com/macros/s/AKfycbyjV61vxornSXgFNt10L-IohoU2Bp002flTPV7LMjCr-PFGA98rFx_sgBQbB72zfEvR/exec";
  const LS_SUCURSAL = "mercaderia_transito_sucursal";
  const CSV_FILES = ["../../data/equivalencia.csv", "../../data/equivalencia2.csv"];
  const BACKUP_ROOT_FOLDER_ID = "1HoQBiMRvflZuyLtCaJyRBWio1C5i6ofH";
  const SCRIPT_URL_PICKING_TRANSITO = "https://script.google.com/macros/s/AKfycbw8AmleDr1QUztLFUMBcmhOIglNKdp3AVXc_N8W81GshcOEKK2jGzX3-68ZYajI30-bRg/exec";
  const GRUPO_1 = ["AVELLANEDA 2", "NAZCA", "LAMARCA"];
  const GRUPO_2 = ["CORRIENTES", "CASTELLI", "PUEYRREDON"];
  const SIEMPRE_SARMIENTO = ["QUILMES"];
  const SARMIENTO = "SARMIENTO";
  const DEPOSITO = "DEPOSITO";
  const AUTOCOMMIT_IDLE_MS = 80;
  const MIN_LEN_FOR_COMMIT = 3;
  const MAX_SCANS = 5000;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = {
    sucursalSelect: $("#sucursalSelect"),
    refreshBtn: $("#refreshBtn"),
    estadoCarga: $("#estadoCarga"),
    cardsWrap: $("#cardsWrap"),
    searchRemito: $("#searchRemito"),
    modalDif: $("#modalDif"),
    cerrarModalBtn: $("#cerrarModalBtn"),
    guardarDifBtn: $("#guardarDifBtn"),
    difRemito: $("#difRemito"),
    difObs: $("#difObs"),
    difFiles: $("#difFiles"),
    filesPreview: $("#filesPreview"),
    modalPdf: $("#modalPdf"),
    cerrarPdfModalBtn: $("#cerrarPdfModalBtn"),
    pdfModalTitle: $("#pdfModalTitle"),
    pdfViewerFrame: $("#pdfViewerFrame"),
    modalPicking: $("#modalPicking"),
    cerrarPickingModalBtn: $("#cerrarPickingModalBtn"),
    pickingRemito: $("#pickingRemito"),
    pickingSucursal: $("#pickingSucursal"),
    pickingCodigo: $("#pickingCodigo"),
    pickingScanInput: $("#pickingScanInput"),
    pickingScanCount: $("#pickingScanCount"),
    pickingNoti: $("#pickingNoti"),
    pickingLastScans: $("#pickingLastScans"),
    pickingPickList: $("#pickingPickList"),
    pickingArtCounter: $("#pickingArtCounter"),
    resetPickingBtn: $("#resetPickingBtn"),
    descargarPickingBtn: $("#descargarPickingBtn"),
  };
  const state = {
    sucursal: localStorage.getItem(LS_SUCURSAL) || "",
    remitos: [],
    remitoActivo: null,
    search: "",
    picking: {
      remito: null,
      scans: [],
      scanSeq: 0,
      byCode: new Map(),
      rows: [],
      csvLoaded: false,
      csvError: "",
      audioCtx: null,
      scanTimer: null,
    },
  };
  init();
  async function init() {
    bindEvents();
    await Promise.all([
      cargarSucursales(),
      cargarEquivalenciasPicking()
    ]);
    await cargarRemitos();
  }
  function bindEvents() {
    if (el.sucursalSelect) {
      el.sucursalSelect.addEventListener("change", async () => {
        state.sucursal = canonSucursal(el.sucursalSelect.value);
        localStorage.setItem(LS_SUCURSAL, state.sucursal);
        await cargarRemitos();
      });
    }
    if (el.refreshBtn) {
      el.refreshBtn.addEventListener("click", cargarRemitos);
    }
    if (el.searchRemito) {
      el.searchRemito.addEventListener("input", () => {
        state.search = String(el.searchRemito.value || "").trim().toUpperCase();
        renderRemitos();
      });
    }
    if (el.cerrarModalBtn) {
      el.cerrarModalBtn.addEventListener("click", cerrarModal);
    }
    if (el.modalDif) {
      el.modalDif.addEventListener("click", (e) => {
        if (e.target === el.modalDif) cerrarModal();
      });
    }
    if (el.difFiles) {
      el.difFiles.addEventListener("change", renderFilesPreview);
    }
    if (el.guardarDifBtn) {
      el.guardarDifBtn.addEventListener("click", guardarDiferencias);
    }
    if (el.cerrarPdfModalBtn) {
      el.cerrarPdfModalBtn.addEventListener("click", cerrarPdfModal);
    }
    if (el.modalPdf) {
      el.modalPdf.addEventListener("click", (e) => {
        if (e.target === el.modalPdf) cerrarPdfModal();
      });
    }
    if (el.cerrarPickingModalBtn) {
      el.cerrarPickingModalBtn.addEventListener("click", cerrarPickingModal);
    }
    if (el.modalPicking) {
      el.modalPicking.addEventListener("click", (e) => {
        if (e.target === el.modalPicking) cerrarPickingModal();
      });
    }
    if (el.resetPickingBtn) {
      el.resetPickingBtn.addEventListener("click", () => resetPickingScans());
    }
    if (el.descargarPickingBtn) {
      el.descargarPickingBtn.addEventListener("click", descargarPickingTxt);
    }
    if (el.pickingPickList) {
      el.pickingPickList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del-id]");
        if (!btn) return;
        const id = Number(btn.getAttribute("data-del-id"));
        if (!Number.isFinite(id)) return;
        deletePickingScanById(id);
      });
    }
    if (el.pickingScanInput) {
      el.pickingScanInput.addEventListener("keydown", (e) => {
        ensurePickingAudio();
        if (e.key === "Enter") {
          e.preventDefault();
          const code = (el.pickingScanInput.value || "").trim();
          processPickingScan(code);
          el.pickingScanInput.value = "";
          el.pickingScanInput.focus();
          clearTimeout(state.picking.scanTimer);
          state.picking.scanTimer = null;
          return;
        }
        schedulePickingAutoCommit();
      });
      el.pickingScanInput.addEventListener("input", () => {
        ensurePickingAudio();
        schedulePickingAutoCommit();
      });
    }
  }
  async function leerRespuestaJson(res, mensajeError) {
    const texto = await res.text();
    let data;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch (_) {
      const esHtml = /^\s*</.test(texto) || /text\/html/i.test(res.headers.get("content-type") || "");
      throw new Error(esHtml
        ? `${mensajeError}. El servidor devolvió una página de error; intentá nuevamente en unos segundos.`
        : `${mensajeError}. La respuesta del servidor no es válida.`
      );
    }
    if (!res.ok) {
      throw new Error(data?.error || `${mensajeError} (HTTP ${res.status})`);
    }
    if (!data || typeof data !== "object") {
      throw new Error(`${mensajeError}. El servidor devolvió una respuesta vacía.`);
    }
    return data;
  }
  async function cargarSucursales() {
    try {
      const res = await fetch(`${API_LECTURA_URL}?accion=sucursales`);
      const data = await leerRespuestaJson(res, "No se pudieron cargar las sucursales");
      if (!data.ok) throw new Error(data.error || "Error al cargar sucursales");
      const sucursalesRaw = Array.isArray(data.sucursales) ? data.sucursales : [];
      const sucursales = [...new Set(sucursalesRaw.map(canonSucursal).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es")
      );
      if (el.sucursalSelect) {
        el.sucursalSelect.innerHTML =
          `<option value="">Elegí sucursal</option>` +
          sucursales.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
      }
      if (state.sucursal && sucursales.includes(canonSucursal(state.sucursal))) {
        state.sucursal = canonSucursal(state.sucursal);
        if (el.sucursalSelect) el.sucursalSelect.value = state.sucursal;
      } else if (sucursales.length) {
        state.sucursal = sucursales[0];
        if (el.sucursalSelect) el.sucursalSelect.value = state.sucursal;
        localStorage.setItem(LS_SUCURSAL, state.sucursal);
      }
    } catch (err) {
      if (el.estadoCarga) {
        el.estadoCarga.textContent = `Error cargando sucursales: ${err.message}`;
      }
    }
  }
  async function cargarEquivalenciasPicking() {
    state.picking.byCode.clear();
    state.picking.rows = [];
    state.picking.csvLoaded = false;
    state.picking.csvError = "";
    const jobs = CSV_FILES.map(async (file) => {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) throw new Error(`${file} HTTP ${res.status}`);
      const text = await res.text();
      const data = parseCSV(text);
      addToPickingIndex(data, true);
      state.picking.rows = state.picking.rows.concat(data);
      return data.length;
    });
    const results = await Promise.allSettled(jobs);
    const okCount = results.filter(r => r.status === "fulfilled").length;
    if (okCount > 0) {
      state.picking.csvLoaded = true;
      state.picking.csvError = okCount === CSV_FILES.length
        ? ""
        : "Se cargaron equivalencias parciales.";
      return;
    }
    const firstError = results.find(r => r.status === "rejected");
    state.picking.csvError = firstError?.reason?.message || "No se pudieron cargar equivalencias";
  }
  async function cargarRemitos() {
    if (!state.sucursal) {
      if (el.cardsWrap) {
        el.cardsWrap.innerHTML = `<div class="empty">Seleccioná una sucursal.</div>`;
      }
      return;
    }
    if (el.estadoCarga) {
      el.estadoCarga.textContent = `Cargando remitos de ${state.sucursal}...`;
    }
    try {
      const res = await fetch(`${API_LECTURA_URL}?accion=listar&sucursal=${encodeURIComponent(state.sucursal)}`);
      const data = await leerRespuestaJson(res, "No se pudieron cargar los remitos");
      if (!data.ok) throw new Error(data.error || "No se pudieron cargar los remitos");
      state.remitos = (data.remitos || []).map(normalizarRemito);
      renderRemitos();
      if (el.estadoCarga) {
        el.estadoCarga.textContent = `Actualizado: ${new Date().toLocaleTimeString("es-AR")}`;
      }
    } catch (err) {
      if (el.estadoCarga) {
        el.estadoCarga.textContent = `Error: ${err.message}`;
      }
      if (el.cardsWrap) {
        el.cardsWrap.innerHTML = `<div class="empty">No se pudo cargar la información.</div>`;
      }
    }
  }
  function normalizarRemito(r) {
    return {
      ...r,
      fecha: r.fecha || "",
      remito: String(r.remito || "").trim(),
      desde: canonSucursal(r.desde || ""),
      hacia: canonSucursal(r.hacia || ""),
      total_prendas: r.total_prendas || "",
      estado: canonEstado(r.estado || ""),
      observacion: r.observacion || "",
      carpeta_url: r.carpeta_url || "",
      file_id: String(r.file_id || "").trim(),
      cod_recibe_sarmiento: String(r.cod_recibe_sarmiento || "").trim(),
      cod_envia_sarmiento: String(r.cod_envia_sarmiento || "").trim(),
      cod_recibe_sucursal: String(r.cod_recibe_sucursal || "").trim(),
      cod_cierre: String(r.cod_cierre || "").trim(),
      tipo_cierre: String(r.tipo_cierre || "").trim(),
    };
  }
  function renderRemitos() {
    const visibles = state.remitos
      .filter(remitoDebeMostrarse)
      .filter(remitoCoincideBusqueda)
      .sort(ordenarRemitos);
    if (!visibles.length) {
      if (el.cardsWrap) {
        el.cardsWrap.innerHTML = `<div class="empty">No hay remitos pendientes para esta sucursal.</div>`;
      }
      return;
    }
    if (!el.cardsWrap) return;
    el.cardsWrap.innerHTML = visibles.map(r => {
      const etapa = resolverEtapaUI(r, state.sucursal);
      const badge = resolverBadge(etapa.codigo);
      const acciones = renderAcciones(r, etapa);
      const auditoria = renderAuditoria(r);
      const permitePicking = puedeRealizarPicking(r, etapa);
      return `
        <article class="card">
          <div class="card-left">
            ${permitePicking ? `
              <button
                class="btn secondary btn-picking-trigger"
                data-action="realizar-picking"
                data-remito="${escapeAttr(r.remito)}"
              >
                REALIZAR PICKING
              </button>
            ` : ""}
            <div class="card-title-row">
              <h3>Remito ${escapeHtml(r.remito)}</h3>
              ${r.file_id ? `
                <button
                  class="btn view"
                  data-action="ver-pdf"
                  data-remito="${escapeAttr(r.remito)}"
                  data-fileid="${escapeAttr(r.file_id)}"
                >
                  VER
                </button>
              ` : ""}
            </div>
            <span class="badge ${badge.className}">${escapeHtml(badge.text)}</span>
          </div>
          <div class="card-center">
            <div class="info">
              <span class="label">Fecha</span>
              <strong>${escapeHtml(r.fecha || "-")}</strong>
            </div>
            <div class="info">
              <span class="label">Desde</span>
              <strong>${escapeHtml(r.desde || "-")}</strong>
            </div>
            <div class="info">
              <span class="label">Hacia</span>
              <strong>${escapeHtml(r.hacia || "-")}</strong>
            </div>
            <div class="info">
              <span class="label">Prendas</span>
              <strong>${escapeHtml(String(r.total_prendas || "-"))}</strong>
            </div>
            <div class="info">
              <span class="label">Circuito</span>
              <strong>${requiereSarmiento(r.desde, r.hacia) ? "CON SARMIENTO" : "DIRECTO"}</strong>
            </div>
            <div class="info">
              <span class="label">Etapa actual</span>
              <strong>${escapeHtml(etapa.label)}</strong>
            </div>
          </div>
          <div class="card-right">
            ${acciones}
          </div>
        </article>
        ${(r.observacion || r.carpeta_url || auditoria) ? `
          <div class="extra">
            ${r.observacion ? `<div><strong>Obs:</strong> ${escapeHtml(r.observacion)}</div>` : ""}
            ${r.carpeta_url ? `<div><a href="${escapeAttr(r.carpeta_url)}" target="_blank" rel="noopener noreferrer">Ver carpeta</a></div>` : ""}
            ${auditoria}
          </div>
        ` : ""}
      `;
    }).join("");
    bindActionButtons();
  }
  function renderAuditoria(r) {
    const filas = [];
    if (r.cod_recibe_sarmiento) {
      filas.push(`<div><strong>Recibió en Sarmiento:</strong> ${escapeHtml(r.cod_recibe_sarmiento)}</div>`);
    }
    if (r.cod_envia_sarmiento) {
      filas.push(`<div><strong>Envió desde Sarmiento:</strong> ${escapeHtml(r.cod_envia_sarmiento)}</div>`);
    }
    if (r.cod_recibe_sucursal) {
      filas.push(`<div><strong>Recibió en sucursal:</strong> ${escapeHtml(r.cod_recibe_sucursal)}</div>`);
    }
    if (r.cod_cierre) {
      const tipo = r.tipo_cierre ? ` (${escapeHtml(r.tipo_cierre)})` : "";
      filas.push(`<div><strong>Cierre:</strong> ${escapeHtml(r.cod_cierre)}${tipo}</div>`);
    }
    return filas.join("");
  }
  function bindActionButtons() {
    if (!el.cardsWrap) return;
    el.cardsWrap.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        const remito = btn.dataset.remito;
        const nuevoEstado = btn.dataset.estado || "";
        const fileId = btn.dataset.fileid || "";
        if (action === "estado") {
          await actualizarEstado(remito, nuevoEstado);
        }
        if (action === "confirmar") {
          await confirmarOk(remito);
        }
        if (action === "diferencias") {
          abrirModal(remito);
        }
        if (action === "ver-pdf") {
          abrirPdfModal(remito, fileId);
        }
        if (action === "realizar-picking") {
          abrirPickingModal(remito);
        }
      });
    });
  }
  function renderAcciones(r, etapa) {
    if (!etapa.accion) return "";
    if (etapa.accion === "estado") {
      return `
        <button
          class="btn primary"
          data-action="estado"
          data-remito="${escapeAttr(r.remito)}"
          data-estado="${escapeAttr(etapa.nuevoEstado)}"
        >
          ${escapeHtml(etapa.boton)}
        </button>
      `;
    }
    if (etapa.accion === "decision_final") {
      return `
        <button class="btn ok" data-action="confirmar" data-remito="${escapeAttr(r.remito)}">
          CONFIRMADO OK
        </button>
        <button class="btn warn" data-action="diferencias" data-remito="${escapeAttr(r.remito)}">
          DIFERENCIAS
        </button>
      `;
    }
    if (etapa.accion === "editar_diferencias") {
      return `
        <button class="btn warn" data-action="diferencias" data-remito="${escapeAttr(r.remito)}">
          EDITAR DIFERENCIAS
        </button>
      `;
    }
    return "";
  }
  function remitoDebeMostrarse(r) {
    const suc = canonSucursal(state.sucursal);
    const origen = canonSucursal(r.desde);
    const destino = canonSucursal(r.hacia);
    const estado = canonEstado(r.estado);
    const usaSarmiento = requiereSarmiento(origen, destino);
    if (estado === "CONFIRMADO OK") return false;
    if (suc === SARMIENTO && origen === DEPOSITO) return false;
    if (!usaSarmiento) {
      return suc === destino;
    }
    if (suc === SARMIENTO) {
      return [
        "",
        "ENVIADO A SUCURSAL",
        "RECIBIDO EN SARMIENTO"
      ].includes(estado);
    }
    return suc === destino && [
      "ENVIADO A DESTINO",
      "RECIBIDO EN SUCURSAL",
      "DIFERENCIAS"
    ].includes(estado);
  }
  function remitoCoincideBusqueda(r) {
    const q = String(state.search || "").trim().toUpperCase();
    if (!q) return true;
    const texto = [
      r.remito || "",
      r.desde || "",
      r.hacia || "",
      r.estado || "",
      r.observacion || ""
    ]
      .join(" ")
      .toUpperCase();
    return texto.includes(q);
  }
  function resolverEtapaUI(r, sucursalActual) {
    const suc = canonSucursal(sucursalActual);
    const origen = canonSucursal(r.desde);
    const destino = canonSucursal(r.hacia);
    const estado = canonEstado(r.estado);
    const usaSarmiento = requiereSarmiento(origen, destino);
    if (!usaSarmiento) {
      if (estado === "" || estado === "ENVIADO A SUCURSAL") {
        return {
          codigo: "ENVIADO A SUCURSAL",
          label: "Esperando recepción en sucursal",
          accion: "estado",
          boton: "RECIBIDO EN SUCURSAL",
          nuevoEstado: "RECIBIDO EN SUCURSAL",
        };
      }
      if (estado === "RECIBIDO" || estado === "RECIBIDO EN SUCURSAL") {
        return {
          codigo: "RECIBIDO EN SUCURSAL",
          label: "Recibido en sucursal",
          accion: "decision_final",
        };
      }
      if (estado === "DIFERENCIAS") {
        return {
          codigo: "DIFERENCIAS",
          label: "Diferencias cargadas",
          accion: "editar_diferencias",
        };
      }
      return {
        codigo: estado || "PENDIENTE",
        label: estado || "Pendiente",
        accion: null,
      };
    }
    if (suc === SARMIENTO) {
      if (estado === "" || estado === "ENVIADO A SUCURSAL") {
        return {
          codigo: "ENVIADO A SUCURSAL",
          label: `En tránsito hacia ${SARMIENTO}`,
          accion: "estado",
          boton: "RECIBIDO EN SARMIENTO",
          nuevoEstado: "RECIBIDO EN SARMIENTO",
        };
      }
      if (estado === "RECIBIDO EN SARMIENTO") {
        return {
          codigo: "RECIBIDO EN SARMIENTO",
          label: `Listo para enviar a ${destino}`,
          accion: "estado",
          boton: `ENVIADO A ${destino}`,
          nuevoEstado: "ENVIADO A DESTINO",
        };
      }
      return {
        codigo: estado || "PENDIENTE",
        label: estado || "Pendiente",
        accion: null,
      };
    }
    if (suc === destino) {
      if (estado === "ENVIADO A DESTINO") {
        return {
          codigo: "ENVIADO A DESTINO",
          label: "En tránsito hacia sucursal final",
          accion: "estado",
          boton: "RECIBIDO EN SUCURSAL",
          nuevoEstado: "RECIBIDO EN SUCURSAL",
        };
      }
      if (estado === "RECIBIDO EN SUCURSAL" || estado === "RECIBIDO") {
        return {
          codigo: "RECIBIDO EN SUCURSAL",
          label: "Recibido en sucursal",
          accion: "decision_final",
        };
      }
      if (estado === "DIFERENCIAS") {
        return {
          codigo: "DIFERENCIAS",
          label: "Diferencias cargadas",
          accion: "editar_diferencias",
        };
      }
    }
    return {
      codigo: estado || "PENDIENTE",
      label: estado || "Pendiente",
      accion: null,
    };
  }
  function puedeRealizarPicking(r, etapa) {
    return canonSucursal(state.sucursal) === canonSucursal(r.hacia) &&
      canonEstado(etapa.codigo) === "RECIBIDO EN SUCURSAL";
  }
  function resolverBadge(codigo) {
    const c = canonEstado(codigo);
    if (c === "DIFERENCIAS") {
      return { className: "diferencias", text: "DIFERENCIAS" };
    }
    if (
      c === "RECIBIDO EN SUCURSAL" ||
      c === "RECIBIDO EN SARMIENTO" ||
      c === "ENVIADO A DESTINO" ||
      c === "ENVIADO A SUCURSAL"
    ) {
      return { className: "recibido", text: c };
    }
    return { className: "pendiente", text: c || "PENDIENTE" };
  }
  function ordenarRemitos(a, b) {
    const prioridad = (r) => {
      const e = canonEstado(r.estado);
      if (e === "DIFERENCIAS") return 1;
      if (e === "RECIBIDO EN SUCURSAL") return 2;
      if (e === "ENVIADO A DESTINO") return 3;
      if (e === "RECIBIDO EN SARMIENTO") return 4;
      if (e === "ENVIADO A SUCURSAL" || e === "") return 5;
      return 9;
    };
    const pa = prioridad(a);
    const pb = prioridad(b);
    if (pa !== pb) return pa - pb;
    return String(b.remito).localeCompare(String(a.remito), "es", { numeric: true });
  }
  async function actualizarEstado(remito, nuevoEstado) {
    const codigoPersonal = pedirCodigoPersonal(
      `${nuevoEstado} · Remito ${remito}\n\nIngresá el código de personal:`
    );
    if (!codigoPersonal) return;
    try {
      if (el.estadoCarga) {
        el.estadoCarga.textContent = `Actualizando remito ${remito}...`;
      }
      const res = await fetch(API_ESCRITURA_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "actualizarEstado",
          remito,
          sucursal: state.sucursal,
          nuevoEstado,
          codigoPersonal
        })
      });
      const data = await leerRespuestaJson(res, "No se pudo actualizar el estado");
      if (!data.ok) throw new Error(data.error || "No se pudo actualizar el estado");
      await cargarRemitos();
    } catch (err) {
      alert(err.message);
      await cargarRemitos();
    }
  }
  async function confirmarOk(remito) {
    if (!confirm(`¿Confirmar OK el remito ${remito}?`)) return;
    const codigoPersonal = pedirCodigoPersonal(
      `CONFIRMADO OK · Remito ${remito}\n\nIngresá el código de personal:`
    );
    if (!codigoPersonal) return;
    try {
      if (el.estadoCarga) {
        el.estadoCarga.textContent = `Confirmando remito ${remito}...`;
      }
      const res = await fetch(API_ESCRITURA_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "confirmarOk",
          remito,
          sucursal: state.sucursal,
          codigoPersonal
        })
      });
      const data = await leerRespuestaJson(res, "No se pudo confirmar el remito");
      if (!data.ok) throw new Error(data.error || "No se pudo confirmar");
      await cargarRemitos();
    } catch (err) {
      alert(err.message);
      await cargarRemitos();
    }
  }
  function abrirModal(remito) {
    state.remitoActivo = remito;
    const actual = state.remitos.find(x => String(x.remito) === String(remito));
    if (el.difRemito) el.difRemito.value = remito;
    if (el.difObs) el.difObs.value = actual?.observacion || "";
    if (el.difFiles) el.difFiles.value = "";
    if (el.filesPreview) el.filesPreview.innerHTML = "";
    if (el.modalDif) {
      el.modalDif.classList.remove("hidden");
    }
  }
  function cerrarModal() {
    if (el.modalDif) el.modalDif.classList.add("hidden");
    state.remitoActivo = null;
    if (el.difFiles) el.difFiles.value = "";
    if (el.filesPreview) el.filesPreview.innerHTML = "";
  }
  function abrirPdfModal(remito, fileId) {
    if (!fileId) {
      alert("Este remito no tiene archivo PDF asociado.");
      return;
    }
    if (el.pdfModalTitle) {
      el.pdfModalTitle.textContent = `Visualizar remito ${remito}`;
    }
    if (el.pdfViewerFrame) {
      el.pdfViewerFrame.src = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
    }
    if (el.modalPdf) {
      el.modalPdf.classList.remove("hidden");
    }
  }
  function cerrarPdfModal() {
    if (el.modalPdf) {
      el.modalPdf.classList.add("hidden");
    }
    if (el.pdfViewerFrame) {
      el.pdfViewerFrame.src = "";
    }
  }
  function abrirPickingModal(remito) {
    const actual = state.remitos.find(x => String(x.remito) === String(remito));
    state.picking.remito = actual || null;
    state.picking.scans = [];
    state.picking.scanSeq = 0;
    clearTimeout(state.picking.scanTimer);
    state.picking.scanTimer = null;
    if (el.pickingRemito) el.pickingRemito.value = actual?.remito || remito;
    if (el.pickingSucursal) el.pickingSucursal.value = state.sucursal || actual?.hacia || "";
    if (el.pickingCodigo) el.pickingCodigo.value = "";
    if (el.pickingScanInput) el.pickingScanInput.value = "";
    renderPickingLast();
    renderPickingList();
    renderPickingCounter();
    if (state.picking.csvError) {
      notePicking(`Atención: ${state.picking.csvError}`);
    } else if (!state.picking.csvLoaded) {
      notePicking("Cargando equivalencias...");
    } else {
      notePicking("Listo para pickear.");
    }
    if (el.modalPicking) {
      el.modalPicking.classList.remove("hidden");
    }
    setTimeout(() => el.pickingScanInput?.focus(), 0);
  }
  function cerrarPickingModal() {
    if (el.modalPicking) {
      el.modalPicking.classList.add("hidden");
    }
    state.picking.remito = null;
    resetPickingScans({ keepCodigo: false, silent: true });
    if (el.pickingCodigo) el.pickingCodigo.value = "";
  }
  function renderFilesPreview() {
    const files = Array.from((el.difFiles && el.difFiles.files) || []);
    if (!files.length) {
      if (el.filesPreview) el.filesPreview.innerHTML = "";
      return;
    }
    if (el.filesPreview) {
      el.filesPreview.innerHTML = files
        .map(f => `<div>${escapeHtml(f.name)} - ${(f.size / 1024 / 1024).toFixed(2)} MB</div>`)
        .join("");
    }
  }
  async function guardarDiferencias() {
    if (!state.remitoActivo) return;
    const codigoPersonal = pedirCodigoPersonal(
      `DIFERENCIAS · Remito ${state.remitoActivo}\n\nIngresá el código de personal:`
    );
    if (!codigoPersonal) return;
    try {
      if (el.guardarDifBtn) {
        el.guardarDifBtn.disabled = true;
        el.guardarDifBtn.textContent = "Guardando...";
      }
      const archivos = await Promise.all(
        Array.from((el.difFiles && el.difFiles.files) || []).map(fileToBase64Object)
      );
      const res = await fetch(API_ESCRITURA_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "guardarDiferencias",
          remito: state.remitoActivo,
          sucursal: state.sucursal,
          observacion: el.difObs ? el.difObs.value.trim() : "",
          archivos,
          codigoPersonal
        })
      });
      const data = await leerRespuestaJson(res, "No se pudieron guardar las diferencias");
      if (!data.ok) throw new Error(data.error || "No se pudieron guardar las diferencias");
      cerrarModal();
      await cargarRemitos();
    } catch (err) {
      alert(err.message);
    } finally {
      if (el.guardarDifBtn) {
        el.guardarDifBtn.disabled = false;
        el.guardarDifBtn.textContent = "Guardar diferencias";
      }
    }
  }
  function pedirCodigoPersonal(mensaje) {
    const value = window.prompt(mensaje, "");
    if (value === null) return "";
    const codigo = String(value || "").trim();
    if (!codigo) {
      alert("Tenés que ingresar un código de personal.");
      return "";
    }
    return codigo;
  }
  function fileToBase64Object(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1] || "";
        resolve({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function schedulePickingAutoCommit() {
    clearTimeout(state.picking.scanTimer);
    state.picking.scanTimer = setTimeout(() => {
      autoCommitPicking();
    }, AUTOCOMMIT_IDLE_MS);
  }
  function autoCommitPicking() {
    const code = String(el.pickingScanInput?.value || "").trim();
    if (code.length >= MIN_LEN_FOR_COMMIT) {
      processPickingScan(code);
      if (el.pickingScanInput) {
        el.pickingScanInput.value = "";
        el.pickingScanInput.focus();
      }
    }
    state.picking.scanTimer = null;
  }
  function processPickingScan(code) {
    const clean = String(code || "").trim();
    if (!clean) {
      flashPicking("err");
      return;
    }
    if (!state.picking.csvLoaded) {
      flashPicking("err");
      beepPickingError();
      notePicking(state.picking.csvError || "Todavía no se cargaron las equivalencias.");
      return;
    }
    const k = normalizeBarcode(clean);
    const hit = state.picking.byCode.has(k);
    state.picking.scans.unshift({
      id: ++state.picking.scanSeq,
      code: clean,
      ok: hit,
      time: new Date().toISOString()
    });
    if (state.picking.scans.length > MAX_SCANS) {
      state.picking.scans = state.picking.scans.slice(0, MAX_SCANS);
    }
    if (!hit) {
      flashPicking("err");
      beepPickingError();
      notePicking(`Sin equivalencia: ${clean}`);
    } else {
      flashPicking("ok");
      beepPickingOk();
      notePicking(`OK: ${clean}`);
    }
    renderPickingLast();
    renderPickingList();
    renderPickingCounter();
  }
  function deletePickingScanById(id) {
    const before = state.picking.scans.length;
    state.picking.scans = state.picking.scans.filter(s => s.id !== id);
    if (state.picking.scans.length !== before) {
      renderPickingLast();
      renderPickingList();
      renderPickingCounter();
      notePicking("Ítem eliminado.");
    }
  }
  function renderPickingLast() {
    const total = state.picking.scans.length;
    if (el.pickingScanCount) {
      el.pickingScanCount.textContent = `${total} escaneados`;
    }
    if (!el.pickingLastScans) return;
    el.pickingLastScans.innerHTML = state.picking.scans.slice(0, 10)
      .map(s => `<span class="${s.ok ? "ok" : "err"}">${s.ok ? "✓" : "✗"} ${escapeHtml(s.code)}</span>`)
      .join(" · ");
  }
  function renderPickingList() {
    if (!el.pickingPickList) return;
    if (!state.picking.scans.length) {
      el.pickingPickList.innerHTML = `<div style="padding:12px" class="muted">Sin escaneos.</div>`;
      return;
    }
    el.pickingPickList.innerHTML = state.picking.scans.map(s => `
      <div class="pick-row">
        <span class="pick-badge ${s.ok ? "ok" : "err"}" title="${s.ok ? "OK" : "NO"}">${s.ok ? "✓" : "✗"}</span>
        <span class="pick-code">${escapeHtml(s.code)}</span>
        <button class="pick-del" type="button" data-del-id="${s.id}">Eliminar</button>
      </div>
    `).join("");
  }
  function renderPickingCounter() {
    if (!el.pickingArtCounter) return;
    if (!state.picking.scans.length) {
      el.pickingArtCounter.innerHTML = `<div class="muted">Sin escaneos.</div>`;
      return;
    }
    const map = new Map();
    for (const scan of state.picking.scans) {
      const row = state.picking.byCode.get(normalizeBarcode(scan.code));
      if (!row) {
        const label = String(scan.code).trim();
        if (!map.has(label)) {
          map.set(label, {
            total: 0,
            variants: new Map([["SIN EQUIVALENCIA", 0]])
          });
        }
        const item = map.get(label);
        item.total += 1;
        item.variants.set("SIN EQUIVALENCIA", (item.variants.get("SIN EQUIVALENCIA") || 0) + 1);
        continue;
      }
      const articulo = getArticuloFromRow(row) || scan.code;
      const { color, talle } = getColorTalleFromRow(row);
      const artLabel = [articulo, color, talle].filter(Boolean).join(" ").trim() || articulo;
      const variantLabel = [color, talle].filter(Boolean).join(" · ") || "SIN VARIANTE";
      if (!map.has(artLabel)) {
        map.set(artLabel, { total: 0, variants: new Map() });
      }
      const item = map.get(artLabel);
      item.total += 1;
      item.variants.set(variantLabel, (item.variants.get(variantLabel) || 0) + 1);
    }
    const sorted = Array.from(map.entries())
      .sort((a, b) => (b[1].total - a[1].total) || String(a[0]).localeCompare(String(b[0])));
    el.pickingArtCounter.innerHTML = sorted.map(([artLabel, info]) => {
      const variantsHtml = Array.from(info.variants.entries())
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
        .map(([label, cnt]) => `
          <div class="art-variant">
            <div>${escapeHtml(label)}</div>
            <div><small>x</small> ${cnt}</div>
          </div>
        `).join("");
      return `
        <details class="art-item">
          <summary>
            <div class="art-sum-left">
              <span class="art-arrow">›</span>
              <span class="art-code">${escapeHtml(artLabel)}</span>
            </div>
            <span class="art-total">${info.total}</span>
          </summary>
          <div class="art-variants">${variantsHtml}</div>
        </details>
      `;
    }).join("");
  }
  function resetPickingScans({ keepCodigo = true, silent = false } = {}) {
    state.picking.scans = [];
    state.picking.scanSeq = 0;
    clearTimeout(state.picking.scanTimer);
    state.picking.scanTimer = null;
    if (el.pickingScanInput) {
      el.pickingScanInput.value = "";
    }
    if (!keepCodigo && el.pickingCodigo) {
      el.pickingCodigo.value = "";
    }
    renderPickingLast();
    renderPickingList();
    renderPickingCounter();
    if (!silent) {
      notePicking("Escaneo limpio. Listo para pickear.");
      el.pickingScanInput?.focus();
    }
  }
  async function descargarPickingTxt() {
    const remito = state.picking.remito;
    const codigoPersonal = String(el.pickingCodigo?.value || "").trim();
    if (!remito) {
      alert("No hay remito seleccionado para el picking.");
      return;
    }
    if (!codigoPersonal) {
      alert("Ingresá el código de la persona que realiza el picking.");
      el.pickingCodigo?.focus();
      return;
    }
    if (!state.picking.scans.length) {
      alert("Todavía no hay mercadería pickeada.");
      el.pickingScanInput?.focus();
      return;
    }
    const lines = state.picking.scans.slice().reverse().map(s => String(s.code));
    const content = lines.join("\n");
    const fileName = resolvePickingFilename(remito.remito, codigoPersonal);
    const folderName = canonSucursal(state.sucursal || remito.hacia || "");
    downloadTxt(fileName, content);
    notePicking(`Descargando ${fileName}...`);
    try {
      await enviarPickingAGoogleDrive({
        content,
        fileName,
        folderName,
        remito,
        codigoPersonal
      });
      notePicking(`TXT descargado y copia enviada a Drive: ${fileName}`);
    } catch (err) {
      notePicking(`TXT descargado, pero falló la copia a Drive: ${err.message}`);
    }
  }
  function resolvePickingFilename(remito, codigoPersonal) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fecha = `${yy}${mm}${dd}`;
    const sucursal = canonSucursal(state.sucursal || state.picking.remito?.hacia || "");
    const base = `${fecha} REM${remito} ${sucursal} PICKING RESP${codigoPersonal}`;
    return ensureTxt(sanitize(base));
  }
  async function enviarPickingAGoogleDrive({ content, fileName, folderName, remito, codigoPersonal }) {
    const scriptUrl = SCRIPT_URL_PICKING_TRANSITO;
    if (!scriptUrl) {
      throw new Error("No hay Apps Script configurado para guardar el picking.");
    }
    const payload = {
      content,
      fileName,
      folderName,
      mimeType: "text/plain",
      accion: "guardar_txt_transito_picking",
      backupRootFolderId: BACKUP_ROOT_FOLDER_ID,
      remito: remito.remito,
      sucursal: folderName,
      origen: remito.desde || "",
      destino: remito.hacia || "",
      codigoPersonal,
      totalEscaneados: state.picking.scans.length,
      fechaGeneracionIso: new Date().toISOString()
    };
    const res = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    if (data && data.ok === false) {
      throw new Error(data.error || "No se pudo guardar el TXT en Drive");
    }
    return data || { ok: true };
  }
  function downloadTxt(fileName, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function ensurePickingAudio() {
    if (!state.picking.audioCtx) {
      try {
        state.picking.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        state.picking.audioCtx = null;
      }
    }
  }
  function beepPickingError() {
    const audioCtx = state.picking.audioCtx;
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = 220;
    g.gain.value = 0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
    o.stop(audioCtx.currentTime + 0.25);
    if (navigator.vibrate) navigator.vibrate(80);
  }
  function beepPickingOk() {
    const audioCtx = state.picking.audioCtx;
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    o.stop(audioCtx.currentTime + 0.18);
  }
  function flashPicking(kind) {
    if (!el.pickingScanInput) return;
    el.pickingScanInput.classList.remove("ok", "err");
    void el.pickingScanInput.offsetWidth;
    el.pickingScanInput.classList.add(kind);
    setTimeout(() => el.pickingScanInput.classList.remove(kind), 220);
  }
  function notePicking(message) {
    if (el.pickingNoti) {
      el.pickingNoti.textContent = message || "";
    }
  }
  function addToPickingIndex(data, noOverride) {
    if (!data.length) return;
    const keys = Object.keys(data[0] || {});
    const codeKey = guessCodeColumn(keys);
    data.forEach(row => {
      const raw = row[codeKey];
      const normalized = normalizeBarcode(raw);
      if (!normalized) return;
      if (noOverride && state.picking.byCode.has(normalized)) return;
      state.picking.byCode.set(normalized, row);
    });
  }
  function guessCodeColumn(keys) {
    const forced = pickKey(keys, [
      "codigo_barras",
      "código",
      "codigo",
      "barcode",
      "ean",
      "lectura",
      "scan"
    ]);
    return forced || keys[0];
  }
  function getArticuloFromRow(row) {
    if (!row) return "";
    const keys = Object.keys(row);
    const artKey = pickKey(keys, ["articulo", "artículo"]);
    return artKey ? String(row[artKey] ?? "").trim() : "";
  }
  function getColorTalleFromRow(row) {
    if (!row) return { color: "", talle: "" };
    const keys = Object.keys(row);
    const desc1 = pickKey(keys, ["descripcion", "descripción"]);
    const desc2 = pickKey(keys, ["descripcion_2", "descripción_2"]);
    const color = desc1 ? String(row[desc1] ?? "").trim() : "";
    const talle = desc2 ? String(row[desc2] ?? "").trim() : "";
    const color2 = color || (
      pickKey(keys, ["color", "col"])
        ? String(row[pickKey(keys, ["color", "col"])] ?? "").trim()
        : ""
    );
    const talle2 = talle || (
      pickKey(keys, ["talle", "tamaño", "tamano", "size"])
        ? String(row[pickKey(keys, ["talle", "tamaño", "tamano", "size"])] ?? "").trim()
        : ""
    );
    return { color: color2, talle: talle2 };
  }
  function pickKey(keys, candidates) {
    const set = new Set(keys);
    for (const candidate of candidates) {
      if (set.has(candidate)) return candidate;
    }
    const wanted = candidates.map(normKey);
    for (const key of keys) {
      const normalized = normKey(key);
      if (wanted.some(w => normalized.includes(w))) return key;
    }
    return null;
  }
  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim();
  }
  function normalizeBarcode(value) {
    return String(value || "").trim().toUpperCase();
  }
  function parseCSV(text) {
    const lines = String(text).split(/\r?\n/).filter(line => line.length > 0);
    if (!lines.length) return [];
    const sep = detectDelimiter(lines[0], lines[1]);
    const rawHeaders = splitCSVLine(lines[0], sep);
    const seen = {};
    const headers = rawHeaders.map(header => {
      let key = String(header || "").trim();
      if (!key) key = "COL";
      if (seen[key]) {
        let n = 2;
        while (seen[`${key}_${n}`]) n++;
        key = `${key}_${n}`;
      }
      seen[key] = true;
      return key;
    });
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i], sep);
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = (cells[idx] ?? "").trim();
      });
      out.push(row);
    }
    return out;
  }
  function detectDelimiter(l1, l2 = "") {
    const candidates = [",", ";", "|", "\t"];
    const score = (line, ch) => {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const next = line[i + 1];
        if (c === '"') {
          if (inQuotes && next === '"') {
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (!inQuotes && c === ch) {
          count++;
        }
      }
      return count;
    };
    const totals = candidates.map(ch => score(l1, ch) + score(l2, ch));
    let best = 0;
    let bestIdx = 0;
    totals.forEach((n, idx) => {
      if (n > best) {
        best = n;
        bestIdx = idx;
      }
    });
    return best > 0 ? candidates[bestIdx] : ";";
  }
  function splitCSVLine(line, sep) {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === sep && !inQuotes) {
        out.push(current);
        current = "";
      } else {
        current += c;
      }
    }
    out.push(current);
    return out;
  }
  function requiereSarmiento(origen, destino) {
    const o = canonSucursal(origen);
    const d = canonSucursal(destino);
    if (!o || !d) return false;
    if (o === SARMIENTO || d === SARMIENTO) return false;
    if (o === DEPOSITO || d === DEPOSITO) return false;
    if (SIEMPRE_SARMIENTO.includes(o) || SIEMPRE_SARMIENTO.includes(d)) {
      return true;
    }
    const ambosGrupo1 = GRUPO_1.includes(o) && GRUPO_1.includes(d);
    const ambosGrupo2 = GRUPO_2.includes(o) && GRUPO_2.includes(d);
    if (ambosGrupo1 || ambosGrupo2) return false;
    return true;
  }
  function canonSucursal(valor) {
    const v = norm(valor);
    const alias = {
      "AVELLANEDA": "AVELLANEDA 2",
      "AVELLANEDA2": "AVELLANEDA 2",
      "AV 2": "AVELLANEDA 2",
      "AV2": "AVELLANEDA 2",
      "NAZCA": "NAZCA",
      "LAMARCA": "LAMARCA",
      "CORRIENTES": "CORRIENTES",
      "CASTELLI": "CASTELLI",
      "PUEY": "PUEYRREDON",
      "PUEYRREDON": "PUEYRREDON",
      "SARMIENTO": "SARMIENTO",
      "MORENO": "MORENO",
      "QUILMES": "QUILMES",
      "DEPOSITO": "DEPOSITO"
    };
    return alias[v] || v;
  }
  function canonEstado(valor) {
    const v = norm(valor);
    if (v === "RECIBIDO") return "RECIBIDO EN SUCURSAL";
    return v;
  }
  function norm(str) {
    return String(str || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }
  function ensureTxt(name) {
    return String(name).toLowerCase().endsWith(".txt") ? name : `${name}.txt`;
  }
  function sanitize(str) {
    return String(str || "").replace(/[\\/:*?"<>|]+/g, "_");
  }
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
})();
