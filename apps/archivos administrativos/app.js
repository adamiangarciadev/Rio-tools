// administracion.js — Planillas diarias (Drive) + placeholders de secciones
;(() => {
  "use strict";

  const PLANILLAS = [
    { name: "AVELLANEDA", url: "https://drive.google.com/file/d/1pfqmq60mbPy37SHdiKWW8RHU0o2aLHmb/view?usp=drive_link" },
    { name: "NAZCA",      url: "https://drive.google.com/file/d/1XnBvJNyTqtggqDR33QAhp3D40a_OF0yl/view?usp=drive_link" },
    { name: "LAMARCA",    url: "https://drive.google.com/file/d/1H-GYiVwOdNxBCC4eozdIFKE6kR550UYz/view?usp=drive_link" },
    { name: "MORENO",     url: "https://drive.google.com/file/d/1VhNchkPWeF3J47Z0VoPTqI4OW3oZpVJ1/view?usp=drive_link" },
    { name: "QUILMES",    url: "https://drive.google.com/file/d/1OPNWe5RaFbgNb9_BfC2eQV0j-yMVNOzb/view?usp=drive_link" },
    { name: "CORRIENTES", url: "https://drive.google.com/file/d/1QD2f-MXv-jQV7h66wPixstFAQQUAsWc3/view?usp=drive_link" },
    { name: "SARMIENTO",  url: "https://drive.google.com/file/d/1IXMQvd-zQdqum8vwUCULcuHVzDRoVLCh/view?usp=drive_link" },
    { name: "CASTELLI",   url: "https://drive.google.com/file/d/1ogZ-uf169U5FItay1lrV3kSyRP74Opil/view?usp=drive_link" },
    // { name: "DEPÓSITO", url: "PEGAR_LINK" },
  ];

  const $ = (id) => document.getElementById(id);

  function extractDriveId(url) {
    const s = String(url || "");
    // /file/d/<ID>/
    let m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    // id=<ID>
    m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    return "";
  }

  function toDirectDownload(url) {
    const id = extractDriveId(url);
    if (!id) return url; // fallback
    return `https://drive.google.com/uc?export=download&id=${id}`;
  }

  function initPlanillasUI() {
    const sel = $("pdSucursal");
    const btn = $("pdDescargar");
    const hint = $("pdHint");
    if (!sel || !btn) return;

    sel.innerHTML = PLANILLAS
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((p) => `<option value="${p.name}">${p.name}</option>`)
      .join("");

    // deja sin selección al cargar (para forzar elección explícita)
    sel.selectedIndex = -1;

    sel.addEventListener("change", () => {
      const ok = sel.selectedIndex >= 0;
      btn.disabled = !ok;
      if (hint) hint.textContent = ok ? "Listo para descargar." : "Elegí una sucursal para habilitar la descarga.";
    });

    btn.addEventListener("click", () => {
      const suc = sel.value;
      const item = PLANILLAS.find((x) => x.name === suc);
      if (!item) return;

      // descarga directa (Drive)
      const direct = toDirectDownload(item.url);

      // abre en la misma pestaña para disparar descarga
      window.location.href = direct;
    });
  }

  document.addEventListener("DOMContentLoaded", initPlanillasUI);
})();
