const ROOT_FOLDER_ID = "1X555Xwpx_W77xFs9P3i_c3v4v6cIMjDE";
const DEFAULT_LOCAL = "ESTADOS/HISTORIAS";
const CACHE_SECONDS = 300;
const MAX_ITEMS = 500;

function doGet(e) {
  const action = String(e.parameter.accion || e.parameter.action || "videos").toLowerCase();

  if (action !== "videos") {
    return jsonOutput({
      ok: false,
      error: "Accion no soportada"
    });
  }

  const refresh = String(e.parameter.refresh || "") === "1";
  const cache = CacheService.getScriptCache();
  const cacheKey = "banco_medios_videos_" + ROOT_FOLDER_ID;

  if (!refresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return ContentService
        .createTextOutput(cached)
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const items = [];
  scanFolder(root, root.getName(), items);

  items.sort(function (a, b) {
    return String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""));
  });

  const payload = JSON.stringify({
    ok: true,
    folderId: ROOT_FOLDER_ID,
    generatedAt: new Date().toISOString(),
    items: items
  });

  if (payload.length < 95000) {
    cache.put(cacheKey, payload, CACHE_SECONDS);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function scanFolder(folder, path, items) {
  if (items.length >= MAX_ITEMS) return;

  const files = folder.getFiles();
  while (files.hasNext() && items.length < MAX_ITEMS) {
    const file = files.next();
    const mime = file.getMimeType();
    const name = file.getName();

    if (!isVideoFile(name, mime)) continue;

    const id = file.getId();
    const sizeBytes = Number(file.getSize()) || 0;

    items.push({
      id: id,
      nombre: name,
      mime: mime,
      sizeMB: sizeBytes ? sizeBytes / 1024 / 1024 : 0,
      ruta: path + " / " + name,
      carpetaOrigen: folder.getName(),
      locales: [DEFAULT_LOCAL],
      marcas: extractBrands(path + " " + name),
      url: "https://drive.google.com/file/d/" + id + "/view",
      previewUrl: "https://drive.google.com/file/d/" + id + "/preview",
      downloadUrl: "https://drive.google.com/uc?export=download&confirm=t&id=" + id,
      createdTime: file.getDateCreated().toISOString(),
      modifiedTime: file.getLastUpdated().toISOString()
    });
  }

  const folders = folder.getFolders();
  while (folders.hasNext() && items.length < MAX_ITEMS) {
    const child = folders.next();
    scanFolder(child, path + " / " + child.getName(), items);
  }
}

function isVideoFile(name, mime) {
  const lowerName = String(name || "").toLowerCase();
  const lowerMime = String(mime || "").toLowerCase();

  return lowerMime.indexOf("video/") === 0 ||
    /\.(mp4|mov|m4v|webm|avi|mpeg|mpg)$/i.test(lowerName);
}

function extractBrands(text) {
  const value = normalize(String(text || ""));
  const brands = [
    ["SIGRY", "sigry"],
    ["LARA", "lara"],
    ["GABELA", "gabela"],
    ["BAKHOU", "bakhou"]
  ];

  return brands
    .filter(function (brand) {
      return value.indexOf(brand[1]) >= 0;
    })
    .map(function (brand) {
      return brand[0];
    });
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
