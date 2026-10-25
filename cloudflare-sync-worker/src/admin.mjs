// GET /v1/admin/summary — data for the /admin page.
//
// Two locks. Cloudflare Access sits in front of /admin and /v1/admin/* and
// makes the visitor log in (one-time code by email) before the request ever
// reaches us. This file is the second lock: it verifies the signed token
// Access attaches (Cf-Access-Jwt-Assertion) against the team's public keys,
// so if the Access app were deleted or its path mistyped, the data still
// isn't public. It FAILS CLOSED: until ACCESS_TEAM_DOMAIN and ACCESS_AUD are
// set in wrangler.jsonc, every request is refused.
//
// Neither value is a secret — the AUD tag only says which Access app a token
// was minted for; it can't be used to make one.
import { summarizeReports, summarizePulse, daysFromNow } from "./reports.mjs";
import { cloudflareAnalytics } from "./cf-analytics.mjs";

const CERTS_TTL_MS = 60 * 60 * 1000;
let certCache = { at: 0, team: "", keys: [] };

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function teamKeys(team, fetchImpl) {
  if (certCache.team === team && Date.now() - certCache.at < CERTS_TTL_MS) return certCache.keys;
  const res = await fetchImpl(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const { keys } = await res.json();
  certCache = { at: Date.now(), team, keys: keys || [] };
  return certCache.keys;
}

// Returns the verified token payload, or null. `fetchImpl` is injectable so
// scripts/test-admin.mjs can serve its own keys.
export async function verifyAccessJwt(request, env, fetchImpl = fetch) {
  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim();
  const aud = String(env.ACCESS_AUD || "").trim();
  if (!team || !aud) return null;                       // not configured: fail closed
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    if (header.alg !== "RS256") return null;
    const jwk = (await teamKeys(team, fetchImpl)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return null;
    if (!(payload.exp > now)) return null;
    if (payload.nbf && payload.nbf > now + 60) return null;
    if (payload.iss !== `https://${team}`) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function handleAdmin(request, env, respond, fetchImpl = fetch) {
  if (request.method !== "GET") return respond({ ok: false, error: "GET only" }, 405);
  const who = await verifyAccessJwt(request, env, fetchImpl);
  if (!who) return respond({ ok: false, error: "Not signed in" }, 401);

  const url = new URL(request.url);
  // Its own route: Cloudflare's API is slower and rate-limited, so it is only
  // asked when that view is opened, not on every /admin load.
  if (url.pathname === "/v1/admin/cloudflare") {
    const days = url.searchParams.get("days") === "30" ? 30 : 7;
    return respond({ ok: true, cloudflare: await cloudflareAnalytics(env, days, fetchImpl) }, 200);
  }
  if (url.pathname !== "/v1/admin/summary") return respond({ ok: false, error: "Not found" }, 404);

  // Everything here is best-effort and independent: one broken source must
  // not blank the whole page.
  const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const tomorrow = daysFromNow(1);
  const [reports, pulse, sweep, reportsThrough] = await Promise.all([
    summarizeReports(env, since, tomorrow).catch(() => null),
    summarizePulse(env, since, tomorrow).catch(() => null),
    env.HN_STATE_DATA?.get("curate:state", { type: "json" }).catch(() => null),
    env.HN_STATE_DATA?.get("curate:reports-through").catch(() => null),
  ]);
  return respond({
    ok: true,
    signedInAs: who.email || "",
    windowDays: 30,
    reports,
    pulse,
    sweep: sweep && {
      phase: sweep.phase,
      cursor: sweep.cursor,
      checked: sweep.checked,
      pending: (sweep.findings || []).length,
      confirmed: (sweep.confirmed || []).length,
      findings: (sweep.findings || []).slice(0, 100),
    },
    reportsThrough,
  }, 200);
}
