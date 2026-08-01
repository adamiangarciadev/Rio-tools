from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import cm
from reportlab.pdfbase.pdfmetrics import stringWidth


OUT = r"D:\Damian\Rio-tools\output\pdf\muestra_numeros_vendedora_247.pdf"
W, H = A4
CARD_W = 9 * cm
CARD_H = 7 * cm
LEFT = (W - 2 * CARD_W) / 2
BOTTOM = (H - 4 * CARD_H) / 2


def centered(c, text, x, baseline, width, font, size, color):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x + (width - stringWidth(text, font, size)) / 2, baseline, text)


def card(c, x, y, label, accent, code="247", seller_name="MARIA"):
    # Fine dashed outline doubles as a cutting guide.
    c.saveState()
    c.setFillColor(white)
    c.setStrokeColor(HexColor("#8B96A5"))
    c.setLineWidth(0.65)
    c.setDash(3, 2)
    c.rect(x, y, CARD_W, CARD_H, fill=1, stroke=1)
    c.restoreState()

    c.setFillColor(accent)
    c.rect(x + 7, y + CARD_H - 37, CARD_W - 14, 28, fill=1, stroke=0)
    centered(c, label, x, y + CARD_H - 29, CARD_W, "Helvetica-Bold", 13, white)
    centered(c, code, x, y + 65, CARD_W, "Helvetica-Bold", 61, HexColor("#162033"))
    centered(c, seller_name, x, y + 45, CARD_W, "Helvetica-Bold", 10, HexColor("#66758A"))


c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("Muestra - Carteles de vendedora 247")

# 8 cards, each exactly 9 x 7 cm: 1 principal, 4 Lista 3, 2 Lista 1, 1 Lista 2.
cards = [
    ("PRINCIPAL", HexColor("#2563EB")),
    ("LISTA 3", HexColor("#0EA5A6")),
    ("LISTA 3", HexColor("#0EA5A6")),
    ("LISTA 3", HexColor("#0EA5A6")),
    ("LISTA 3", HexColor("#0EA5A6")),
    ("LISTA 1", HexColor("#F97316")),
    ("LISTA 1", HexColor("#F97316")),
    ("LISTA 2", HexColor("#8B5CF6")),
]

for i, (label, color) in enumerate(cards):
    row, col = divmod(i, 2)
    x = LEFT + col * CARD_W
    y = H - BOTTOM - (row + 1) * CARD_H
    card(c, x, y, label, color)

c.showPage()
c.save()
print(OUT)
