# RÍO Tools — identidad visual

La fuente de marca es `01_Identidad`, entregada por el usuario. Reemplaza la dirección violeta anterior en la portada y las 25 aplicaciones.

## Recursos y colores

Los logotipos y símbolos se exportan como trazados SVG desde `01_Identidad/01_Logotipo/rio-identidad.pdf`, sin reconstruir letras ni cambiar proporciones. La firma RÍO Lencería aparece junto a un descriptor separado de Tools. El símbolo original aparece también en portada y favicon.

Paleta RGB confirmada en vectores PDF y PNG suministrados:

- Coral: `#FF5F5C`.
- Violeta: `#7F7EFF`.
- Verde: `#4CCCAD`.

El PDF repite la referencia Pantone del coral en la muestra violeta. La web toma el RGB del propio arte, sin inventar una referencia Pantone.

## Tipografía

Gotham Book, Medium y Bold en contenido, formularios y títulos. Gotham Rounded Medium en navegación. Los WOFF2 de `assets/identity/` se convierten de los OTF suministrados. Las letras del logotipo siempre son el vector original.

## Interfaces

Coral para acciones principales; violeta y verde para categorías y acentos secundarios. Fondos cálidos neutros y superficies blancas. Tonos derivados proporcionan contraste para texto pequeño; los colores de marca no sustituyen el significado de éxito, advertencia o error.

`assets/rio-identity.css` se carga al final en los 28 documentos HTML: portada, 25 aplicaciones y dos páginas de respaldo. `tools/build-rio-identity.py` reproduce recursos desde los originales (PyMuPDF, fontTools y Brotli).

Se mantienen búsqueda, favoritos, recientes y navegación compacta sticky. Logos sin deformación y símbolo decorativo grande solo cuando hay espacio. Recursos locales y rutas relativas compatibles con GitHub Pages bajo `/Rio-tools/`.
