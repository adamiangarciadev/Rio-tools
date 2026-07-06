import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { exec } from "node:child_process";

const baseDir = new URL(".", import.meta.url);
const envPath = new URL(".env", baseDir);
const tokenPath = new URL(".canva-token.json", baseDir);
const designsPath = new URL("canva-designs.json", baseDir);
const projectRowsPath = new URL("canva-project-rows.json", baseDir);
const pageRowsPath = new URL("canva-page-rows.json", baseDir);

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
  const required = ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET", "CANVA_REDIRECT_URI"];
  for (const key of required) {
    if (!config[key]) throw new Error(`Falta ${key} en tools/canva-sync/.env`);
  }
  config.CANVA_SCOPES ||= "design:meta:read design:content:read";
  return config;
}

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildPkce() {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
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

async function refreshToken(config, token) {
  if (!token?.refresh_token) return null;
  return tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    scope: config.CANVA_SCOPES,
  });
}

function startCallbackServer(redirectUri, expectedState) {
  const url = new URL(redirectUri);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, redirectUri);
      if (requestUrl.pathname !== url.pathname) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Canva devolvio error: ${error}`);
        server.close();
        reject(new Error(`Canva OAuth error: ${error}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("OAuth invalido: falta code o state incorrecto.");
        server.close();
        reject(new Error("OAuth invalido: falta code o state incorrecto"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Canva conectado</h1><p>Ya podes volver a Codex.</p>");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(Number(url.port || 80), url.hostname);
  });
}

async function authorize(config) {
  const { verifier, challenge } = buildPkce();
  const state = base64Url(crypto.randomBytes(32));
  const authUrl = new URL("https://www.canva.com/api/oauth/authorize");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "s256");
  authUrl.searchParams.set("scope", config.CANVA_SCOPES);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.CANVA_CLIENT_ID);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", config.CANVA_REDIRECT_URI);

  console.log("\nAbrí esta URL para autorizar Canva:\n");
  console.log(authUrl.toString());
  console.log("\nEsperando callback en", config.CANVA_REDIRECT_URI);

  if (process.platform === "win32") {
    exec(`start "" "${authUrl.toString()}"`);
  }

  const code = await startCallbackServer(config.CANVA_REDIRECT_URI, state);
  return tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: config.CANVA_REDIRECT_URI,
  });
}

async function canvaGet(path, token, query = {}) {
  const url = new URL(`https://api.canva.com/rest/v1${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`Canva API error ${response.status}: ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function listDesigns(token) {
  const items = [];
  let continuation;
  do {
    const data = await canvaGet("/designs", token, {
      limit: 100,
      continuation,
      ownership: "any",
      sort_by: "modified_descending",
    });
    items.push(...(data.items || []));
    continuation = data.continuation;
  } while (continuation);
  return items;
}

async function listPages(design, token) {
  const total = design.page_count || 0;
  if (!total) return [];
  const pages = [];
  for (let offset = 1; offset <= total; offset += 200) {
    const data = await canvaGet(`/designs/${encodeURIComponent(design.id)}/pages`, token, {
      offset,
      limit: Math.min(200, total - offset + 1),
    });
    pages.push(...(data.items || []));
  }
  return pages;
}

function dateFromUnix(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function typeLabel(design) {
  return Array.isArray(design.design_types) ? design.design_types.join(", ") : "";
}

async function main() {
  const config = await loadConfig();
  let token = await readToken();
  const now = Math.floor(Date.now() / 1000);

  if (token?.expires_at && token.expires_at <= now) {
    console.log("Token vencido, renovando...");
    token = await refreshToken(config, token);
    await saveToken(token);
  }

  if (!token?.access_token) {
    token = await authorize(config);
    await saveToken(token);
  }

  console.log("Leyendo proyectos de Canva...");
  const designs = await listDesigns(token);
  console.log(`Proyectos encontrados: ${designs.length}`);

  const projectRows = designs.map((design) => [
    design.title || "(sin titulo)",
    design.id,
    typeLabel(design),
    design.urls?.edit_url || design.urls?.view_url || "",
    "",
    design.page_count || "",
    dateFromUnix(design.updated_at),
    "Pendiente",
  ]);

  const pageRows = [];
  for (const design of designs) {
    try {
      const pages = await listPages(design, token);
      for (const page of pages) {
        pageRows.push([
          design.title || "(sin titulo)",
          design.id,
          page.page_number || page.index || "",
          page.id || "",
          design.urls?.edit_url || design.urls?.view_url || "",
          "",
          page.thumbnail?.url || "",
          page.dimensions ? `${page.dimensions.width}x${page.dimensions.height}` : "",
          "Pendiente",
        ]);
      }
    } catch (error) {
      if (error.status === 403) {
        console.warn(`Sin permiso para leer paginas de ${design.id}. Activá design:content:read si querés detalle por pagina.`);
        continue;
      }
      throw error;
    }
  }

  await fs.writeFile(designsPath, JSON.stringify(designs, null, 2));
  await fs.writeFile(projectRowsPath, JSON.stringify(projectRows, null, 2));
  await fs.writeFile(pageRowsPath, JSON.stringify(pageRows, null, 2));

  console.log(`Filas de proyectos: ${projectRows.length}`);
  console.log(`Filas de paginas: ${pageRows.length}`);
  console.log("Archivos generados en tools/canva-sync.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
