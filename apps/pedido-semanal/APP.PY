import re
import csv
import json

# Leer app.js
with open("app.js", "r", encoding="utf-8") as f:
    js_content = f.read()

# 1. Extraer el array completo const PROMOS = [ ... ];
array_match = re.search(r"const\s+PROMOS\s*=\s*(\[.*?\]);", js_content, re.DOTALL)
if not array_match:
    print("❌ No encontré el array PROMOS en app.js")
    exit()

array_text = array_match.group(1)

# 2. Convertir a JSON válido (truco: reemplazar comillas simples por dobles, etc.)
# Esto es un parche rápido, se puede mejorar con un parser real
json_text = array_text
json_text = re.sub(r"(\w+):", r'"\1":', json_text)  # claves sin comillas -> con comillas
json_text = json_text.replace("'", '"')             # comillas simples -> dobles

# Quitar comentarios y comas colgantes
json_text = re.sub(r"//.*", "", json_text)
json_text = re.sub(r",\s*}", "}", json_text)
json_text = re.sub(r",\s*]", "]", json_text)

# 3. Cargar como JSON
try:
    promos = json.loads(json_text)
except Exception as e:
    print("❌ Error al parsear a JSON:", e)
    exit()

# 4. Extraer filas
rows = []
for promo in promos:
    id_ = promo.get("id", "")
    marca = promo.get("marca", "")
    nombre = promo.get("nombre", "")
    precios = promo.get("precios", {})
    talles = "|".join(promo.get("talles", []))

    for item in promo.get("items", []):
        rows.append([
            id_,
            marca,
            nombre,
            item.get("codigo", ""),
            item.get("desc", ""),
            item.get("familia", ""),
            talles,
            precios.get("uno", ""),
            precios.get("tres", ""),
            precios.get("cantidad", "")
        ])

# 5. Guardar CSV
with open("promos.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["id","marca","nombre","codigo","desc","familia","talles","precio_uno","precio_tres","precio_cantidad"])
    writer.writerows(rows)

print(f"✅ Archivo promos.csv generado con {len(rows)} registros")
