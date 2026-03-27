# 🛠️ RIO Tools Suite

> **Suite de herramientas internas para operaciones, depósito, e-commerce y administración.**  
> Desarrollado y mantenido por [@adamiangarciadev](https://github.com/adamiangarciadev)

![HTML](https://img.shields.io/badge/HTML-12.9%25-orange?style=flat-square&logo=html5)
![CSS](https://img.shields.io/badge/CSS-14.0%25-blue?style=flat-square&logo=css3)
![JavaScript](https://img.shields.io/badge/JavaScript-72.8%25-yellow?style=flat-square&logo=javascript)
![Python](https://img.shields.io/badge/Python-0.3%25-green?style=flat-square&logo=python)
![Estado](https://img.shields.io/badge/estado-en%20desarrollo-brightgreen?style=flat-square)
![Uso](https://img.shields.io/badge/uso-interno-lightgrey?style=flat-square)

---

## 📋 Descripción

**RIO Tools Suite** es una plataforma web de uso interno diseñada para centralizar y digitalizar los flujos de trabajo diarios de una empresa de distribución/retail. La suite agrupa herramientas específicas organizadas en cuatro grandes áreas: **Operaciones**, **E-commerce**, **Depósito** y **Administración**.

La aplicación está alojada en **GitHub Pages** y no requiere servidor backend para su funcionamiento principal, siendo accesible desde cualquier dispositivo con un navegador moderno.

---

## 🗂️ Estructura del Proyecto

```
Rio-tools/
├── index.html              # Dashboard principal (landing de la suite)
├── apps/                   # Módulos / herramientas individuales
│   ├── entrada-mercaderia/
│   ├── mercaderia-transito/
│   ├── etiquetas/
│   ├── asistencia/
│   ├── control-remitos-clientes/
│   ├── categorizador/
│   ├── pedidos-web/
│   ├── pedidos-web-locales/
│   ├── banco-medios/
│   ├── picking-salida/
│   ├── pedido-semanal/
│   ├── pedido-carteleria/
│   ├── archivos-administrativos/
│   └── confirmacion-depositos/
└── data/                   # Archivos de datos estáticos (CSV, JSON, etc.)
```

---

## 🚀 Módulos Disponibles

### 🟦 Operaciones — *Flujo diario*

| Herramienta | Descripción |
|---|---|
| **Entrada de Mercadería** | Ingreso de productos por escaneo, control contra equivalencias y archivos CSV. |
| **Mercadería en Tránsito** | Ingreso de remitos en sucursal para control de stock en movimiento. |
| **Generador de Etiquetas** | Generación automática de etiquetas a partir de equivalencias y datos de producto. |
| **Asistencia Personal** | Registro de asistencia, faltas, permisos y vacaciones del personal. |
| **Control de Remitos de Clientes** | Control y seguimiento de remitos emitidos para clientes. |

---

### 🟧 E-commerce — *Tiendanube*

| Herramienta | Descripción |
|---|---|
| **Categorizador** | Normalización y categorización de productos para publicación en Tiendanube. |
| **Pedidos Web** | Gestión y armado de pedidos recibidos desde el canal online. |
| **Pedidos Web Locales** | Control de entrada y retiro de pedidos web en sucursales, con seguimiento de estado y entrega. |
| **Contenido / Videos** | Banco de videos oficiales de productos para descargar y usar en locales y mayoristas. |

---

### 🟩 Depósito — *Planificación*

| Herramienta | Descripción |
|---|---|
| **Picking Salida** | Preparación de pedidos por código de barras, con validación y control de salida. |
| **Pedido Semanal** | Armado de pedidos semanales basado en curva de ventas, históricos y promociones. |

---

### 🟥 Administración — *Soporte*

| Herramienta | Descripción |
|---|---|
| **Pedido de Cartelería** *(Próximamente)* | Solicitud y seguimiento de cartelería para locales, promociones y campañas. |
| **Planillas, Cuentas, etc.** | Acceso a planillas diarias, rótulos, manuales y cuentas para depósitos. |
| **Depósitos para Confirmar** | Solicitud de confirmación de depósitos y transferencias bancarias. |

---

## 🧰 Stack Tecnológico

- **HTML5** — Estructura y markup semántico
- **CSS3** — Estilos, diseño responsivo, variables CSS (tema oscuro nativo)
- **JavaScript (Vanilla)** — Lógica de cada herramienta, manejo de CSV, escaneo de códigos de barra
- **Python** — Scripts de soporte / procesamiento de datos
- **GitHub Pages** — Hosting estático sin configuración de servidor

---

## 🎨 Diseño

La interfaz utiliza un **tema oscuro personalizado** con variables CSS, layout en grilla de 4 columnas para escritorio con adaptación responsiva a 2 columnas y 1 columna en pantallas menores. El diseño apunta a claridad y velocidad de uso en entornos operativos.


---

## 📊 Analítica

La suite integra **Google Analytics (GA4)** para el seguimiento de uso interno (`G-CDPZFHV1BV`).

---

## 🔒 Uso

Este proyecto es de **uso interno exclusivo**. No está pensado para distribución pública ni uso externo.

---

## 👨‍💻 Autor

**Adamian Garcia**  
[@adamiangarciadev](https://github.com/adamiangarciadev)  
ADAMIANGARCIADEV® — Todos los derechos reservados.

---

## 📝 Licencia

Proyecto privado — Uso interno. Sin licencia pública definida.
