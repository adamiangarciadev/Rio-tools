import fs from "node:fs/promises";

const baseDir = new URL(".", import.meta.url);
const envPath = new URL(".env", baseDir);
const tokenPath = new URL(".canva-token.json", baseDir);
const outputDir = "D:/Damian/Rio-tools/apps/pedido-carteleria/downloads";

const selectedDesigns = [
  {
    id: "DAFoewHkos4",
    title: "carteles rio 28,5 X 20 CM",
    fileName: "carteles-rio-28-5-x-20-cm.pdf",
  },
  {
    id: "DAFpws5EDho",
    title: "Rio Plantilla A3",
    fileName: "rio-plantilla-a3.pdf",
  },
];

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

async function loadConfig() {
  const envText = await fs.readFile(envPath, "utf8");
  const config = parseEnv(envText);
  const required = ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"];
  for (const key of required) {
    if (!config[key]) throw new Error(`Falta ${key} en tools/canva-sync/.env`);
  }
  config.CANVA_SCOPES ||= "design:meta:read design:content:read";
  return config;
}

async function readToken() {
  try {
    return JSON.parse(await fs.readFile(tokenPath, "utf8"));
  } catch {
    return null;
  }
}

async function saveToken(token) {
  await fs.writeFile(tokenPath, JSON.stringify(token, null, 2));
}

async function tokenRequest(config, body) {
  const credentials = Buffer.from(`${config.CANVA_CLIENT_ID}:${config.CANVA_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Canva token error ${response.status}: ${JSON.stringify(data)}`);
  }
  const now = Math.floor(Date.now() / 1000);
  return { ...data, expires_at: now + (data.expires_in || 0) - 60 };
}

async function getAccessToken(config) {
  let token = await readToken();
  if (!token?.refresh_token) {
    throw new Error("No hay refresh token. Ejecuta primero canva-auth-fetch.mjs.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!token.expires_at || token.expires_at <= now) {
    token = await tokenRequest(config, {
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      scope: config.CANVA_SCOPES,
    });
    await saveToken(token);
  }
  return token.access_token;
}

async function canvaRequest(path, accessToken, options = {}) {
  const response = await fetch(`https://api.canva.com/rest/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Canva API error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function createExportJob(design, accessToken) {
  const data = await canvaRequest("/exports", accessToken, {
    method: "POST",
    body: JSON.stringify({
      design_id: design.id,
      format: {
        type: "pdf",
        export_quality: "regular",
      },
    }),
  });
  return data.job;
}

async function waitForExport(job, accessToken) {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    if (job.status === "success") return job;
    if (job.status === "failed") {
      throw new Error(`Export fallido: ${JSON.stringify(job.error || job)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const data = await canvaRequest(`/exports/${encodeURIComponent(job.id)}`, accessToken);
    job = data.job;
    console.log(`  intento ${attempt}: ${job.status}`);
  }
  throw new Error(`Export ${job.id} no termino a tiempo.`);
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar export ${response.status}: ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(outputPath, bytes);
  return bytes.byteLength;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const config = await loadConfig();
  const accessToken = await getAccessToken(config);

  const manifest = [];
  for (const design of selectedDesigns) {
    console.log(`Exportando ${design.title}...`);
    const firstJob = await createExportJob(design, accessToken);
    const job = await waitForExport(firstJob, accessToken);
    if (!job.urls?.length) throw new Error(`Canva no devolvio URLs para ${design.title}`);
    if (job.urls.length > 1) {
      console.warn(`  Canva devolvio ${job.urls.length} URLs; se guarda la primera.`);
    }
    const outputPath = `${outputDir}/${design.fileName}`;
    const bytes = await downloadFile(job.urls[0], outputPath);
    manifest.push({
      title: design.title,
      id: design.id,
      fileName: design.fileName,
      bytes,
      exportedAt: new Date().toISOString(),
    });
    console.log(`  guardado: ${outputPath} (${bytes} bytes)`);
  }

  await fs.writeFile(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
