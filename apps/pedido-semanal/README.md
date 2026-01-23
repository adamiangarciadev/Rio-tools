# Pedido a Proveedores – Demo (HTML/CSS/JS)
Estructura separada en 3 archivos.

## Archivos
- `index.html` – estructura y layout
- `styles.css` – estilos base (sin frameworks)
- `app.js` – lógica de selección, armado de pedido y descarga TXT

## Cómo correr
Abrí `index.html` en tu navegador. No necesita servidor.

## Cómo agregar promociones
Editá el array `PROMOS` dentro de `app.js`. Ejemplo:

```js
{
  id: 'kaury-conjuntos',
  marca: 'KAURY',
  nombre: 'PROMO CONJUNTOS KAURY',
  precios: { uno: 9000, tres: 7500, cantidad: 6500 },
  talles: ['85','90','95','100','105','110'],
  items: [
    { codigo:'29-337', desc:'Conjunto KAURY', familia:'Conjunto KAURY' },
    // ...
  ]
}
```
