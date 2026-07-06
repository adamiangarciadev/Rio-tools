from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "der-picking-salida.pdf"


PAGE_W, PAGE_H = landscape(A3)


def draw_round_rect(c, x, y, w, h, fill, stroke=colors.HexColor("#26313d")):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=1)


def fit_text(c, text, x, y, max_w, font="Helvetica", size=8, min_size=5.5):
    text = str(text)
    s = size
    while s > min_size and c.stringWidth(text, font, s) > max_w:
        s -= 0.25
    c.setFont(font, s)
    c.drawString(x, y, text)


def entity(c, name, fields, x, y, w=62 * mm, header_h=9 * mm, row_h=5.4 * mm, accent="#2f80ed"):
    h = header_h + row_h * len(fields) + 5
    draw_round_rect(c, x, y, w, h, colors.HexColor("#f7fafc"), colors.HexColor("#9aa7b3"))
    c.setFillColor(colors.HexColor(accent))
    c.roundRect(x, y + h - header_h, w, header_h, 6, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 4, y + h - 6.2 * mm, name)
    c.setFillColor(colors.HexColor("#17212b"))
    yy = y + h - header_h - 4.2 * mm
    for raw in fields:
        c.setFont("Helvetica", 7.3)
        if raw.startswith("PK ") or raw.startswith("FK "):
            c.setFont("Helvetica-Bold", 7.3)
        fit_text(c, raw, x + 4, yy, w - 8, size=7.3)
        yy -= row_h
    return {"x": x, "y": y, "w": w, "h": h, "cx": x + w / 2, "cy": y + h / 2}


def anchor(box, side):
    if side == "l":
        return box["x"], box["cy"]
    if side == "r":
        return box["x"] + box["w"], box["cy"]
    if side == "t":
        return box["cx"], box["y"] + box["h"]
    return box["cx"], box["y"]


def rel(c, a, aside, b, bside, label, c1="1", c2="N", bend=None):
    x1, y1 = anchor(a, aside)
    x2, y2 = anchor(b, bside)
    c.setStrokeColor(colors.HexColor("#364656"))
    c.setFillColor(colors.HexColor("#17212b"))
    c.setLineWidth(1.2)
    if bend:
        bx, by = bend
        c.line(x1, y1, bx, by)
        c.line(bx, by, x2, y2)
        lx, ly = (bx + x2) / 2, (by + y2) / 2
    else:
        c.line(x1, y1, x2, y2)
        lx, ly = (x1 + x2) / 2, (y1 + y2) / 2
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x1 + (2 if aside == "r" else -9), y1 + 3, c1)
    c.drawString(x2 + (-9 if bside == "r" else 2), y2 + 3, c2)
    c.setFont("Helvetica", 6.8)
    tw = c.stringWidth(label, "Helvetica", 6.8)
    c.setFillColor(colors.white)
    c.rect(lx - tw / 2 - 2, ly - 4, tw + 4, 9, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#17212b"))
    c.drawString(lx - tw / 2, ly - 1.5, label)


def title(c):
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("Helvetica-Bold", 18)
    c.drawString(16 * mm, PAGE_H - 16 * mm, "DER logico - App Picking Salida")
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#4b5563"))
    c.drawString(
        16 * mm,
        PAGE_H - 22 * mm,
        "Basado en apps/picking-salida/app.js, index.html y data/equivalencia*.csv. No hay base SQL: el modelo combina CSV, localStorage, Apps Script, Google Sheets y Drive.",
    )


def legend(c):
    x, y = 16 * mm, 12 * mm
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y + 16, "Leyenda")
    c.setFont("Helvetica", 7.2)
    c.setFillColor(colors.HexColor("#374151"))
    c.drawString(x, y + 6, "PK = clave primaria logica. FK = relacion inferida. 1/N = cardinalidad operativa observada.")
    c.drawString(x, y - 4, "Las entidades con borde/descripcion operativa representan almacenamiento externo o temporal, no tablas locales.")


def page_one(c):
    title(c)
    boxes = {}
    top = PAGE_H - 62 * mm
    boxes["resp"] = entity(c, "RESPONSABLE", ["PK nombre", "valor de selector fijo"], 16 * mm, top, w=48 * mm, accent="#2563eb")
    boxes["suc"] = entity(c, "SUCURSAL", ["PK nombre", "rol posible: origen", "rol posible: destino", "script_url si es origen"], 16 * mm, top - 56 * mm, w=54 * mm, accent="#2563eb")
    boxes["sess"] = entity(
        c,
        "SESION_PICKING",
        [
            "PK session_id (logico)",
            "FK responsable_nombre",
            "FK origen_sucursal",
            "FK destino_sucursal",
            "bultos",
            "remito_actual",
            "estado_guardado",
        ],
        112 * mm,
        top - 24 * mm,
        w=66 * mm,
        accent="#0f766e",
    )
    boxes["scan"] = entity(
        c,
        "ESCANEO",
        [
            "PK id local",
            "FK session_id",
            "code",
            "ok",
            "time ISO",
            "orden_txt",
        ],
        218 * mm,
        top - 23 * mm,
        w=58 * mm,
        accent="#0f766e",
    )
    boxes["eq"] = entity(
        c,
        "EQUIVALENCIA_CODIGO",
        [
            "PK codigo",
            "FK articulo",
            "color / descripcion",
            "talle / descripcion_2",
            "source_csv",
        ],
        324 * mm,
        top - 25 * mm,
        w=66 * mm,
        accent="#7c3aed",
    )
    boxes["art"] = entity(c, "ARTICULO", ["PK articulo", "descripcion comercial"], 318 * mm, 79 * mm, w=56 * mm, accent="#7c3aed")
    boxes["var"] = entity(
        c,
        "VARIANTE_ARTICULO",
        ["PK articulo + color + talle", "FK articulo", "color", "talle", "cantidad derivada"],
        225 * mm,
        74 * mm,
        w=58 * mm,
        accent="#7c3aed",
    )
    boxes["rem"] = entity(
        c,
        "REMITO_CUADERNILLO",
        [
            "PK remito",
            "fecha dd/mm/yyyy",
            "FK origen_sucursal",
            "FK destino_sucursal",
            "bultos",
            "responsable",
            "aclaracion",
        ],
        112 * mm,
        59 * mm,
        w=62 * mm,
        accent="#b45309",
    )
    boxes["txt"] = entity(
        c,
        "ARCHIVO_TXT_DRIVE",
        [
            "PK fileName",
            "FK remito",
            "FK origen_sucursal",
            "folderName = destino",
            "mimeType text/plain",
            "content = codigos",
        ],
        16 * mm,
        52 * mm,
        w=60 * mm,
        accent="#b45309",
    )

    rel(c, boxes["resp"], "r", boxes["sess"], "l", "configura", "1", "N")
    rel(c, boxes["suc"], "r", boxes["sess"], "l", "origen/destino", "1", "N", bend=(94 * mm, top - 31 * mm))
    rel(c, boxes["sess"], "r", boxes["scan"], "l", "contiene", "1", "N")
    rel(c, boxes["scan"], "r", boxes["eq"], "l", "valida por code", "N", "0..1")
    rel(c, boxes["eq"], "b", boxes["art"], "t", "pertenece", "N", "1")
    rel(c, boxes["art"], "l", boxes["var"], "r", "tiene", "1", "N")
    rel(c, boxes["sess"], "b", boxes["rem"], "t", "crea al guardar", "1", "0..1")
    rel(c, boxes["rem"], "l", boxes["txt"], "r", "nombra REM", "1", "1")
    rel(c, boxes["suc"], "b", boxes["txt"], "t", "elige endpoint", "1", "N")
    legend(c)


def bullet(c, x, y, text, bold=None):
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("Helvetica", 8.2)
    if bold:
        c.setFont("Helvetica-Bold", 8.2)
        c.drawString(x, y, bold)
        x += c.stringWidth(bold + " ", "Helvetica-Bold", 8.2)
        c.setFont("Helvetica", 8.2)
    c.drawString(x, y, text)


def page_two(c):
    title(c)
    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(colors.HexColor("#111827"))
    c.drawString(16 * mm, PAGE_H - 38 * mm, "Como funciona el flujo")
    steps = [
        ("1. Configuracion:", "responsable, origen, destino y bultos se guardan en localStorage como pickeo_meta_v1."),
        ("2. Catalogo:", "al iniciar, la app carga ../../data/equivalencia.csv y ../../data/equivalencia2.csv e indexa por Codigo."),
        ("3. Escaneo:", "cada lectura genera un ESCANEO con id, code, ok y time; se persiste en pickeo_scans_v1."),
        ("4. Validacion:", "ok=true si el codigo existe en los CSV o si cumple articulo!color!talle."),
        ("5. Conteo:", "el panel agrupa escaneos por articulo/color/talle; no es una tabla, es una vista derivada."),
        ("6. Guardado:", "primero crea REMITO_CUADERNILLO via Apps Script con accion crear_remito."),
        ("7. TXT:", "despues arma un archivo .txt con los codigos en orden de captura y lo guarda en Drive del origen."),
        ("8. Limpieza:", "si el guardado responde OK, la app borra los escaneos locales y queda lista para otro picking."),
    ]
    y = PAGE_H - 50 * mm
    for b, t in steps:
        bullet(c, 18 * mm, y, t, b)
        y -= 9 * mm

    c.setFont("Helvetica-Bold", 13)
    c.drawString(16 * mm, y - 4 * mm, "Observaciones tecnicas")
    y -= 15 * mm
    notes = [
        "El DER es logico: no existe una base relacional local declarada en el repo.",
        "REMITO_CUADERNILLO representa la fila que crea el Apps Script remoto en la planilla del cuadernillo.",
        "ARCHIVO_TXT_DRIVE representa el archivo final en Google Drive, no una tabla.",
        "Solo SARMIENTO, AV2, PUEYRREDON y DEPOSITO tienen endpoint de guardado TXT configurado como origen.",
        "El contenido del TXT conserva solo los codigos escaneados, uno por linea.",
    ]
    c.setFont("Helvetica", 8.2)
    for n in notes:
        c.drawString(20 * mm, y, "- " + n)
        y -= 7 * mm

    c.setFont("Helvetica-Bold", 13)
    c.drawString(16 * mm, y - 4 * mm, "Fuentes revisadas")
    y -= 15 * mm
    refs = [
        "apps/picking-salida/app.js: configuracion, localStorage, carga CSV, validacion, remito y TXT.",
        "apps/picking-salida/index.html: controles de usuario y estructura de pantalla.",
        "data/equivalencia.csv y data/equivalencia2.csv: Codigo, Articulo, Descripcion, Descripcion.",
    ]
    c.setFont("Helvetica", 8.2)
    for r in refs:
        c.drawString(20 * mm, y, "- " + r)
        y -= 7 * mm
    legend(c)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=landscape(A3))
    c.setTitle("DER logico - App Picking Salida")
    c.setAuthor("Codex")
    page_one(c)
    c.showPage()
    page_two(c)
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
