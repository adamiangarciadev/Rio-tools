const API_URL = "https://script.google.com/macros/s/AKfycbzGrrd7V8QGjlQMZGOuPg_FZo3vzt6d1fPTX8hlqSh83Qex5zg9QagHqsTC7WKk2uKj/exec";

const remitoInput = document.getElementById("remito");
const btnBuscar = document.getElementById("btnBuscar");
const estadoBox = document.getElementById("estado");

const responsableInput = document.getElementById("responsable");
const origenInput = document.getElementById("origen");
const destinoInput = document.getElementById("destino");
const fechaInput = document.getElementById("fecha");

const tipoDocumentoInput = document.getElementById("tipoDocumento");
const empleadoInput = document.getElementById("empleado");
const dniInput = document.getElementById("dni");
const sectorInput = document.getElementById("sector");
const difNegativasInput = document.getElementById("difNegativas");
const difPositivasInput = document.getElementById("difPositivas");
const fechaDocumentoInput = document.getElementById("fechaDocumento");
const motivoInput = document.getElementById("motivo");
const observacionInput = document.getElementById("observacion");

const btnVistaPrevia = document.getElementById("btnVistaPrevia");
const btnPdf = document.getElementById("btnPdf");
const btnLimpiar = document.getElementById("btnLimpiar");

const preview = document.getElementById("preview");

fechaDocumentoInput.value = hoyISO();

btnBuscar.addEventListener("click", buscarRemito);
btnVistaPrevia.addEventListener("click", renderPreview);
btnPdf.addEventListener("click", descargarPDF);
btnLimpiar.addEventListener("click", limpiarFormulario);

async function buscarRemito() {
  const remito = remitoInput.value.trim();

  if (!remito) {
    mostrarEstado("Ingresá un número de remito.", "error");
    return;
  }

  mostrarEstado("Buscando remito...", "info");

  try {
    const url = `${API_URL}?accion=buscarRemito&remito=${encodeURIComponent(remito)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      mostrarEstado(data.error || "No se encontró el remito.", "error");
      limpiarDatosRemito();
      return;
    }

    responsableInput.value = data.item.responsable || "";
    origenInput.value = data.item.origen || "";
    destinoInput.value = data.item.destino || "";
    fechaInput.value = data.item.fecha || "";

    mostrarEstado(`Remito ${remito} encontrado correctamente.`, "ok");
    renderPreview();
  } catch (error) {
    console.error(error);
    mostrarEstado("Error al consultar el remito.", "error");
    limpiarDatosRemito();
  }
}

function limpiarDatosRemito() {
  responsableInput.value = "";
  origenInput.value = "";
  destinoInput.value = "";
  fechaInput.value = "";
}

function mostrarEstado(texto, tipo) {
  estadoBox.textContent = texto;
  estadoBox.className = `estado ${tipo}`;
}

function hoyISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fechaLarga(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatearDni(dni) {
  const limpio = String(dni || "").replace(/\D/g, "");
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function numeroALetrasSimple(n) {
  const mapa = {
    1: "una",
    2: "dos",
    3: "tres",
    4: "cuatro",
    5: "cinco",
    6: "seis",
    7: "siete",
    8: "ocho",
    9: "nueve",
    10: "diez",
    11: "once",
    12: "doce",
    13: "trece",
    14: "catorce",
    15: "quince",
    16: "dieciséis",
    17: "diecisiete",
    18: "dieciocho",
    19: "diecinueve",
    20: "veinte"
  };

  return mapa[Number(n)] || String(n || "");
}

function construirDetalleDiferencias(neg, pos) {
  const n = Number(neg || 0);
  const p = Number(pos || 0);

  if (n > 0 && p > 0) {
    return `se registraron ${n} (${numeroALetrasSimple(n)}) diferencias negativas y ${p} (${numeroALetrasSimple(p)}) diferencias positivas entre el stock físico y lo efectivamente pickeado`;
  }

  if (n > 0) {
    return `se registraron ${n} (${numeroALetrasSimple(n)}) diferencias negativas entre el stock físico y lo efectivamente pickeado`;
  }

  if (p > 0) {
    return `se registraron ${p} (${numeroALetrasSimple(p)}) diferencias positivas entre el stock físico y lo efectivamente pickeado`;
  }

  return "se detectaron inconsistencias entre el stock físico y lo efectivamente pickeado";
}

function construirTexto() {
  const tipo = tipoDocumentoInput.value;
  const empleado = empleadoInput.value.trim();
  const dni = dniInput.value.trim();
  const sector = sectorInput.value.trim() || "Depósito";
  const remito = remitoInput.value.trim();
  const responsable = responsableInput.value.trim();
  const origen = origenInput.value.trim();
  const destino = destinoInput.value.trim();
  const difNegativas = difNegativasInput.value.trim() || "0";
  const difPositivas = difPositivasInput.value.trim() || "0";
  const fechaDocumento = fechaDocumentoInput.value;
  const motivo = motivoInput.value.trim();
  const observacion = observacionInput.value.trim();

  const titulo = tipo === "SUSPENSION"
    ? "SUSPENSIÓN DISCIPLINARIA"
    : "APERCIBIMIENTO";

  let parrafoCentral = "";
  let parrafoFinal = "";

  if (tipo === "SUSPENSION") {
    parrafoCentral =
      `La presente suspensión se dispone como consecuencia de ${motivo}, habiéndose detectado una incidencia en el remito N° ${remito}, correspondiente al envío desde ${origen} a ${destino}, bajo responsabilidad de ${responsable}, donde ${construirDetalleDiferencias(difNegativas, difPositivas)}.`;

    parrafoFinal =
      "En virtud de lo expuesto, se dispone la aplicación de una suspensión disciplinaria, cuya duración será determinada por la empresa conforme a la normativa interna vigente.";
  } else {
    parrafoCentral =
      `El presente apercibimiento se emite en virtud de ${motivo}, habiéndose detectado en esta oportunidad una incidencia en el remito N° ${remito}, correspondiente al envío desde ${origen} a ${destino}, bajo responsabilidad de ${responsable}, donde ${construirDetalleDiferencias(difNegativas, difPositivas)}.`;

    parrafoFinal =
      "Se deja constancia de que el presente apercibimiento constituye una instancia disciplinaria formal y que, en caso de reiteración de conductas similares, podrán aplicarse sanciones más severas, incluyendo la suspensión.";
  }

  return `${fechaLarga(fechaDocumento)}

${titulo} – SECTOR ${sector.toUpperCase()}

Por medio de la presente se deja constancia de que el Sr. ${empleado}, DNI ${formatearDni(dni)}, perteneciente al sector ${sector}, ha incurrido en incumplimientos en el desempeño de sus tareas.

${parrafoCentral}

Dicha situación afecta directamente la operatoria del circuito logístico y la correcta distribución de la mercadería, constituyendo un incumplimiento de las responsabilidades inherentes a su puesto de trabajo.

${parrafoFinal}

${observacion ? observacion + "\n\n" : ""}El empleado firma en constancia de recepción de la presente, pudiendo efectuar su descargo si así lo considera.



Firma: ___________________________



Aclaración: _______________________



Fecha: ___________________________`;
}

function renderPreview() {
  preview.textContent = construirTexto();
}

function descargarPDF() {
  const empleado = empleadoInput.value.trim();
  const dni = dniInput.value.trim();
  const remito = remitoInput.value.trim();
  const difNegativas = difNegativasInput.value.trim();
  const difPositivas = difPositivasInput.value.trim();

  if (!empleado || !dni || !remito || !origenInput.value || !destinoInput.value || !responsableInput.value) {
    mostrarEstado("Completá todos los datos obligatorios antes de descargar el PDF.", "error");
    return;
  }

  if (Number(difNegativas || 0) <= 0 && Number(difPositivas || 0) <= 0) {
    mostrarEstado("Ingresá al menos una diferencia negativa o positiva.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const texto = construirTexto();
  const bloques = texto.split("\n\n");

  let y = 20;
  const x = 20;
  const maxWidth = 170;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  bloques.forEach((bloque, index) => {
    if (index === 0) {
      pdf.text(bloque, 190, y, { align: "right" });
      y += 12;
      return;
    }

    if (index === 1) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text(bloque, 105, y, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      y += 12;
      return;
    }

    const lineas = pdf.splitTextToSize(bloque, maxWidth);

    if (y + lineas.length * 6 > 280) {
      pdf.addPage();
      y = 20;
    }

    pdf.text(lineas, x, y);
    y += lineas.length * 6 + 6;
  });

  const tipo = tipoDocumentoInput.value === "SUSPENSION" ? "suspension" : "apercibimiento";
  const nombre = `${tipo}_${empleado.replace(/\s+/g, "_")}_remito_${remito}.pdf`;

  pdf.save(nombre);
  mostrarEstado("PDF generado correctamente.", "ok");
}

function limpiarFormulario() {
  remitoInput.value = "";
  empleadoInput.value = "";
  dniInput.value = "";
  sectorInput.value = "Depósito";
  difNegativasInput.value = "";
  difPositivasInput.value = "";
  motivoInput.value = "reiterados errores en el proceso de picking";
  observacionInput.value = "";
  tipoDocumentoInput.value = "APERCIBIMIENTO";
  fechaDocumentoInput.value = hoyISO();
  limpiarDatosRemito();
  preview.textContent = "";
  estadoBox.className = "estado oculto";
  estadoBox.textContent = "";
}