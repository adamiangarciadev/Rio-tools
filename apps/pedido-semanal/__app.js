/* app.js — Pedido Semanal · RIO
   Requiere:
   - PapaParse (CDN)
   - jsPDF + autoTable (CDN)
   - promos.csv: id, marca, nombre, codigo, desc, familia, talles, precio_uno, precio_tres, precio_cantidad

   ✅ Exportar PDF:
   1) Descarga local
   2) Sube PDF a Google Drive vía Apps Script
   3) (El Apps Script puede loguear en Sheets)

   ✅ NUEVO:
   - Campo “OBSERVACIONES” (para artículos que no encuentran)
   - Las observaciones salen al PIE del PDF
*/

(() => {
  "use strict";

  // =========================
  // CONFIG: Apps Script WebApp
  // =========================
  const SCRIPT_URL_PEDIDOS =
    "https://script.google.com/macros/s/AKfycbyD-x7geshhGxx2xXeX0k07QoFTRm7fm1BfmLl-H7afQ2c_9YdUBQiyvk23oeywepQ/exec";

  const SUCURSALES = [
    "NAZCA","AVELLANEDA 2","LAMARCA","SARMIENTO","CORRIENTES","CORRIENTES2","CASTELLI","QUILMES","MORENO","PUEYRREDON"
  ];

  const LS_KEY_PEDIDO = "pedido_v1";
  const LS_KEY_OBS    = "pedido_obs_v1";
  const LS_KEY_EXTRAS = "pedido_extras_v1";

  // =========================
  // State
  // =========================
  let PROMOS = [];
  let promoActual = null;
  let pedido = [];

  // Extras
  let addCinta = false;
  let bolsas = { Chicas:false, Medianas:false, Grandes:false };

  // =========================
  // Utils DOM
  // =========================
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function parseNumber(n){
    if(n==null) return 0;
    const s=String(n).trim();
    if(!s) return 0;
    const x=s.replace(/\./g,"").replace(",",".");
    const v=Number(x);
    return Number.isFinite(v)?v:0;
  }
  function toLocalDateStr(d=new Date()){
    const y=d.getFullYear(),
      m=String(d.getMonth()+1).padStart(2,"0"),
      day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, m=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }
  function unionUnique(a,b){
    return Array.from(new Set([...(a||[]),...(b||[])]));
  }
  function setText(id, t){
    const el=document.getElementById(id);
    if(el) el.textContent=t;
  }
  function alerta(msg){
    if(msg) console.log("INFO:", msg);
    const target=$("#alerta");
    if(target){
      target.textContent=msg;
      target.style.display="block";
      setTimeout(()=>{target.style.display="none";},2300);
    } else {
      alert(msg);
    }
  }

  // =========================
  // Persistencia
  // =========================
  function guardarLS(){
    try{ localStorage.setItem(LS_KEY_PEDIDO, JSON.stringify(pedido)); }catch{}
  }
  function cargarLS(){
    try{
      const raw=localStorage.getItem(LS_KEY_PEDIDO);
      if(raw){
        const arr=JSON.parse(raw);
        if(Array.isArray(arr)) pedido=arr;
      }
    }catch{}
  }
  function guardarObsLS(){
    try{
      const v = ($("#obsInput")?.value || "").toString();
      localStorage.setItem(LS_KEY_OBS, v);
    }catch{}
  }
  function cargarObsLS(){
    try{
      const v = localStorage.getItem(LS_KEY_OBS);
      if(v != null && $("#obsInput")) $("#obsInput").value = v;
    }catch{}
  }
  function guardarExtrasLS(){
    try{
      localStorage.setItem(LS_KEY_EXTRAS, JSON.stringify({ addCinta, bolsas }));
    }catch{}
  }
  function cargarExtrasLS(){
    try{
      const raw = localStorage.getItem(LS_KEY_EXTRAS);
      if(!raw) return;
      const obj = JSON.parse(raw);
      if(typeof obj?.addCinta === "boolean") addCinta = obj.addCinta;
      if(obj?.bolsas && typeof obj.bolsas === "object"){
        bolsas = {
          Chicas: !!obj.bolsas.Chicas,
          Medianas: !!obj.bolsas.Medianas,
          Grandes: !!obj.bolsas.Grandes
        };
      }
    }catch{}
  }

  // =========================
  // Pedido (agrupado ART+TALLE)
  // =========================
  function agruparPedido(lineas){
    const map=new Map();
    for(const p of lineas){
      const codigo=String(p.codigo||"").trim();
      const talle=String(p.talle||"").trim();
      const desc=String(p.desc||"");
      const key=(codigo+"||"+talle).toLowerCase();
      const prev=map.get(key);
      if(!prev) map.set(key,{codigo,desc,talle,cantidad:Number(p.cantidad)||0});
      else {
        prev.cantidad += Number(p.cantidad)||0;
        if(!prev.desc && desc) prev.desc = desc;
      }
    }
    // Orden por descripción luego talle
    return Array.from(map.values()).sort((a,b)=>{
      const ad=(a.desc||"").toLowerCase();
      const bd=(b.desc||"").toLowerCase();
      if(ad!==bd) return ad.localeCompare(bd,"es");
      return String(a.talle).localeCompare(String(b.talle),"es",{numeric:true});
    });
  }
  const getPedidoAgrupado=()=>agruparPedido(pedido);

  function renderPedido(){
    const wrap=$("#pedidoWrap");
    if(!wrap) return;

    const agrupado=getPedidoAgrupado();
    if(!agrupado.length){
      wrap.innerHTML=`<div class="empty">Sin ítems en el pedido.</div>`;
      setText("count","0");
      guardarLS();
      return;
    }

    const rows=agrupado.map(p=>`
      <tr>
        <td>${escapeHtml(p.codigo)}</td>
        <td>${escapeHtml(p.desc||"")}</td>
        <td class="talle">${escapeHtml(String(p.talle))}</td>
        <td class="num">${escapeHtml(String(p.cantidad))}</td>
      </tr>
    `).join("");

    wrap.innerHTML=`
      <table class="table">
        <thead><tr><th>ART</th><th>DESCRIPCIÓN</th><th>TALLE</th><th>CANT.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    setText("count", String(agrupado.length));
    guardarLS();
  }

  async function copiarPedido(){
    const agrupado=getPedidoAgrupado();
    if(!agrupado.length) return alerta("No hay nada para copiar.");
    const txt=agrupado.map(p=>[p.codigo,p.desc||"",p.talle,p.cantidad].join("\t")).join("\n");
    await navigator.clipboard.writeText(txt);
    alerta("Pedido copiado.");
  }

  // =========================
  // Sucursal
  // =========================
  function initSucursalSelect(){
    const sel=$("#sucursalSelect");
    if(!sel) return;
    sel.innerHTML=SUCURSALES.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  }

  // =========================
  // CSV promos.csv
  // =========================
  function cargarPromos(){
    Papa.parse("promos.csv",{
      download:true, header:true,
      complete: (res)=>{
        try{
          const rows=(res.data||[]).filter(r=>r && r.id && r.codigo);
          PROMOS=agruparPromos(rows);
          rellenarDatalist();
          renderPromosGrid();
        }catch(e){
          console.error(e);
          alerta("No se pudo procesar promos.csv");
        }
      },
      error: (err)=>{
        console.error(err);
        alerta("No se pudo cargar promos.csv");
      }
    });
  }

  function agruparPromos(rows){
    const map=new Map();
    for(const r of rows){
      const id=String(r.id||"").trim();
      if(!id) continue;

      const talles=String(r.talles||"")
        .split("|").map(t=>t.trim()).filter(Boolean);

      const precios={
        uno: parseNumber(r.precio_uno),
        tres: parseNumber(r.precio_tres),
        cantidad: parseNumber(r.precio_cantidad)
      };

      const item={
        codigo:String(r.codigo||"").trim(),
        desc:String(r.desc||"").trim(),
        familia:String(r.familia||"").trim()
      };
      if(!item.codigo) continue;

      if(!map.has(id)){
        map.set(id,{
          id,
          marca:String(r.marca||"").trim(),
          nombre:String(r.nombre||"").trim(),
          talles,
          precios,
          items:[item]
        });
      }else{
        const p=map.get(id);
        p.items.push(item);
        p.talles = unionUnique(p.talles, talles);
        p.precios = precios;
      }
    }
    const list=Array.from(map.values());
    list.sort((a,b)=>(`${a.marca} ${a.nombre}`).toLowerCase()
      .localeCompare((`${b.marca} ${b.nombre}`).toLowerCase(),"es"));
    return list;
  }

  // =========================
  // Buscador (promo o artículo)
  // =========================
  function rellenarDatalist(){
    const dl=$("#promosList");
    if(!dl) return;

    const optsPromo = PROMOS.map(p =>
      `<option value="${escapeHtml(`${p.id} - ${p.marca} - ${p.nombre}`)}"></option>`
    );

    const optsArt = PROMOS.flatMap(p =>
      (p.items||[]).map(it => `<option value="${escapeHtml(it.codigo)}"></option>`)
    );

    dl.innerHTML = optsPromo.concat(optsArt).join("");
  }

  function enlazarBusquedaPromo(){
    const input=$("#promoSearch");
    if(!input) return;

    input.addEventListener("change", ()=> seleccionarPorTexto(input.value));
    input.addEventListener("input", ()=> seleccionarPorTexto(input.value,{onlyExact:true}));
  }

  function seleccionarPorTexto(txt,{onlyExact=false}={}){
    const v=String(txt||"").trim().toLowerCase();
    if(!v) return;

    let p = PROMOS.find(p => (`${p.id} - ${p.marca} - ${p.nombre}`).toLowerCase() === v)
          || PROMOS.find(p => p.id.toLowerCase() === v)
          || (!onlyExact && PROMOS.find(p => (`${p.marca} ${p.nombre}`).toLowerCase().includes(v)));

    if(!p){
      // buscar por artículo
      const matchByArt = PROMOS.find(p => (p.items||[]).some(it =>
        String(it.codigo||"").toLowerCase() === v
        || (!onlyExact && String(it.codigo||"").toLowerCase().includes(v))
        || (!onlyExact && String(it.desc||"").toLowerCase().includes(v))
      ));
      if(matchByArt){
        p = matchByArt;
        expandirPromoCard(p.id);
        // marcar el artículo dentro
        try{
          const card = document.querySelector(`.promo-card[data-pid="${CSS.escape(p.id)}"]`);
          const cont = card?.querySelector(".artList");
          if(cont){
            const item = Array.from(cont.querySelectorAll(".item")).find(n =>
              (n.dataset.codigo||"").toLowerCase() === v
              || (!onlyExact && (n.dataset.codigo||"").toLowerCase().includes(v))
            );
            if(item){
              item.classList.add("selected");
              const cmEl = card.querySelector(".cm");
              if(cmEl) cmEl.textContent = String(cont.querySelectorAll(".item.selected").length);
              item.scrollIntoView({behavior:"smooth", block:"center"});
            }
          }
        }catch{}
        return;
      }
    }

    if(p) expandirPromoCard(p.id);
  }

  // =========================
  // Tarjetas (columna IZQ)
  // =========================
  function renderPromosGrid(){
    const host=$("#promosGrid");
    if(!host) return;

    if(!PROMOS.length){
      host.innerHTML=`<div class="empty">No hay promociones.</div>`;
      return;
    }

    const grid=document.createElement("div");
    grid.className="grid";

    for(const p of PROMOS){
      const card=document.createElement("article");
      card.className="promo-card";
      card.dataset.pid=p.id;

      card.innerHTML=`
        <div class="promo-head">
          <div>
            <div class="promo-title">${escapeHtml(p.marca)} · ${escapeHtml(p.nombre)}</div>
            <div class="promo-sub">ID: ${escapeHtml(p.id)}</div>
            <div class="price-row">
              <span class="price-chip">x1: ${p.precios.uno ? `$${p.precios.uno}` : "-"}</span>
              <span class="price-chip">x3: ${p.precios.tres ? `$${p.precios.tres}` : "-"}</span>
              <span class="price-chip">Por cantidad: ${p.precios.cantidad ? `$${p.precios.cantidad}` : "-"}</span>
            </div>
          </div>
          <div class="promo-actions">
            <button class="btn success btn-expand">Seleccionar</button>
          </div>
        </div>

        <div class="promo-expand">
          <div class="row gap">
            <div class="card inner" style="flex:1; min-width:260px">
              <div class="row space-between center">
                <h3 style="margin:0">Artículos</h3>
                <div class="row gap">
                  <button class="btn ghost btn-todos">Todos</button>
                  <button class="btn ghost btn-clear">Limpiar</button>
                </div>
              </div>
              <div class="list scroll artList"></div>
              <div class="kpis"><span class="tag">Seleccionados:</span> <strong class="cm">0</strong></div>
            </div>

            <div class="card inner" style="flex:1; min-width:220px">
              <div class="row space-between center">
                <h3 style="margin:0">Talles</h3>
                <div class="row gap">
                  <button class="btn ghost btn-talles-todos">Todos</button>
                  <button class="btn ghost btn-talles-clear">Limpiar</button>
                </div>
              </div>
              <div class="list scroll tallesList"></div>
              <div class="kpis"><span class="tag">Seleccionados:</span> <strong class="sm">0</strong></div>
            </div>
          </div>

          <div class="row gap" style="margin-top:10px">
            <label style="min-width:160px">
              Cantidad total / por talle
              <input type="number" class="cantidad" inputmode="numeric" min="1" placeholder="Ej: 12" />
            </label>
            <button class="btn success btn-add">Agregar</button>
          </div>
        </div>
      `;

      // Rellenar listas
      const artHost = $(".artList", card);
      const talleHost = $(".tallesList", card);

      (p.items||[]).forEach(it=>{
        const div=document.createElement("div");
        div.className="item";
        div.dataset.codigo = it.codigo;
        div.dataset.desc = it.desc || "";
        div.textContent = `${it.codigo} — ${it.desc || ""}`.trim();
        div.addEventListener("click", ()=>{
          div.classList.toggle("selected");
          $(".cm", card).textContent = String($$(".item.selected", artHost).length);
        });
        artHost.appendChild(div);
      });

      const talles = (p.talles && p.talles.length) ? p.talles : ["ÚNICO"];
      talles.forEach(t=>{
        const lab=document.createElement("label");
        lab.className="chk";
        lab.innerHTML = `<input type="checkbox" value="${escapeHtml(t)}"> ${escapeHtml(t)}`;
        const cb = $("input", lab);
        cb.addEventListener("change", ()=>{
          $(".sm", card).textContent = String($$("input:checked", talleHost).length);
        });
        talleHost.appendChild(lab);
      });

      // Eventos botones internos
      $(".btn-expand", card).addEventListener("click", ()=> expandirPromoCard(p.id));

      $(".btn-todos", card).addEventListener("click", ()=>{
        $$(".item", artHost).forEach(n=>n.classList.add("selected"));
        $(".cm", card).textContent = String($$(".item.selected", artHost).length);
      });
      $(".btn-clear", card).addEventListener("click", ()=>{
        $$(".item", artHost).forEach(n=>n.classList.remove("selected"));
        $(".cm", card).textContent = "0";
      });

      $(".btn-talles-todos", card).addEventListener("click", ()=>{
        $$("input[type='checkbox']", talleHost).forEach(cb=>cb.checked=true);
        $(".sm", card).textContent = String($$("input:checked", talleHost).length);
      });
      $(".btn-talles-clear", card).addEventListener("click", ()=>{
        $$("input[type='checkbox']", talleHost).forEach(cb=>cb.checked=false);
        $(".sm", card).textContent = "0";
      });

      $(".btn-add", card).addEventListener("click", ()=> agregarDesdeCard(p, card));

      grid.appendChild(card);
    }

    host.innerHTML="";
    host.appendChild(grid);
  }

  function expandirPromoCard(id){
    const card = document.querySelector(`.promo-card[data-pid="${CSS.escape(id)}"]`);
    if(!card) return;

    // cerrar anterior
    if(promoActual && promoActual !== id){
      const prev = document.querySelector(`.promo-card[data-pid="${CSS.escape(promoActual)}"]`);
      prev?.classList.remove("expanded");
    }

    const isOpen = card.classList.toggle("expanded");
    promoActual = isOpen ? id : null;

    // scroll a la tarjeta si se abre
    if(isOpen){
      card.scrollIntoView({behavior:"smooth", block:"start"});
    }
  }

  function getTallesSeleccionados(card){
    const host = $(".tallesList", card);
    const sel = $$("input:checked", host).map(cb=>cb.value);
    return sel.map(s=>String(s||"").trim()).filter(Boolean);
  }

  function getArticulosSeleccionados(card){
    const host = $(".artList", card);
    const sel = $$(".item.selected", host).map(n => ({
      codigo: n.dataset.codigo || "",
      desc: n.dataset.desc || ""
    }));
    return sel.filter(x=>String(x.codigo||"").trim());
  }

  function agregarDesdeCard(promo, card){
    const qtyEl = $(".cantidad", card);
    const total = Number(qtyEl?.value || 0);

    if(!Number.isFinite(total) || total<=0){
      return alerta("Ingresá una cantidad válida.");
    }

    let arts = getArticulosSeleccionados(card);
    if(!arts.length){
      // si no eligió, toma todos
      arts = (promo.items||[]).map(it=>({codigo:it.codigo, desc:it.desc||""}));
    }

    let talles = getTallesSeleccionados(card);
    if(!talles.length){
      talles = (promo.talles && promo.talles.length) ? promo.talles.slice() : ["ÚNICO"];
    }
    if(!talles.length) talles = ["ÚNICO"];

    // Regla: “Cantidad total / por talle” => agrega la MISMA cantidad a cada talle
    for(const a of arts){
      for(const t of talles){
        pedido.push({
          codigo: String(a.codigo||"").trim(),
          desc: String(a.desc||"").trim(),
          talle: String(t||"").trim(),
          cantidad: total
        });
      }
    }

    qtyEl.value = "";
    renderPedido();
    alerta("Agregado al pedido.");
  }

  // =========================
  // Extras UI
  // =========================
  function updateExtrasUI(){
    const cintaChip = $("#cintaChip");
    if(cintaChip){
      cintaChip.textContent = `Cinta: ${addCinta ? "sí" : "no"}`;
      cintaChip.classList.toggle("on", addCinta);
      cintaChip.classList.toggle("muted", !addCinta);
    }

    const bolsasChip = $("#bolsasChip");
    if(bolsasChip){
      const sel = Object.entries(bolsas).filter(([,v])=>v).map(([k])=>k);
      bolsasChip.textContent = sel.length ? `Bolsas: ${sel.join(", ")}` : "Bolsas: —";
      bolsasChip.classList.toggle("on", sel.length>0);
      bolsasChip.classList.toggle("muted", sel.length===0);
    }

    // sincroniza checks del picker (por si cargó de LS)
    const picker = $("#bolsasPicker");
    if(picker){
      $$("input[name='bolsaOpt']", picker).forEach(cb=>{
        cb.checked = !!bolsas[cb.value];
      });
    }

    guardarExtrasLS();
  }

  function buildExtrasLegend(){
    const parts = [];
    if(addCinta) parts.push("Se agregan cintas");
    const selBolsas = Object.entries(bolsas).filter(([,v])=>v).map(([k])=>k);
    if(selBolsas.length) parts.push(`Se agregan bolsas: ${selBolsas.join(", ")}`);
    return parts.join(" · ");
  }

  // =========================
  // OBSERVACIONES
  // =========================
  function getObservaciones(){
    return ($("#obsInput")?.value || "").toString().trim();
  }

  function renderObservacionesFooter(doc){
    const obs = getObservaciones();
    if(!obs) return;

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 40;
    const marginBottom = 40;

    doc.setFontSize(10);
    const title = "OBSERVACIONES:";
    const maxW = pageW - marginX*2;

    const lines = doc.splitTextToSize(obs, maxW);

    // Calcula alto aproximado
    const lineH = 12; // pts aprox para font 10
    const blockH = (1 + lines.length) * lineH;

    // siempre al pie: si no entra en la página actual, nueva página
    const yStart = pageH - marginBottom - blockH;
    if(yStart < 80){
      doc.addPage();
    }

    const pageH2 = doc.internal.pageSize.getHeight();
    const y2 = pageH2 - marginBottom - blockH;

    doc.setFontSize(10);
    doc.text(title, marginX, y2);
    doc.text(lines, marginX, y2 + lineH);
  }

  // =========================
  // PDF + Drive
  // =========================
  function generarPDFDoc(){
    const agrupado=getPedidoAgrupado();
    if(!agrupado.length){
      alerta("No hay nada para exportar.");
      return null;
    }

    const { jsPDF }=window.jspdf;
    const doc=new jsPDF({unit:"pt",format:"a4"});
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(14);
    doc.text(`LOCAL: ${$("#sucursalSelect")?.value||"sin-sucursal"}`,40,40);
    doc.text(`PEDIDO – ${toLocalDateStr()}`,40,60);

    // extras arriba a la derecha
    const extrasTxt = buildExtrasLegend();
    if(extrasTxt){
      doc.setFontSize(11);
      doc.text(extrasTxt, pageW-40, 40, { align: "right" });
    }

    doc.autoTable({
      head:[["ART","DESCRIPCIÓN","TALLE","CANT."]],
      body: agrupado.map(p=>[p.codigo,p.desc||"",String(p.talle),String(p.cantidad)]),
      startY:80,
      styles: { fontSize: 10 }
    });

    // Observaciones al pie (en la última página del doc)
    renderObservacionesFooter(doc);

    return doc;
  }

  async function subirPDFAGoogleDrive(doc){
    if(!SCRIPT_URL_PEDIDOS){
      alerta("Falta SCRIPT_URL_PEDIDOS en app.js");
      return;
    }

    const local = ($("#sucursalSelect")?.value || "").trim().toUpperCase();
    if(!local){
      alerta("Seleccioná la sucursal antes de generar.");
      return;
    }

    const dataUri = doc.output("datauristring");
    const base64 = dataUri.split(",")[1] || "";
    if(!base64){
      alerta("No se pudo generar base64 del PDF.");
      return;
    }

    const fileName = `Pedido_${local}_${toLocalDateStr()}.pdf`;

    const payload = {
      local,
      fileName,
      mimeType: "application/pdf",
      base64,
      // opcional: si querés que el Apps Script lo guarde también en una celda/log
      observaciones: getObservaciones() || "",
      extras: {
        cinta: !!addCinta,
        bolsas: Object.entries(bolsas).filter(([,v])=>v).map(([k])=>k)
      }
    };

    // En GitHub Pages: no-cors (no podemos leer respuesta)
    await fetch(SCRIPT_URL_PEDIDOS, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  }

  // =========================
  // Init
  // =========================
  document.addEventListener("DOMContentLoaded", ()=>{
    initSucursalSelect();

    cargarLS();
    cargarExtrasLS();
    renderPedido();

    // Observaciones: si el HTML todavía no tiene el textarea,
    // lo creamos “antes de Extras” automáticamente.
    const meta = document.querySelector(".topbar .meta");
    if(meta && !$("#obsInput")){
      const extrasBox = meta.querySelector(".extras"); // donde están cintas/bolsas
      const wrap = document.createElement("div");
      wrap.className = "obs-wrap";
      wrap.innerHTML = `
        <label style="display:block; min-width:320px">
          Observaciones (artículos que no encuentran)
          <textarea id="obsInput" rows="2" placeholder="Ej: 23-100R talle 95 negro / ..."></textarea>
        </label>
      `;
      if(extrasBox) meta.insertBefore(wrap, extrasBox);
      else meta.appendChild(wrap);
    }

    cargarObsLS();

    // Guardar obs en caliente
    $("#obsInput")?.addEventListener("input", ()=> guardarObsLS());

    cargarPromos();
    enlazarBusquedaPromo();

    $("#copiar")?.addEventListener("click", copiarPedido);
    $("#vaciar")?.addEventListener("click", ()=>{
      pedido=[];
      renderPedido();
    });

    // PDF: descarga + subida
    $("#btnPDF")?.addEventListener("click", async ()=>{
      const doc = generarPDFDoc();
      if(!doc) return;

      const suc = $("#sucursalSelect")?.value || "sin-sucursal";
      doc.save(`Pedido_${suc}_${toLocalDateStr()}.pdf`);

      try{
        await subirPDFAGoogleDrive(doc);
        alerta("PDF enviado a Drive (revisar Drive / LOG).");
      }catch(err){
        console.error(err);
        alerta("Error subiendo PDF a Drive (ver consola).");
      }
    });

    // Extras
    const picker = $("#bolsasPicker");
    $("#btnCinta")?.addEventListener("click", ()=>{
      addCinta = !addCinta;
      updateExtrasUI();
    });
    $("#btnBolsas")?.addEventListener("click", ()=>{
      picker?.classList.toggle("show");
    });
    picker?.addEventListener("change", (ev)=>{
      if(ev.target && ev.target.name === "bolsaOpt"){
        bolsas[ev.target.value] = ev.target.checked;
        updateExtrasUI();
      }
    });

    updateExtrasUI();
  });

})();
