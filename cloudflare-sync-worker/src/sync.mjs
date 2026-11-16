// Settings sync across browsers and devices — POST /v1/sync.
//
// A reader who turns sync on gets a random "sync code". Their browser derives
// three things from it (assets/cloud-sync.js): a storage id, a write password
// ("auth"), and an encryption key. The key never leaves the browser. What
// arrives here is the id, the auth, and the settings already encrypted with
// AES-256-GCM. This Worker cannot read them and has no way to.
//
// It is the second place a visitor's browser sends us anything (reports.mjs is
// the first), so it follows the same rules, stricter where it can be:
//
//   - A row is the id, a HASH of the auth, the ciphertext with its IV, a
//     revision counter and UTC days. No IP, no User-Agent, no time finer than
//     the day, nothing that says who or where.
//   - The id and auth travel in the request BODY, never the URL: Worker
//     request logs keep URLs, and these must not be in them.
//   - Knowing an id is not enough. Reading, writing and deleting all need the
//     auth, so an id that leaked could not be used to fetch or overwrite.
//   - The page sends text/plain so the browser makes a "simple" request with
//     no CORS preflight; we parse the JSON ourselves.
//
// Abuse is bounded rather than prevented: a request must come from one of our
// own origins, the ciphertext has a size cap, new ids are capped per day, each
// id has a daily write cap, and rows idle for KEEP_DAYS are deleted.
//
// D1, not KV: KV allows 1,000 writes a day on the free plan, shared with the
// market snapshot. Schema: schema/sync.sql.

export const LIMITS = {
  MAX_DATA: 60000,      // base64 characters of ciphertext; real settings are ~10,000
  NEW_PER_DAY: 100,     // new sync codes across all visitors
  WRITES_PER_DAY: 300,  // saves per code
  KEEP_DAYS: 180,       // a code nobody has used for this long is forgotten
};

const HEX64 = /^[a-f0-9]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Validates a raw request body. Returns { op, id, auth, iv?, data?, since? } or null.
export function parseSync(text) {
  if (!text || text.length > LIMITS.MAX_DATA + 1000) return null;
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  const op = String(body?.op || "");
  const id = String(body?.id || "");
  const auth = String(body?.auth || "");
  if (!["get", "put", "delete"].includes(op) || !HEX64.test(id) || !HEX64.test(auth)) return null;
  if (op !== "put") {
    const since = Number.isInteger(body?.since) && body.since > 0 ? body.since : 0;
    return { op, id, auth, since };
  }
  const iv = String(body?.iv || "");
  const data = String(body?.data || "");
  // A 12-byte AES-GCM IV is exactly 16 base64 characters.
  if (iv.length !== 16 || !BASE64.test(iv)) return null;
  if (!data || data.length > LIMITS.MAX_DATA || !BASE64.test(data)) return null;
  return { op, id, auth, iv, data };
}

// `allowedOrigins` comes from index.js's ALLOWED_ORIGINS parsing. A browser
// always sends Origin on a POST, so a missing one means a script.
export async function handleSync(request, env, allowedOrigins, respond) {
  if (request.method !== "POST") return respond({ ok: false, error: "POST only" }, 405);
  const origin = String(request.headers.get("Origin") || "").replace(/\/+$/, "");
  if (!origin || !allowedOrigins.includes(origin)) return respond({ ok: false, error: "Forbidden" }, 403);
  if (!env.HN_REPORTS) return respond({ ok: false, error: "Sync unavailable" }, 503);

  const req = parseSync(await request.text());
  if (!req) return respond({ ok: false, error: "Invalid request" }, 400);

  const db = env.HN_REPORTS;
  const day = today();
  try {
    const authHash = await sha256Hex(req.auth);
    const row = await db.prepare("SELECT auth_hash, rev, iv, data, day, writes FROM sync WHERE id = ?").bind(req.id).first();
    // The same answer for "no such code" and "wrong password": an id on its
    // own tells a caller nothing, not even whether it exists.
    if (row && row.auth_hash !== authHash) return respond({ ok: false, error: "Not found" }, 404);

    if (req.op === "get") {
      if (!row) return respond({ ok: false, error: "Not found" }, 404);
      if (req.since === row.rev) return respond({ ok: true, rev: row.rev, same: true }, 200);
      return respond({ ok: true, rev: row.rev, iv: row.iv, data: row.data }, 200);
    }

    if (req.op === "delete") {
      if (row) await db.prepare("DELETE FROM sync WHERE id = ?").bind(req.id).run();
      return respond({ ok: true }, 200);
    }

    // put
    if (!row) {
      // A new code. This is also the moment to forget codes long unused.
      await db.prepare("DELETE FROM sync WHERE day < ?").bind(daysAgo(LIMITS.KEEP_DAYS)).run();
      const { n } = await db.prepare("SELECT COUNT(*) AS n FROM sync WHERE created = ?").bind(day).first();
      if (n >= LIMITS.NEW_PER_DAY) return respond({ ok: false, error: "Sync is busy today. Try again tomorrow." }, 429);
      await db.prepare("INSERT INTO sync (id, auth_hash, rev, iv, data, created, day, writes) VALUES (?, ?, 1, ?, ?, ?, ?, 1)")
        .bind(req.id, authHash, req.iv, req.data, day, day).run();
      return respond({ ok: true, rev: 1 }, 200);
    }
    const writes = row.day === day ? row.writes + 1 : 1;
    if (writes > LIMITS.WRITES_PER_DAY) return respond({ ok: false, error: "Too many saves today." }, 429);
    const rev = row.rev + 1;
    await db.prepare("UPDATE sync SET rev = ?, iv = ?, data = ?, day = ?, writes = ? WHERE id = ?")
      .bind(rev, req.iv, req.data, day, writes, req.id).run();
    return respond({ ok: true, rev }, 200);
  } catch {
    // Includes "no such table": the route can be deployed before the table exists.
    return respond({ ok: false, error: "Sync unavailable" }, 503);
  }
}
