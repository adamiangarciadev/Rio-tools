/* app.js — Tarjeta expandible en ancho y alto con selección de Artículos + Talles
   Requiere:
   - PapaParse (CDN)
   - jsPDF + autoTable (CDN)
   - promos.csv: id, marca, nombre, codigo, desc, familia, talles, precio_uno, precio_tres, precio_cantidad
*/

let PROMOS = [];
let promoActual = null;      // última promo expandida
let pedido = [];

// Extras
let addCinta = false;
let bolsas = { Chicas:false, Medianas:false, Grandes:false };

const LS_KEY = "pedido_v1";

const SUCURSALES = [
  "NAZCA","AVELLANEDA 2","LAMARCA","SARMIENTO","CORRIENTES","CORRIENTES2","CASTELLI","QUILMES","MORENO","PUEYRREDON"
];

const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function parseNumber(n){ if(n==null) return 0; const s=String(n).trim(); if(!s) return 0; const x=s.replace(/\./g,"").replace(",","."); const v=Number(x); return Number.isFinite(v)?v:0; }
function toLocalDateStr(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
function setText(id, t){ const el=document.getElementById(id); if(el) el.textContent=t; }
function escapeHtml(str){return String(str).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function unionUnique(a,b){ return Array.from(new Set([...(a||[]),...(b||[])])); }

function alerta(msg){
  if(msg) console.log("INFO:", msg);
  const target=$("#alerta"); if(target){ target.textContent=msg; target.style.display="block"; setTimeout(()=>{target.style.display="none";},2300);} else alert(msg);
}

/* ===== Agrupado del pedido por ART+TALLE ===== */
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
      prev.cantidad+=Number(p.cantidad)||0;
      if(!prev.desc && desc) prev.desc = desc;
    }
  }

  // Ordenar por descripción y luego por talle
  return Array.from(map.values()).sort((a,b)=>{
    const ad = (a.desc||"").toLowerCase();
    const bd = (b.desc||"").toLowerCase();
    if(ad !== bd) return ad.localeCompare(bd,"es");
    return String(a.talle).localeCompare(String(b.talle),"es",{numeric:true});
  });
}

const getPedidoAgrupado=()=>agruparPedido(pedido);

/* ===== Sucursal (select) ===== */
function initSucursalSelect(){
  const sel=$("#sucursalSelect"); if(!sel) return;
  sel.innerHTML=SUCURSALES.map(s=>`<option value="${s}">${s}</option>`).join("");
}

/* ===== Carga CSV y modelado ===== */
function cargarPromos(){
  Papa.parse("promos.csv",{
    download:true, header:true,
    complete: (res)=>{
      try{
        const rows=(res.data||[]).filter(r=>r&&r.id&&r.codigo);
        PROMOS=agruparPromos(rows);
        rellenarDatalist();
        renderPromosGrid();
      }catch(e){console.error(e); alerta("No se pudo procesar promos.csv");}
    },
    error: (err)=>{ console.error(err); alerta("No se pudo cargar promos.csv"); }
  });
}

function agruparPromos(rows){
  const map=new Map();
  for(const r of rows){
    const id=String(r.id||"").trim(); if(!id) continue;
    const talles=String(r.talles||"").split("|").map(t=>t.trim()).filter(Boolean);
    const precios={ uno:parseNumber(r.precio_uno), tres:parseNumber(r.precio_tres), cantidad:parseNumber(r.precio_cantidad) };
    const item={
      codigo:String(r.codigo||"").trim(),
      desc:String(r.desc||"").trim(),
      familia:String(r.familia||"").trim()
    };
    if(!item.codigo) continue;

    if(!map.has(id)){
      map.set(id,{ id, marca:String(r.marca||"").trim(), nombre:String(r.nombre||"").trim(), talles, precios, items:[item] });
    }else{
      const p=map.get(id); p.items.push(item); p.talles=unionUnique(p.talles,talles); p.precios=precios;
    }
  }
  const list=Array.from(map.values());
  list.sort((a,b)=> (a.marca+" "+a.nombre).toLowerCase().localeCompare((b.marca+" "+b.nombre).toLowerCase(),"es"));
  return list;
}

/* ===== Buscador superior ===== */
function rellenarDatalist(){
  const dl=$("#promosList"); if(!dl) return;
  const optsPromo = PROMOS.map(p => `<option value="${escapeHtml(`${p.id} - ${p.marca} - ${p.nombre}`)}"></option>`);
  const optsArt = PROMOS.flatMap(p => (p.items||[]).map(it => `<option value="${escapeHtml(it.codigo)}"></option>`));
  dl.innerHTML = optsPromo.concat(optsArt).join("");
}
function enlazarBusquedaPromo(){
  const input=$("#promoSearch"); if(!input) return;
  input.addEventListener("change", ()=> seleccionarPorTexto(input.value));
  input.addEventListener("input", ()=> seleccionarPorTexto(input.value,{onlyExact:true}));
}
function seleccionarPorTexto(txt,{onlyExact=false}={}){
  const v=String(txt||"").trim().toLowerCase(); if(!v) return;
  // 1) Buscar por ID + Marca + Nombre (exacto), por ID, o por Marca+Nombre (parcial)
  let p = PROMOS.find(p => (`${p.id} - ${p.marca} - ${p.nombre}`).toLowerCase() === v)
        || PROMOS.find(p => p.id.toLowerCase() === v)
        || (!onlyExact && PROMOS.find(p => (`${p.marca} ${p.nombre}`).toLowerCase().includes(v)));

  // 2) Si no hay coincidencia, buscar por ARTÍCULO (código exacto o parcial) o por descripción
  if(!p){
    const matchByArt = PROMOS.find(p => (p.items||[]).some(it =>
      String(it.codigo||"").toLowerCase() === v
      || (!onlyExact && String(it.codigo||"").toLowerCase().includes(v))
      || (!onlyExact && String(it.desc||"").toLowerCase().includes(v))
    ));
    if(matchByArt) {
      p = matchByArt;
      expandirPromoCard(p.id);
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

/* ===== Render de tarjetas de promos (columna IZQ) ===== */
function renderPromosGrid(){
  const host=$("#promosGrid");
  if(!host) return;
  if(!PROMOS.length){ host.innerHTML=`<div class="empty">No hay promociones.</div>`; return; }

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

      <!-- EXPANSIÓN: Artículos + Talles + Cantidad -->
      <div class="promo-expand">
        <div class="row gap">
          <!-- Artículos -->
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

          <!-- Talles -->
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
          <button class="btn btn-surtido">Surtido inteligente</button>
        </div>
      </div>
    `;

    $(".btn-expand", card).addEventListener("click", ()=> expandirPromoCard(p.id));
    $(".btn-add", card).addEventListener("click", ()=> agregarDesdeCard(card, p, {modo:"normal"}));
    $(".btn-surtido", card).addEventListener("click", ()=> agregarDesdeCard(card, p, {modo:"surtido"}));
    $(".btn-clear", card).addEventListener("click", ()=> limpiarCard(card));
    $(".btn-todos", card).addEventListener("click", ()=> toggleTodosArticulos(card));
    $(".btn-talles-clear", card).addEventListener("click", ()=> limpiarTalles(card));
    $(".btn-talles-todos", card).addEventListener("click", ()=> toggleTodosTalles(card));

    grid.appendChild(card);
  }

  host.innerHTML="";
  host.appendChild(grid);
}

/* Expandir una tarjeta */
function expandirPromoCard(promoId){
  const host=$("#promosGrid");
  const allCards = $$(".promo-card", host);

  allCards.forEach(c=>{
    c.classList.remove("expanded");
    c.style.gridColumn = "";
  });

  const card=$(`.promo-card[data-pid="${CSS.escape(promoId)}"]`, host);
  if(!card) return;

  card.classList.add("expanded");
  card.style.gridColumn = "1 / -1";

  const p = PROMOS.find(x=>x.id===promoId);
  promoActual = p || null;

  renderArticulosEn(card, p);
  renderTallesEn(card, p);

  $(".cm",card).textContent="0";
  $(".sm",card).textContent="0";

  card.scrollIntoView({behavior:"smooth", block:"start"});
}

/* Utilidad: metadata del artículo por código */
function getItemMeta(promo, codigo){
  if(!promo) return null;
  return (promo.items||[]).find(it => String(it.codigo).trim().toLowerCase() === String(codigo).trim().toLowerCase()) || null;
}

/* ===== Artículos ===== */
function renderArticulosEn(card, promo){
  const cont=$(".artList", card); if(!cont) return;
  const items = (promo?.items || []).slice();

  cont.innerHTML = items.map(it => `
    <div class="item" data-codigo="${escapeHtml(it.codigo)}" title="${escapeHtml(it.codigo + (it.desc ? ' — ' + it.desc : ''))}">
      ${escapeHtml(it.codigo)}
    </div>
  `).join("");

  $$(".item", cont).forEach(div=>{
    div.addEventListener("click", ()=>{
      div.classList.toggle("selected");
      $(".cm",card).textContent = String($$(".item.selected", cont).length);
    });
  });
}
function getCodigosSeleccionados(card){
  return $$(".item.selected", $(".artList",card)).map(n=>n.dataset.codigo);
}
function limpiarCard(card){
  $$(".item.selected", card).forEach(n=>n.classList.remove("selected"));
  $(".cantidad",card).value="";
  $(".cm",card).textContent="0";
  limpiarTalles(card);
}
function toggleTodosArticulos(card){
  const cont=$(".artList", card);
  if(!cont) return;
  const items=$$(".item", cont);
  const allSelected=items.length && items.every(i=>i.classList.contains("selected"));
  items.forEach(i=>i.classList.toggle("selected", !allSelected));
  $(".cm",card).textContent=String($$(".item.selected", cont).length);
}

/* ===== Talles ===== */
function renderTallesEn(card, promo){
  const cont=$(".tallesList", card); if(!cont) return;
  const list=(promo?.talles||[]).slice().sort((a,b)=>{
    const na=Number(a), nb=Number(b);
    return (Number.isFinite(na)&&Number.isFinite(nb)) ? na-nb : String(a).localeCompare(String(b),"es");
  });

  cont.innerHTML = list.length ? list.map(t => `
    <label class="chk">
      <input type="checkbox" name="talleCard" value="${escapeHtml(t)}">
      <span>${escapeHtml(t)}</span>
    </label>
  `).join("") : `<div class="empty">Sin talles cargados</div>`;

  $$('input[name="talleCard"]', cont).forEach(chk=>{
    chk.addEventListener("change", ()=>{
      $(".sm",card).textContent = String($$('input[name="talleCard"]:checked', cont).length);
    });
  });
}
function getTallesSeleccionados(card){
  return $$('input[name="talleCard"]:checked', card).map(i=>i.value);
}
function limpiarTalles(card){
  $$('input[name="talleCard"]', card).forEach(i=> i.checked=false);
  const cont=$(".tallesList", card);
  if(cont) $(".sm",card).textContent = String($$('input[name="talleCard"]:checked', cont).length);
}
function toggleTodosTalles(card){
  const inputs=$$('input[name="talleCard"]', card);
  const allSelected = inputs.length && inputs.every(i=>i.checked);
  inputs.forEach(i=> i.checked = !allSelected);
  const cont=$(".tallesList", card);
  if(cont) $(".sm",card).textContent = String($$('input[name="talleCard"]:checked', cont).length);
}

/* ===== Alta al pedido ===== */
function agregarDesdeCard(card, p, {modo}){
  if(!p) return alerta("Elegí una promoción primero.");
  const codigos = getCodigosSeleccionados(card);
  const total = parseInt($(".cantidad",card)?.value||"0",10)||0;
  if(!codigos.length) return alerta("Seleccioná al menos un artículo.");
  if(total<=0) return alerta("Ingresá una cantidad válida.");

  // Talles elegidos o todos
  let talles = getTallesSeleccionados(card);
  if(!talles.length) talles = (p.talles||[]).slice();
  if(!talles.length) talles.push("ÚNICO");

  if(modo==="normal"){
    for(const codigo of codigos){
      const meta = getItemMeta(p, codigo);
      const desc = meta?.desc || "";
      for(const t of talles){
        pedido.push({ codigo, desc, talle: t, cantidad: total });
      }
    }
  }else{
    const base=Math.floor(total/talles.length); let resto=total%talles.length;
    const reparto=talles.map(t=>({talle:t, qty: base+(resto-- > 0 ? 1:0)})).filter(r=>r.qty>0);
    for(const codigo of codigos){
      const meta = getItemMeta(p, codigo);
      const desc = meta?.desc || "";
      for(const r of reparto){
        pedido.push({ codigo, desc, talle:r.talle, cantidad:r.qty });
      }
    }
  }

  renderPedido();
}

/* ===== Pedido (columna DERECHA) ===== */
function renderPedido(){
  const wrap=$("#pedidoWrap"); if(!wrap) return;
  const agrupado=getPedidoAgrupado();

  if(!agrupado.length){
    wrap.innerHTML=`<div class="empty">Sin ítems en el pedido.</div>`;
    setText("count","0"); guardarLS(); return;
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

/* ===== Copiar & PDF ===== */
async function copiarPedido(){
  const agrupado=getPedidoAgrupado(); if(!agrupado.length) return alerta("No hay nada para copiar.");
  const txt=agrupado.map(p=>[p.codigo,p.desc||"",p.talle,p.cantidad].join("\t")).join("\n");
  await navigator.clipboard.writeText(txt); alerta("Pedido copiado.");
}
function exportarPDF(){
  const agrupado=getPedidoAgrupado(); if(!agrupado.length) return alerta("No hay nada para exportar.");
  const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:"pt",format:"a4"});
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.text(`LOCAL: ${$("#sucursalSelect")?.value||"sin-sucursal"}`,40,40);
  doc.text(`PEDIDO – ${toLocalDateStr()}`,40,60);

  // Leyenda de extras (derecha, a la altura de la sucursal)
  const extrasTxt = buildExtrasLegend();
  if(extrasTxt){
    doc.setFontSize(11);
    doc.text(extrasTxt, pageW-40, 40, { align: 'right' });
  }

  doc.autoTable({ head:[["ART","DESCRIPCIÓN","TALLE","CANT."]],
    body: agrupado.map(p=>[p.codigo,p.desc||"",String(p.talle),String(p.cantidad)]), startY:80 });
  const suc = $("#sucursalSelect")?.value||"sin-sucursal";
  doc.save(`Pedido_${suc}_${toLocalDateStr()}.pdf`);
}

/* === Extras: leyenda y estado UI === */
function buildExtrasLegend(){
  const parts = [];
  if(addCinta) parts.push("Se agregan cintas");
  const selBolsas = Object.entries(bolsas).filter(([,v])=>v).map(([k])=>k);
  if(selBolsas.length) parts.push(`Se agregan bolsas: ${selBolsas.join(", ")}`);
  return parts.join(" · ");
}
function updateExtrasUI(){
  const cintaChip = $("#cintaChip");
  if(cintaChip){
    cintaChip.textContent = `Cinta: ${addCinta? 'sí':'no'}`;
    cintaChip.classList.toggle('on', addCinta);
    cintaChip.classList.toggle('muted', !addCinta);
  }
  const bolsasChip = $("#bolsasChip");
  if(bolsasChip){
    const sel = Object.entries(bolsas).filter(([,v])=>v).map(([k])=>k);
    bolsasChip.textContent = sel.length ? `Bolsas: ${sel.join(', ')}` : 'Bolsas: —';
    bolsasChip.classList.toggle('on', sel.length>0);
    bolsasChip.classList.toggle('muted', sel.length===0);
  }
}

/* ===== Persistencia ===== */
function guardarLS(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(pedido)); }catch{} }
function cargarLS(){ try{ const raw=localStorage.getItem(LS_KEY); if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr)) pedido=arr; } }catch{} }

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", ()=>{
  initSucursalSelect();
  cargarLS(); renderPedido();
  cargarPromos();
  enlazarBusquedaPromo();

  $("#copiar").onclick=copiarPedido;
  $("#vaciar").onclick=()=>{ pedido=[]; renderPedido(); };
  $("#btnPDF").onclick=exportarPDF;

  // Extras
  const picker = $("#bolsasPicker");
  $("#btnCinta").onclick = ()=>{ addCinta = !addCinta; updateExtrasUI(); };
  $("#btnBolsas").onclick = ()=>{ picker.classList.toggle("show"); };
  picker?.addEventListener('change', (ev)=>{
    if(ev.target && ev.target.name === 'bolsaOpt'){
      bolsas[ev.target.value] = ev.target.checked;
      updateExtrasUI();
    }
  });

  updateExtrasUI();
});
