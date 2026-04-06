;(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbyjV61vxornSXgFNt10L-IohoU2Bp002flTPV7LMjCr-PFGA98rFx_sgBQbB72zfEvR/exec";
  const LS_SUCURSAL = "mercaderia_transito_sucursal";

  const GRUPO_1 = ["AVELLANEDA 2", "NAZCA", "LAMARCA"];
  const GRUPO_2 = ["CORRIENTES", "CASTELLI", "PUEYRREDON"];
  const SIEMPRE_SARMIENTO = ["MORENO", "QUILMES"];
  const SARMIENTO = "SARMIENTO";
  const DEPOSITO = "DEPOSITO";

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
  };

  const state = {
    sucursal: localStorage.getItem(LS_SUCURSAL) || "",
    remitos: [],
    remitoActivo: null,
    search: "",
  };

  init();

  async function init() {
    bindEvents();
    await cargarSucursales();
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
  }

  async function cargarSucursales() {
    try {
      const res = await fetch(`${API_URL}?accion=sucursales`);
      const data = await res.json();

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
      const res = await fetch(`${API_URL}?accion=listar&sucursal=${encodeURIComponent(state.sucursal)}`);
      const data = await res.json();

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

      return `
        <article class="card">
          <div class="card-left">
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

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "actualizarEstado",
          remito,
          sucursal: state.sucursal,
          nuevoEstado,
          codigoPersonal
        })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "No se pudo actualizar el estado");

      await cargarRemitos();
    } catch (err) {
      alert(err.message);
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

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          accion: "confirmarOk",
          remito,
          sucursal: state.sucursal,
          codigoPersonal
        })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "No se pudo confirmar");

      await cargarRemitos();
    } catch (err) {
      alert(err.message);
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

  function renderFilesPreview() {
    const files = Array.from((el.difFiles && el.difFiles.files) || []);
    if (!files.length) {
      if (el.filesPreview) el.filesPreview.innerHTML = "";
      return;
    }

    if (el.filesPreview) {
      el.filesPreview.innerHTML = files
        .map(f => `<div>${escapeHtml(f.name)} — ${(f.size / 1024 / 1024).toFixed(2)} MB</div>`)
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

      const res = await fetch(API_URL, {
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

      const data = await res.json();
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

  function requiereSarmiento(origen, destino) {
    const o = canonSucursal(origen);
    const d = canonSucursal(destino);

    if (!o || !d) return false;

    // Si uno de los dos es SARMIENTO, no hay circuito intermedio
    if (o === SARMIENTO || d === SARMIENTO) return false;

    // DEPOSITO siempre va directo
    if (o === "DEPOSITO" || d === "DEPOSITO") return false;

    // MORENO y QUILMES siempre pasan por SARMIENTO
    if (SIEMPRE_SARMIENTO.includes(o) || SIEMPRE_SARMIENTO.includes(d)) {
      return true;
    }

    const ambosGrupo1 = GRUPO_1.includes(o) && GRUPO_1.includes(d);
    const ambosGrupo2 = GRUPO_2.includes(o) && GRUPO_2.includes(d);

    // Entre los mismos grupos va directo
    if (ambosGrupo1 || ambosGrupo2) return false;

    // Entre grupos distintos pasa por SARMIENTO
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