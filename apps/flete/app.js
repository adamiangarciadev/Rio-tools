const API = "https://script.google.com/macros/s/AKfycbxuI6mHMR6ukB_WE4P_QFgUIt7I2ovnxFilQZH646gWTnPQNJSv5H_5siuD5WqgoLWzSw/exec";

const sucursalSelect = document.getElementById("sucursal");
const lista = document.getElementById("lista");

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
  sucursalSelect.addEventListener("change", cargar);

  // opcional: recordar última sucursal
  const last = localStorage.getItem("sucursal");
  if (last) {
    sucursalSelect.value = last;
    cargar();
  }
});

// =========================
// CARGAR REMITOS
// =========================
async function cargar() {
  const sucursal = sucursalSelect.value;

  if (!sucursal) return;

  localStorage.setItem("sucursal", sucursal);

  lista.innerHTML = `<p class="loading">Cargando remitos...</p>`;

  try {
    const res = await fetch(`${API}?accion=listar&sucursal=${encodeURIComponent(sucursal)}`);
    const data = await res.json();

    lista.innerHTML = "";

    if (!data.ok) {
      throw new Error(data.error || "Error API");
    }

    if (!data.remitos || data.remitos.length === 0) {
      lista.innerHTML = `<p class="empty">No hay remitos para este destino</p>`;
      return;
    }

    render(data.remitos);

  } catch (err) {
    console.error(err);
    lista.innerHTML = `<p class="empty">Error cargando datos</p>`;
  }
}

// =========================
// RENDER CARDS
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

      <button data-id="${r.id}">
        RETIRADO
      </button>
    `;

    const btn = card.querySelector("button");

    btn.addEventListener("click", () => retirar(r.id, btn, card));

    lista.appendChild(card);
  });
}

// =========================
// RETIRAR REMITO
// =========================
async function retirar(id, btn, card) {
  // evitar doble click
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

    if (!data.ok) {
      throw new Error(data.error || "Error al actualizar");
    }

    // feedback visual
    card.style.opacity = "0.4";
    btn.innerText = "✔ ENVIADO";

    // vibración en celular (si soporta)
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    // recargar lista después de 1s
    setTimeout(() => {
      cargar();
    }, 800);

  } catch (err) {
    console.error(err);

    btn.disabled = false;
    btn.innerText = "REINTENTAR";

    alert("Error al enviar");
  }
}