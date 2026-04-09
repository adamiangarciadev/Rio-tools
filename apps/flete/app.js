const API = "https://script.google.com/macros/s/AKfycbxuI6mHMR6ukB_WE4P_QFgUIt7I2ovnxFilQZH646gWTnPQNJSv5H_5siuD5WqgoLWzSw/exec";

const sucursalSelect = document.getElementById("sucursal");
const lista = document.getElementById("lista");
const inputBuscar = document.getElementById("buscar");

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarSucursales();

  sucursalSelect.addEventListener("change", () => {
    guardarSucursal();
    cargar();
  });

  if (inputBuscar) {
    inputBuscar.addEventListener("input", debounce(cargar, 300));
  }

  // restaurar última sucursal
  const last = localStorage.getItem("sucursal");
  if (last) {
    sucursalSelect.value = last;
    cargar();
  }
});

// =========================
// GUARDAR SUCURSAL
// =========================
function guardarSucursal() {
  localStorage.setItem("sucursal", sucursalSelect.value);
}

// =========================
// CARGAR SUCURSALES
// =========================
async function cargarSucursales() {
  try {
    const res = await fetch(`${API}?accion=sucursales`);
    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    sucursalSelect.innerHTML = `<option value="">Seleccionar destino</option>`;

    if (!data.sucursales || data.sucursales.length === 0) {
      sucursalSelect.innerHTML = `<option value="">Sin sucursales</option>`;
      return;
    }

    data.sucursales.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sucursalSelect.appendChild(opt);
    });

  } catch (err) {
    console.error(err);
    sucursalSelect.innerHTML = `<option value="">Error cargando sucursales</option>`;
  }
}

// =========================
// CARGAR REMITOS
// =========================
async function cargar() {
  const sucursal = sucursalSelect.value;
  const buscar = inputBuscar ? inputBuscar.value.trim() : "";

  // ❗ SOLO bloquear si NO hay sucursal Y NO hay búsqueda
  if (!sucursal && !buscar) {
    lista.innerHTML = `<p class="empty">Seleccionar destino o buscar</p>`;
    return;
  }

  lista.innerHTML = `<p class="loading">Cargando...</p>`;

  try {
    const res = await fetch(
      `${API}?accion=listar&sucursal=${encodeURIComponent(sucursal)}&buscar=${encodeURIComponent(buscar)}`
    );

    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    if (!data.remitos || data.remitos.length === 0) {
      lista.innerHTML = `<p class="empty">Sin resultados</p>`;
      return;
    }

    render(data.remitos);

  } catch (err) {
    console.error(err);
    lista.innerHTML = `<p class="empty">Error cargando datos</p>`;
  }
}

// =========================
// RENDER
// =========================
function render(remitos) {
  lista.innerHTML = "";

  remitos.forEach(r => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="row">
        <span class="label">Remito</span>
        <span class="value">${r.remito}</span>
      </div>

      <div class="row">
        <span class="label">Desde</span>
        <span class="value">${r.desde}</span>
      </div>

      <div class="row">
        <span class="label">Destino</span>
        <span class="value">${r.hacia}</span>
      </div>

      <div class="row">
        <span class="label">Estado</span>
        <span class="value estado">${r.estado}</span>
      </div>

      <button>RETIRADO</button>
    `;

    const btn = card.querySelector("button");
    btn.addEventListener("click", () => retirar(r.id, btn, card));

    lista.appendChild(card);
  });
}

// =========================
// RETIRAR
// =========================
async function retirar(id, btn, card) {
  btn.disabled = true;
  btn.innerText = "ENVIANDO...";

  try {
    const res = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        accion: "retirado",
        id: id
      })
    });

    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    // feedback visual
    card.style.opacity = "0.5";
    btn.innerText = "✔ ENVIADO";

    // vibración si es celular
    if (navigator.vibrate) {
      navigator.vibrate(80);
    }

    setTimeout(cargar, 700);

  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.innerText = "REINTENTAR";
  }
}

// =========================
// DEBOUNCE
// =========================
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}