const base = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = (origin: string | null) => !origin || origin === "https://adamiangarciadev.github.io" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : "https://adamiangarciadev.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});
const dbHeaders = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const reply = (origin: string | null, data: unknown, status = 200) => Response.json(data, { status, headers: cors(origin) });
const clean = (value: unknown) => String(value ?? "").trim();
const incidentId = (number: unknown) => `INC-${String(Number(number) || 0).padStart(5, "0")}`;

async function rest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, { ...options, headers: { ...dbHeaders, ...(options.headers || {}) } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || "Error de base de datos");
  return data;
}

async function rpc(name: string, payload: unknown) {
  return rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(payload) });
}

async function takeRate(keyName: string, limit: number, seconds: number) {
  return Boolean(await rpc("inc_take_rate", { p_key: keyName, p_limit: limit, p_seconds: seconds }));
}

async function requestKey(req: Request) {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseDataUrl(value: unknown) {
  const match = clean(value).match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Adjunto inválido");
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Cada adjunto debe pesar hasta 10 MB");
  return { type: match[1], bytes };
}

async function uploadFiles(items: unknown[], rateKey: string) {
  if (!Array.isArray(items) || items.length > 6) throw new Error("Podés adjuntar hasta 6 archivos");
  const uploaded: string[] = [];
  const result: Array<Record<string, unknown>> = [];
  try {
    for (const item of items as Array<Record<string, unknown>>) {
      if (!await takeRate(`upload:${rateKey}`, 30, 86400)) throw new Error("Se alcanzó el límite diario de adjuntos");
      const file = parseDataUrl(item.dataUrl);
      const safeName = clean(item.name || "adjunto").replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "adjunto";
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
      const response = await fetch(`${base}/storage/v1/object/inc-attachments/${encodeURI(path)}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": file.type, "x-upsert": "false" },
        body: file.bytes,
      });
      if (!response.ok) throw new Error("No se pudo guardar el adjunto");
      uploaded.push(path);
      result.push({ name: safeName, type: file.type, size: file.bytes.length, bucket: "inc-attachments", path });
    }
    return { files: result, uploaded };
  } catch (error) {
    await deleteFiles(uploaded);
    throw error;
  }
}

async function deleteFiles(paths: string[]) {
  if (!paths.length) return;
  await fetch(`${base}/storage/v1/object/inc-attachments`, {
    method: "DELETE", headers: dbHeaders, body: JSON.stringify({ prefixes: paths }),
  });
}

async function signedUrl(path: string) {
  const response = await fetch(`${base}/storage/v1/object/sign/inc-attachments/${encodeURI(path)}`, {
    method: "POST", headers: dbHeaders, body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!response.ok) return "";
  const data = await response.json();
  const signed = data.signedURL || data.signedUrl || "";
  return signed ? `${base}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}` : "";
}

async function projectTicket(row: Record<string, any>) {
  const attachments = await Promise.all((Array.isArray(row.attachments) ? row.attachments : []).map(async (file: Record<string, any>) => ({
    ...file, url: file.path ? await signedUrl(file.path) : clean(file.url),
  })));
  const history = (Array.isArray(row.inc_history) ? row.inc_history : []).map((entry: Record<string, any>) => ({
    at: entry.created_at, status: entry.status, assigneeCode: entry.assignee_code, assignee: entry.assignee, note: entry.note,
  }));
  return {
    id: incidentId(row.incident_number), createdAt: row.created_at, updatedAt: row.updated_at,
    status: row.status, priority: row.priority, branch: row.branch, reporterCode: row.reporter_code,
    reporterName: row.reporter_name, area: row.area, title: row.title, description: row.description,
    attachments, assigneeCode: row.assignee_code, assignee: row.assignee, history,
  };
}

async function listTickets() {
  const rows = await rest("inc_tickets?select=*,inc_history(*)&order=incident_number.desc");
  return Promise.all(rows.map(projectTicket));
}

async function employeeFor(code: string) {
  if (!/^\d{1,20}$/.test(code)) return null;
  const rows = await rest(`inc_employees?select=code,full_name&active=eq.true&code=eq.${encodeURIComponent(code)}&limit=1`);
  return rows[0] || null;
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (!allowedOrigin(origin)) return reply(origin, { ok: false, error: "Origen no permitido" }, 403);
  if (!['GET', 'POST'].includes(req.method)) return reply(origin, { ok: false, error: "Método no permitido" }, 405);
  const ip = await requestKey(req);
  try {
    let payload: Record<string, any> = {};
    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > 85 * 1024 * 1024) throw new Error("Solicitud demasiado grande");
      payload = text ? JSON.parse(text) : {};
    }
    const url = new URL(req.url);
    const action = clean(payload.action || payload.op || url.searchParams.get("action") || "listar").toLowerCase();
    if (!await takeRate(`request:${ip}`, 120, 60)) return reply(origin, { ok: false, error: "Demasiadas solicitudes. Esperá un minuto." }, 429);

    if (action === "listar") return reply(origin, { ok: true, tickets: await listTickets() });
    if (action === "obtener") {
      const number = Number(clean(payload.id || url.searchParams.get("id")).replace(/\D/g, ""));
      const rows = await rest(`inc_tickets?select=*,inc_history(*)&incident_number=eq.${number}&limit=1`);
      return rows[0] ? reply(origin, { ok: true, ticket: await projectTicket(rows[0]) }) : reply(origin, { ok: false, error: "Incidente no encontrado" }, 404);
    }
    if (action === "crear") {
      if (!await takeRate(`create:${ip}`, 20, 3600)) return reply(origin, { ok: false, error: "Demasiados incidentes creados. Esperá antes de reintentar." }, 429);
      for (const field of ["branch", "reporterCode", "area", "priority", "title", "description"]) if (!clean(payload[field])) throw new Error(`Falta completar: ${field}`);
      const employee = await employeeFor(clean(payload.reporterCode));
      if (/^\d+$/.test(clean(payload.reporterCode)) && !employee) throw new Error("El legajo no figura en el padrón vigente");
      const uploaded = await uploadFiles(payload.attachments || [], ip);
      try {
        const created = await rpc("inc_create_ticket", { p: { ...payload, reporterName: employee?.full_name || clean(payload.reporterName), attachments: uploaded.files } });
        return reply(origin, { ok: true, ticket: await projectTicket(created) });
      } catch (error) {
        await deleteFiles(uploaded.uploaded);
        throw error;
      }
    }
    if (action === "actualizar") {
      if (!await takeRate(`update:${ip}`, 60, 3600)) return reply(origin, { ok: false, error: "Demasiadas actualizaciones. Esperá antes de reintentar." }, 429);
      const assignee = await employeeFor(clean(payload.assigneeCode));
      if (!assignee) throw new Error("El responsable no figura en el padrón vigente");
      const updated = await rpc("inc_update_ticket", { p: { ...payload, assignee: assignee.full_name } });
      const rows = await rest(`inc_tickets?select=*,inc_history(*)&id=eq.${updated.id}&limit=1`);
      return reply(origin, { ok: true, ticket: await projectTicket(rows[0]) });
    }
    return reply(origin, { ok: false, error: "Acción no reconocida" }, 400);
  } catch (error) {
    console.error(error);
    return reply(origin, { ok: false, error: error instanceof Error ? error.message : "No se pudo completar la operación" }, 400);
  }
});
