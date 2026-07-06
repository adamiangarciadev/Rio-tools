import json
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter

ROOT = Path(r"D:\Damian\Rio-tools")
APP_ROOT = ROOT / "apps" / "pedido-carteleria"
DOWNLOADS = APP_ROOT / "downloads"
PAGE_PDFS = APP_ROOT / "page-pdfs"
PREVIEWS = APP_ROOT / "previews"
DESIGNS_JSON = APP_ROOT / "designs.json"
PDFTOPPM = Path(
    r"C:\Users\usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe"
)

PROJECTS = [
    {
        "id": "carteles",
        "title": "carteles rio 28,5 X 20 CM",
        "pdf": DOWNLOADS / "carteles-rio-28-5-x-20-cm.pdf",
        "folder": "carteles-rio-28-5-x-20-cm",
        "stem": "carteles-rio-28-5-x-20-cm",
    },
    {
        "id": "a3",
        "title": "Rio Plantilla A3",
        "pdf": DOWNLOADS / "rio-plantilla-a3.pdf",
        "folder": "rio-plantilla-a3",
        "stem": "rio-plantilla-a3",
    },
]


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def extract_pdf_text(path: Path) -> str:
    try:
        with pdfplumber.open(path) as pdf:
            text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception:
        return ""
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split_pdf(project: dict) -> list[Path]:
    reader = PdfReader(str(project["pdf"]))
    output_dir = PAGE_PDFS / project["folder"]
    reset_dir(output_dir)

    page_files = []
    for index, page in enumerate(reader.pages, start=1):
        writer = PdfWriter()
        writer.add_page(page)
        output = output_dir / f"{project['stem']}-pagina-{index:03d}.pdf"
        with output.open("wb") as file:
            writer.write(file)
        page_files.append(output)
    return page_files


def render_previews(project: dict) -> list[Path]:
    output_dir = PREVIEWS / project["folder"]
    reset_dir(output_dir)
    prefix = output_dir / "page"
    subprocess.run(
        [str(PDFTOPPM), "-png", "-r", "72", str(project["pdf"]), str(prefix)],
        check=True,
    )
    return sorted(
        output_dir.glob("*.png"),
        key=lambda item: int(re.search(r"(\d+)$", item.stem).group(1)),
    )


def build_manifest() -> list[dict]:
    manifest = []
    for project in PROJECTS:
        if not project["pdf"].exists():
            raise FileNotFoundError(f"No existe {project['pdf']}")

        page_pdfs = split_pdf(project)
        preview_files = render_previews(project)
        if len(page_pdfs) != len(preview_files):
            raise RuntimeError(
                f"Cantidad distinta para {project['title']}: "
                f"{len(page_pdfs)} PDFs y {len(preview_files)} previews"
            )

        items = []
        for index, (page_pdf, preview) in enumerate(zip(page_pdfs, preview_files), start=1):
            text = extract_pdf_text(page_pdf)
            item = {
                "number": index,
                "title": f"Pagina {index}",
                "image": preview.relative_to(APP_ROOT).as_posix(),
                "pdf": page_pdf.relative_to(APP_ROOT).as_posix(),
                "text": text,
                "searchText": normalize(f"{project['title']} pagina {index} {text}"),
            }
            items.append(item)

        manifest.append(
            {
                "id": project["id"],
                "title": project["title"],
                "pages": len(items),
                "items": items,
            }
        )
        print(f"{project['title']}: {len(items)} paginas")

    return manifest


def main() -> None:
    manifest = build_manifest()
    DESIGNS_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(len(project["items"]) for project in manifest)
    with_text = sum(1 for project in manifest for item in project["items"] if item["text"])
    print(f"Manifest actualizado: {total} paginas, {with_text} con texto extraible")


if __name__ == "__main__":
    main()
