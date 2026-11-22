// Mi entrenador · Worker de Cloudflare
// Hace 3 cosas que la app no puede hacer sola sin exponer tu Client Secret:
//   1) Conectar Strava (OAuth) y renovar el permiso.
//   2) Pedirle tus actividades a Strava.
//   3) Guardar una copia de tus registros en la nube (Cloudflare KV).
//
// Configuración en Cloudflare (Settings → Variables and Secrets / Bindings):
//   STRAVA_CLIENT_ID      texto   tu Client ID de Strava
//   STRAVA_CLIENT_SECRET  secret  tu Client Secret (lo pegas tú, nunca va en la app)
//   DATOS                 KV      un namespace de KV (para la copia en la nube)
//   APP_URL               texto   (opcional) https://goryelmaster.github.io/mi-entrenador/

const STRAVA = "https://www.strava.com";
const APP_DEFAULT = "https://goryelmaster.github.io/mi-entrenador/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const page = (title, msg, app) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font:17px -apple-system,system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center;color:#11151B;background:#ECEDEF}
h1{font-size:26px}a{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:14px;background:#11151B;color:#fff;text-decoration:none;font-weight:600}</style>
<h1>${title}</h1><p>${msg}</p><a href="${app}">Volver a Mi entrenador</a>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

const validState = s => typeof s === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(s);

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Llave de sincronización: "<id de atleta>.<firma>". Solo el Worker puede crearla.
const makeSyncKey = async (env, athleteId) => athleteId + "." + (await hmac(env.STRAVA_CLIENT_SECRET, "sync:" + athleteId));

async function checkSyncKey(env, req) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer (\d+)\.([0-9a-f]{64})$/);
  if (!m) return null;
  const good = await hmac(env.STRAVA_CLIENT_SECRET, "sync:" + m[1]);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= good.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0 ? m[1] : null;
}

async function stravaToken(env, params) {
  const r = await fetch(STRAVA + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "Strava respondió " + r.status);
  return data;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const app = env.APP_URL || APP_DEFAULT;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return json({ error: "Falta configurar STRAVA_CLIENT_ID o STRAVA_CLIENT_SECRET" }, 500);

      // Para revisar que el Worker está vivo.
      if (path === "/") return json({ ok: true, app: "mi-entrenador", kv: !!env.DATOS });

      // 1a) La app abre esta dirección; aquí se manda a Strava a pedir permiso.
      if (path === "/login") {
        const state = url.searchParams.get("state");
        if (!validState(state)) return page("Algo salió mal", "Vuelve a la app y toca otra vez “Conectar Strava”.", app);
        const q = new URLSearchParams({
          client_id: env.STRAVA_CLIENT_ID,
          redirect_uri: url.origin + "/callback",
          response_type: "code",
          approval_prompt: "auto",
          scope: "read,activity:read_all",
          state,
        });
        return Response.redirect(STRAVA + "/oauth/authorize?" + q, 302);
      }

      // 1b) Strava regresa aquí con un código; lo cambiamos por tokens con el Secret.
      if (path === "/callback") {
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) return page("No se conectó", "Cancelaste el permiso en Strava. Puedes intentarlo otra vez cuando quieras.", app);
        if (!validState(state)) return page("Algo salió mal", "Vuelve a la app y toca otra vez “Conectar Strava”.", app);
        if (!(url.searchParams.get("scope") || "").includes("activity:read_all"))
          return page("Falta un permiso", "Deja marcada la casilla para ver tus actividades (incluidas las privadas) y vuelve a intentarlo.", app);
        const t = await stravaToken(env, { code, grant_type: "authorization_code" });
        const athleteId = String(t.athlete && t.athlete.id);
        const result = {
          access_token: t.access_token,
          refresh_token: t.refresh_token,
          expires_at: t.expires_at,
          athlete: { id: athleteId, nombre: (t.athlete && t.athlete.firstname) || "" },
          sync_key: await makeSyncKey(env, athleteId),
        };
        // La app recoge esto con /pair. Se borra al recogerlo o a los 10 minutos.
        if (!env.DATOS) return page("Falta la nube", "Agrega el KV llamado DATOS al Worker (paso 6 de la guía).", app);
        await env.DATOS.put("pair:" + state, JSON.stringify(result), { expirationTtl: 600 });
        return page("¡Strava conectado!", "Ya puedes regresar a Mi entrenador. Se termina de conectar sola en unos segundos.", app);
      }

      // 1c) La app pregunta si ya terminó la conexión.
      if (path === "/pair") {
        const state = url.searchParams.get("state");
        if (!validState(state) || !env.DATOS) return json({ ready: false });
        const v = await env.DATOS.get("pair:" + state);
        if (!v) return json({ ready: false });
        await env.DATOS.delete("pair:" + state);
        return json({ ready: true, ...JSON.parse(v) });
      }

      // 1d) Renovar el permiso (los tokens de Strava duran 6 horas).
      if (path === "/refresh" && req.method === "POST") {
        const { refresh_token } = await req.json();
        if (!refresh_token) return json({ error: "Falta refresh_token" }, 400);
        const t = await stravaToken(env, { refresh_token, grant_type: "refresh_token" });
        return json({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at });
      }

      // 2) Actividades de Strava (solo lectura).
      if (path.startsWith("/strava/") && req.method === "GET") {
        const sub = path.slice("/strava/".length);
        if (!/^(athlete\/activities|activities\/\d+)$/.test(sub)) return json({ error: "Ruta no permitida" }, 404);
        const r = await fetch(STRAVA + "/api/v3/" + sub + url.search, { headers: { Authorization: req.headers.get("Authorization") || "" } });
        return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
      }

      // 3) Copia en la nube: la app manda lo pendiente y recibe lo nuevo.
      //    Cada registro tiene una llave fija (ej. "day:2026-11-25"); reenviar lo mismo nunca duplica.
      if (path === "/data" && req.method === "POST") {
        if (!env.DATOS) return json({ error: "Falta el KV DATOS" }, 500);
        const athlete = await checkSyncKey(env, req);
        if (!athlete) return json({ error: "Llave inválida" }, 401);
        const body = await req.json();
        const items = Array.isArray(body.items) ? body.items.slice(0, 2000) : [];
        const since = +body.since || 0;
        const key = "doc:" + athlete;
        const doc = (await env.DATOS.get(key, "json")) || { items: {} };
        let now = Date.now();
        const lastSt = Math.max(0, ...Object.values(doc.items).map(x => x.st || 0));
        if (now <= lastSt) now = lastSt + 1; // el reloj del servidor siempre avanza
        let changed = false;
        for (const it of items) {
          if (!it || typeof it.k !== "string" || it.k.length > 80 || typeof it.ts !== "number") continue;
          const cur = doc.items[it.k];
          if (cur && cur.ts > it.ts) continue; // gana lo más reciente
          if (cur && cur.ts === it.ts && JSON.stringify(cur.v) === JSON.stringify(it.v)) continue; // reintento: ya estaba
          doc.items[it.k] = { v: it.v === undefined ? null : it.v, ts: it.ts, st: now };
          changed = true;
        }
        if (changed) await env.DATOS.put(key, JSON.stringify(doc));
        const out = [];
        for (const [k, x] of Object.entries(doc.items)) if (x.st > since) out.push({ k, v: x.v, ts: x.ts });
        const cursor = Math.max(since, ...Object.values(doc.items).map(x => x.st || 0));
        return json({ ok: true, items: out, cursor });
      }

      return json({ error: "No encontrado" }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 502);
    }
  },
};
