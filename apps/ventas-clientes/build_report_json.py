import argparse
import csv
import json
import math
import unicodedata
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path


STORE_FILE_NAME = "ventas_clientes_store.json"
REPORT_FILE_NAME = "ventas_clientes_report.json"
WARNINGS_FILE_NAME = "ventas_clientes_warnings.json"


def normalize_key(value):
    text = str(value or "").strip().lower()
    text = "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )
    return " ".join(text.split())


def normalize_header(value):
    return normalize_key(value)


def is_discarded_client(client_id, client_name):
    client_id = normalize_key(client_id)
    client_name = normalize_key(client_name)
    return (
        client_id in {"cf", "0"}
        or client_name in {"consumidor final", "cliente consumidor final", "cf"}
    )


def parse_date(value):
    text = str(value or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    return None


def parse_amount(value):
    text = str(value or "").strip().replace(".", "").replace(",", ".")
    try:
        n = float(text)
        return n if math.isfinite(n) else 0.0
    except ValueError:
        return 0.0


def round2(value):
    return round(float(value or 0), 2)


def round4(value):
    return round(float(value or 0), 4)


def month_add(year, month, delta):
    month_index = (year * 12 + (month - 1)) + delta
    return month_index // 12, month_index % 12 + 1


def last_months(base_month, count):
    if not base_month:
        return []
    year, month = [int(part) for part in base_month.split("-")]
    out = []
    for i in range(count):
        y, m = month_add(year, month, -i)
        out.append(f"{y:04d}-{m:02d}")
    return out


def frequency_text(purchase_days, avg_gap):
    if purchase_days <= 1:
        return "Una compra registrada"
    if avg_gap <= 15:
        return "Muy frecuente"
    if avg_gap <= 35:
        return "Frecuente"
    if avg_gap <= 60:
        return "Espaciada"
    return "Muy espaciada"


def segment(client, purchase_days, days_since_last, avg_gap, first_date, last_date):
    total = float(client["totalHistorico"])
    if days_since_last > 120:
        return "Cliente inactivo"
    if first_date and last_date and (last_date - first_date).days <= 45 and purchase_days <= 2:
        return "Cliente nuevo"
    if purchase_days >= 6 and total >= 500000:
        return "Compra mucho y frecuente"
    if purchase_days >= 6:
        return "Compra frecuente"
    if avg_gap > 45 and total >= 500000:
        return "Compra mucho y espaciado"
    if avg_gap > 45:
        return "Compra poco y espaciado"
    return "Cliente habitual"


def empty_client(client_id, name, phone, mobile, email):
    return {
        "clienteId": client_id,
        "nombre": name,
        "telefono": phone,
        "telefonoMovil": mobile,
        "email": email,
        "totalHistorico": 0.0,
        "monthlyTotals": defaultdict(float),
        "dias": set(),
        "sucursales": defaultdict(float),
        "listas": set(),
        "compras": {},
    }


def jsonable_client(client):
    return {
        **client,
        "totalHistorico": round2(client["totalHistorico"]),
        "monthlyTotals": {k: round2(v) for k, v in client["monthlyTotals"].items()},
        "dias": {k: True for k in sorted(client["dias"])},
        "sucursales": {k: round2(v) for k, v in client["sucursales"].items()},
        "listas": {k: True for k in sorted(client["listas"])},
        "compras": {
            k: {**v, "total": round2(v["total"])}
            for k, v in client["compras"].items()
        },
    }


def process_csv(path, state):
    print(f"Procesando {path.name}...", flush=True)
    rows = 0
    discarded = 0

    with path.open("r", encoding="cp1252", errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        try:
            headers = [normalize_header(h) for h in next(reader)]
        except StopIteration:
            raise ValueError("El CSV no tiene cabecera.")

        idx = {
            "sucursal": headers.index("codigo"),
            "clienteId": headers.index("cliente"),
            "clienteNombre": headers.index("cliente descripcion"),
            "fecha": headers.index("fecha"),
            "listaPrecio": headers.index("lista de precio"),
            "telefono": headers.index("telefono"),
            "telefonoMovil": headers.index("telefono movil"),
            "email": headers.index("email"),
            "total": headers.index("total"),
        }

        for line_number, row in enumerate(reader, start=2):
            try:
                if len(row) < len(headers):
                    continue

                branch = row[idx["sucursal"]].strip().upper()
                client_id = row[idx["clienteId"]].strip()
                name = row[idx["clienteNombre"]].strip()
                date = parse_date(row[idx["fecha"]])

                if is_discarded_client(client_id, name):
                    discarded += 1
                    state["discardedRows"] += 1
                    continue
                if not branch or not client_id or not date:
                    continue

                date_key = date.strftime("%Y-%m-%d")
                month_key = date.strftime("%Y-%m")
                total = parse_amount(row[idx["total"]])
                price_list = row[idx["listaPrecio"]].strip()
                phone = row[idx["telefono"]].strip()
                mobile = row[idx["telefonoMovil"]].strip()
                email = row[idx["email"]].strip()

                clients = state["clients"]
                if client_id not in clients:
                    clients[client_id] = empty_client(client_id, name, phone, mobile, email)

                client = clients[client_id]
                client["nombre"] = client["nombre"] or name
                client["telefono"] = client["telefono"] or phone
                client["telefonoMovil"] = client["telefonoMovil"] or mobile
                client["email"] = client["email"] or email
                client["totalHistorico"] += total
                client["monthlyTotals"][month_key] += total
                client["dias"].add(date_key)
                client["sucursales"][branch] += total
                if price_list:
                    client["listas"].add(price_list)

                purchase_key = f"{date_key}|{branch}|{price_list or '-'}"
                if purchase_key not in client["compras"]:
                    client["compras"][purchase_key] = {
                        "clienteId": client_id,
                        "fecha": date_key,
                        "sucursal": branch,
                        "listaPrecio": price_list,
                        "telefono": phone,
                        "telefonoMovil": mobile,
                        "email": email,
                        "total": 0.0,
                    }
                client["compras"][purchase_key]["total"] += total

                state["branchTotals"][branch] += total
                state["monthTotals"][month_key] += total
                state["totalRows"] += 1
                rows += 1

                if not state["fechaMin"] or date_key < state["fechaMin"]:
                    state["fechaMin"] = date_key
                if not state["fechaMax"] or date_key > state["fechaMax"]:
                    state["fechaMax"] = date_key

                if state["totalRows"] % 100000 == 0:
                    print(f"Procesadas {state['totalRows']} filas...", flush=True)
            except Exception as exc:
                state["warnings"].append({
                    "stage": "row",
                    "file": path.name,
                    "line": line_number,
                    "message": str(exc),
                })

    state["importedFiles"][path.stem] = {
        "id": path.stem,
        "name": path.name,
        "importedAt": state["updatedAt"],
        "rows": rows,
    }
    state["log"].append({
        "fileId": path.stem,
        "fileName": path.name,
        "importedAt": state["updatedAt"],
        "rows": rows,
        "discardedRows": discarded,
        "status": "OK",
        "message": "Generado localmente",
    })


def build_outputs(input_path, output_dir):
    input_path = Path(input_path)
    if input_path.is_dir():
        files = sorted(input_path.glob("*.csv"), key=lambda p: p.name)
        if output_dir is None:
            output_dir = input_path / "ventas_clientes_json"
    else:
        files = [input_path]
        if output_dir is None:
            output_dir = input_path.parent / f"{input_path.stem}_json"

    if not files:
        raise ValueError("No se encontraron archivos CSV para procesar.")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    state = {
        "updatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "clients": {},
        "branchTotals": defaultdict(float),
        "monthTotals": defaultdict(float),
        "importedFiles": {},
        "log": [],
        "warnings": [],
        "totalRows": 0,
        "discardedRows": 0,
        "fechaMin": "",
        "fechaMax": "",
    }

    for file in files:
        process_csv(file, state)

    print("Armando rankings...", flush=True)
    base_month = state["fechaMax"][:7] if state["fechaMax"] else ""
    base_year = state["fechaMax"][:4] if state["fechaMax"] else ""
    months3 = last_months(base_month, 3)
    max_date = parse_date(state["fechaMax"]) if state["fechaMax"] else None

    client_reports = []
    for client_id, client in state["clients"].items():
        try:
            days = sorted(client["dias"])
            branches = sorted(client["sucursales"])
            lists = sorted(client["listas"])
            first_date = parse_date(days[0]) if days else max_date
            last_date = parse_date(days[-1]) if days else max_date
            days_since_last = (max_date - last_date).days if max_date and last_date else 0
            active_span = max(1, (last_date - first_date).days + 1) if first_date and last_date else 1
            frequency = len(days) / active_span
            avg_gap = active_span / (len(days) - 1) if len(days) > 1 else active_span
            main_branch = ""
            if branches:
                main_branch = max(branches, key=lambda b: client["sucursales"][b])
            total3 = sum(client["monthlyTotals"].get(m, 0.0) for m in months3)
            total_year = sum(v for m, v in client["monthlyTotals"].items() if m[:4] == base_year)

            client_reports.append({
                "clienteId": client["clienteId"],
                "nombre": client["nombre"],
                "telefono": client["telefono"],
                "telefonoMovil": client["telefonoMovil"],
                "email": client["email"],
                "totalHistorico": round2(client["totalHistorico"]),
                "totalMesBase": round2(client["monthlyTotals"].get(base_month, 0.0)),
                "totalUltimos3Meses": round2(total3),
                "totalAnioBase": round2(total_year),
                "primeraCompra": days[0] if days else "",
                "ultimaCompra": days[-1] if days else "",
                "diasCompra": len(days),
                "frequencyScore": round4(frequency),
                "frecuenciaTexto": frequency_text(len(days), avg_gap),
                "segmento": segment(client, len(days), days_since_last, avg_gap, first_date, last_date),
                "sucursales": branches,
                "sucursalPrincipal": main_branch,
                "sucursalesTexto": ", ".join(branches),
                "listasTexto": ", ".join(lists),
            })
        except Exception as exc:
            state["warnings"].append({
                "stage": "client-report",
                "clienteId": client_id,
                "message": str(exc),
            })

    client_reports.sort(key=lambda c: (-c["totalMesBase"], -c["totalHistorico"], c["nombre"] or ""))
    branch_report = sorted(
        [{"sucursal": k, "total": round2(v)} for k, v in state["branchTotals"].items()],
        key=lambda b: (-b["total"], b["sucursal"]),
    )
    month_report = [
        {"mes": k, "total": round2(state["monthTotals"][k])}
        for k in sorted(state["monthTotals"], reverse=True)
    ]

    store = {
        "version": 3,
        "updatedAt": state["updatedAt"],
        "importedFiles": state["importedFiles"],
        "clients": {k: jsonable_client(v) for k, v in state["clients"].items()},
        "branchTotals": {k: round2(v) for k, v in state["branchTotals"].items()},
        "monthTotals": {k: round2(v) for k, v in state["monthTotals"].items()},
        "meta": {
            "totalFilas": state["totalRows"],
            "fechaMin": state["fechaMin"],
            "fechaMax": state["fechaMax"],
        },
        "log": state["log"],
        "warnings": state["warnings"],
    }
    report = {
        "version": 3,
        "updatedAt": state["updatedAt"],
        "meta": {
            "modo": "json-agregado-local",
            "totalFilas": state["totalRows"],
            "filasDescartadas": state["discardedRows"],
            "totalArchivos": len(files),
            "fechaMin": state["fechaMin"],
            "fechaMax": state["fechaMax"],
            "mesBase": base_month,
            "anioBase": base_year,
        },
        "clientes": client_reports,
        "sucursales": branch_report,
        "meses": month_report,
        "warnings": state["warnings"],
    }

    store_path = output_dir / STORE_FILE_NAME
    report_path = output_dir / REPORT_FILE_NAME
    warnings_path = output_dir / WARNINGS_FILE_NAME
    store_path.write_text(json.dumps(store, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report_path.write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    warnings_path.write_text(json.dumps(state["warnings"], ensure_ascii=False, indent=2), encoding="utf-8")

    print("JSON generado correctamente.")
    print(f"Archivos procesados: {len(files)}")
    print(f"Filas procesadas: {state['totalRows']}")
    print(f"Filas descartadas CF/Consumidor Final: {state['discardedRows']}")
    print(f"Advertencias: {len(state['warnings'])}")
    print(f"Clientes: {len(state['clients'])}")
    print(f"Sucursales: {len(state['branchTotals'])}")
    print(f"Periodo: {state['fechaMin']} a {state['fechaMax']}")
    print(f"Store: {store_path}")
    print(f"Report: {report_path}")
    print(f"Warnings: {warnings_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True)
    parser.add_argument("-o", "--output")
    args = parser.parse_args()
    build_outputs(args.input, args.output)


if __name__ == "__main__":
    main()
