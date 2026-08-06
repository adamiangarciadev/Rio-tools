import argparse
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
BASE_DIR = Path(__file__).resolve().parent


def load_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def resolve_path(value, fallback_name):
    if value:
        path = Path(value)
        return path if path.is_absolute() else BASE_DIR / path
    return BASE_DIR / fallback_name


def load_config():
    config_path = BASE_DIR / "config.json"
    if not config_path.exists():
        raise SystemExit(
            f"No existe {config_path}. Copia config.example.json como config.json y ajustalo."
        )
    config = load_json(config_path, {})
    config.setdefault("drive_folder_id", "1ZhniIJmIyjxzLI5Sn9sinwiAVVVr_2Hs")
    config.setdefault("poll_seconds", 45)
    config.setdefault("download_dir", "downloads")
    config.setdefault("state_file", "printed_files.json")
    config.setdefault("credentials_file", "credentials.json")
    config.setdefault("token_file", "token.json")
    config.setdefault("print_existing_on_first_run", False)
    config.setdefault("printer_name", "")
    config.setdefault("sumatra_pdf_path", "")
    return config


def build_drive_service(config):
    credentials_path = resolve_path(config["credentials_file"], "credentials.json")
    token_path = resolve_path(config["token_file"], "token.json")

    if not credentials_path.exists():
        raise SystemExit(
            "Falta credentials.json. Crealo en Google Cloud como OAuth Client de tipo "
            f"'Desktop app' y guardalo en {credentials_path}."
        )

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
            creds = flow.run_local_server(port=0)
        save_json(token_path, json.loads(creds.to_json()))

    return build("drive", "v3", credentials=creds)


def list_pdfs(service, folder_id):
    query = (
        f"'{folder_id}' in parents and trashed = false and "
        "mimeType = 'application/pdf'"
    )
    fields = (
        "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size)"
    )
    files = []
    page_token = None
    while True:
        result = (
            service.files()
            .list(
                q=query,
                spaces="drive",
                fields=fields,
                orderBy="createdTime",
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files.extend(result.get("files", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            return files


def safe_filename(name):
    blocked = '<>:"/\\|?*'
    cleaned = "".join("_" if c in blocked else c for c in name).strip()
    return cleaned or "pedido.pdf"


def download_pdf(service, file_info, download_dir):
    download_dir.mkdir(parents=True, exist_ok=True)
    path = download_dir / f"{file_info['id']}_{safe_filename(file_info['name'])}"
    if path.exists() and path.stat().st_size > 0:
        return path

    request = service.files().get_media(
        fileId=file_info["id"],
        supportsAllDrives=True,
    )
    with path.open("wb") as f:
        downloader = MediaIoBaseDownload(f, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
    return path


def find_sumatra(config):
    configured = config.get("sumatra_pdf_path", "").strip()
    if configured and Path(configured).exists():
        return Path(configured)

    from_path = shutil.which("SumatraPDF.exe") or shutil.which("SumatraPDF")
    if from_path:
        return Path(from_path)

    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "SumatraPDF" / "SumatraPDF.exe",
        Path("C:/Program Files/SumatraPDF/SumatraPDF.exe"),
        Path("C:/Program Files (x86)/SumatraPDF/SumatraPDF.exe"),
    ]
    return next((p for p in candidates if p.exists()), None)


def print_pdf(pdf_path, config):
    sumatra = find_sumatra(config)
    printer = config.get("printer_name", "").strip()

    if sumatra:
        args = [str(sumatra), "-silent", "-exit-when-done"]
        if printer:
            args.extend(["-print-to", printer])
        else:
            args.append("-print-to-default")
        args.append(str(pdf_path))
        subprocess.run(args, check=True)
        return "sumatra"

    if printer:
        raise RuntimeError(
            "Para elegir una impresora por nombre hace falta SumatraPDF. "
            "Instalalo o deja printer_name vacio para usar la predeterminada."
        )

    os.startfile(str(pdf_path), "print")
    time.sleep(10)
    return "windows-default-app"


def mark_seen_without_printing(state, files):
    for file_info in files:
        state.setdefault(file_info["id"], {
            "name": file_info["name"],
            "createdTime": file_info.get("createdTime"),
            "status": "seen_on_first_run",
        })


def process_once(service, config, state):
    download_dir = resolve_path(config["download_dir"], "downloads")
    files = list_pdfs(service, config["drive_folder_id"])

    if not state and not config.get("print_existing_on_first_run", False):
        mark_seen_without_printing(state, files)
        logging.info("Primer arranque: marco %s PDFs existentes como ya vistos.", len(files))
        return 0

    printed = 0
    for file_info in files:
        file_id = file_info["id"]
        if file_id in state:
            continue

        logging.info("Descargando pedido nuevo: %s", file_info["name"])
        pdf_path = download_pdf(service, file_info, download_dir)
        method = print_pdf(pdf_path, config)
        state[file_id] = {
            "name": file_info["name"],
            "createdTime": file_info.get("createdTime"),
            "modifiedTime": file_info.get("modifiedTime"),
            "printedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "localPath": str(pdf_path),
            "status": "printed",
            "printMethod": method,
        }
        printed += 1
        logging.info("Impreso: %s", file_info["name"])
    return printed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Ejecuta una sola revision.")
    parser.add_argument("--print-existing", action="store_true", help="Imprime tambien PDFs ya existentes.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(BASE_DIR / "auto-print.log", encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )

    config = load_config()
    if args.print_existing:
        config["print_existing_on_first_run"] = True

    state_path = resolve_path(config["state_file"], "printed_files.json")
    state = load_json(state_path, {})
    service = build_drive_service(config)

    while True:
        try:
            printed = process_once(service, config, state)
            save_json(state_path, state)
            logging.info("Revision terminada. Nuevos impresos: %s", printed)
        except Exception:
            logging.exception("Error revisando/imprimiendo pedidos")

        if args.once:
            break
        time.sleep(max(10, int(config.get("poll_seconds", 45))))


if __name__ == "__main__":
    main()
