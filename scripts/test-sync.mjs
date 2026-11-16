// Exercises cloudflare-sync-worker/src/sync.mjs against an in-memory stand-in
// for D1, forcing every branch: create, read, "nothing new", update, delete,
// each refusal, both daily caps, the cap resetting next day, pruning, and the
// table being absent.
//
//   npm run test:sync
import { handleSync, parseSync, LIMITS } from "../cloudflare-sync-worker/src/sync.mjs";

const day = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
const TODAY = day(0);

// Just enough of D1 for the statements sync.mjs runs.
function fakeD1(rows = []) {
  const db = { rows };
  db.prepare = (sql) => ({
    bind: (...a) => ({
      first: async () => {
        if (sql.includes("COUNT(*)")) return { n: db.rows.filter((r) => r.created === a[0]).length };
        const r = db.rows.find((x) => x.id === a[0]);
        return r ? { auth_hash: r.auth_hash, rev: r.rev, iv: r.iv, data: r.data, day: r.day, writes: r.writes } : null;
      },
      run: async () => {
        if (sql.startsWith("INSERT")) db.rows.push({ id: a[0], auth_hash: a[1], rev: 1, iv: a[2], data: a[3], created: a[4], day: a[5], writes: 1 });
        else if (sql.startsWith("UPDATE")) Object.assign(db.rows.find((r) => r.id === a[5]), { rev: a[0], iv: a[1], data: a[2], day: a[3], writes: a[4] });
        else if (sql.startsWith("DELETE FROM sync WHERE id")) db.rows = db.rows.filter((r) => r.id !== a[0]);
        else if (sql.startsWith("DELETE FROM sync WHERE day")) db.rows = db.rows.filter((r) => r.day >= a[0]);
        return {};
      },
    }),
  });
  return db;
}

const ORIGINS = ["https://happening-now.net"];
const respond = (body, status) => ({ body, status });
const req = (body, { method = "POST", origin = "https://happening-now.net" } = {}) => ({
  method,
  headers: { get: (h) => (h === "Origin" ? origin : null) },
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const ID = "a".repeat(64), ID2 = "b".repeat(64), AUTH = "c".repeat(64), WRONG = "d".repeat(64);
const IV = "AAAAAAAAAAAAAAAA";
const put = (id = ID, data = "QUJD", auth = AUTH) => ({ op: "put", id, auth, iv: IV, data });
const call = (env, body, opts) => handleSync(req(body, opts), env, ORIGINS, respond);

let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; };

// ---- the happy path ---------------------------------------------------------
{
  const env = { HN_REPORTS: fakeD1() };
  const made = await call(env, put());
  check("a first save creates the row at revision 1", made.status === 200 && made.body.rev === 1 && env.HN_REPORTS.rows.length === 1);
  const row = env.HN_REPORTS.rows[0];
  check("only the expected columns are stored", Object.keys(row).sort().join() === "auth_hash,created,data,day,id,iv,rev,writes");
  check("the auth is stored as a hash, never as sent", row.auth_hash !== AUTH && /^[a-f0-9]{64}$/.test(row.auth_hash));
  check("only the UTC day is recorded", row.day === TODAY && row.created === TODAY);

  const got = await call(env, { op: "get", id: ID, auth: AUTH });
  check("a read returns the ciphertext and revision", got.status === 200 && got.body.data === "QUJD" && got.body.iv === IV && got.body.rev === 1);
  const same = await call(env, { op: "get", id: ID, auth: AUTH, since: 1 });
  check("a read at the current revision says 'same' and sends no data", same.status === 200 && same.body.same === true && !("data" in same.body));

  const again = await call(env, put(ID, "REVG"));
  check("a second save bumps the revision and replaces the data", again.body.rev === 2 && env.HN_REPORTS.rows[0].data === "REVG" && env.HN_REPORTS.rows[0].writes === 2);
  const newer = await call(env, { op: "get", id: ID, auth: AUTH, since: 1 });
  check("a read from an older revision gets the new data", newer.body.rev === 2 && newer.body.data === "REVG");

  const gone = await call(env, { op: "delete", id: ID, auth: AUTH });
  check("delete removes the row", gone.status === 200 && env.HN_REPORTS.rows.length === 0);
  check("a read after delete is 'not found'", (await call(env, { op: "get", id: ID, auth: AUTH })).status === 404);
  check("deleting what is already gone still answers ok", (await call(env, { op: "delete", id: ID, auth: AUTH })).status === 200);
}

// ---- the auth protects every operation --------------------------------------
{
  const env = { HN_REPORTS: fakeD1() };
  await call(env, put());
  const read = await call(env, { op: "get", id: ID, auth: WRONG });
  check("a read with the wrong auth is refused", read.status === 404 && !("data" in read.body));
  const unknown = await call(env, { op: "get", id: ID2, auth: AUTH });
  check("wrong auth and unknown id get the identical answer", JSON.stringify(read) === JSON.stringify(unknown));
  const write = await call(env, put(ID, "SEFDSw==", WRONG));
  check("a save with the wrong auth is refused and changes nothing", write.status === 404 && env.HN_REPORTS.rows[0].data === "QUJD" && env.HN_REPORTS.rows[0].rev === 1);
  const del = await call(env, { op: "delete", id: ID, auth: WRONG });
  check("a delete with the wrong auth is refused and deletes nothing", del.status === 404 && env.HN_REPORTS.rows.length === 1);
}

// ---- who may call, and how ---------------------------------------------------
{
  const env = { HN_REPORTS: fakeD1() };
  check("another site's origin is refused", (await call(env, put(), { origin: "https://evil.example" })).status === 403);
  check("a request with no origin is refused", (await call(env, put(), { origin: "" })).status === 403);
  check("GET is refused", (await call(env, put(), { method: "GET" })).status === 405);
  check("nothing was stored by any of those", env.HN_REPORTS.rows.length === 0);
  check("with no database bound it answers 'unavailable'", (await call({}, put())).status === 503);
  const broken = { HN_REPORTS: { prepare: () => { throw new Error("no such table: sync"); } } };
  check("a missing table answers 'unavailable' rather than crashing", (await call(broken, put())).status === 503);
}

// ---- malformed requests ------------------------------------------------------
{
  const bad = (name, body) => check(`refused: ${name}`, parseSync(typeof body === "string" ? body : JSON.stringify(body)) === null);
  bad("not JSON", "hello");
  bad("empty body", "");
  bad("unknown operation", { ...put(), op: "list" });
  bad("id too short", put("abc"));
  bad("id with capitals", put("A".repeat(64)));
  bad("auth missing", { op: "get", id: ID });
  bad("iv of the wrong length", { ...put(), iv: "AAAA" });
  bad("data missing", { ...put(), data: "" });
  bad("data that is not base64", put(ID, "<script>"));
  bad("data over the size cap", put(ID, "A".repeat(LIMITS.MAX_DATA + 4)));
  check("data exactly at the size cap is accepted", parseSync(JSON.stringify(put(ID, "A".repeat(LIMITS.MAX_DATA)))) !== null);
  check("a non-numeric 'since' is treated as 'send everything'", parseSync(JSON.stringify({ op: "get", id: ID, auth: AUTH, since: "x" })).since === 0);
  const env = { HN_REPORTS: fakeD1() };
  check("a malformed request is answered 400", (await call(env, "nope")).status === 400);
}

// ---- the caps ----------------------------------------------------------------
{
  const full = Array.from({ length: LIMITS.NEW_PER_DAY }, (_, i) => ({ id: String(i).padStart(64, "0"), auth_hash: "x", rev: 1, iv: IV, data: "QQ==", created: TODAY, day: TODAY, writes: 1 }));
  const env = { HN_REPORTS: fakeD1(full) };
  const refused = await call(env, put());
  check("a new code past the daily cap is refused", refused.status === 429 && env.HN_REPORTS.rows.length === LIMITS.NEW_PER_DAY);
  // ...but an existing code can still save on a day when new ones are capped.
  const hash = await (async () => { const e = { HN_REPORTS: fakeD1() }; await call(e, put()); return e.HN_REPORTS.rows[0].auth_hash; })();
  env.HN_REPORTS.rows[0] = { ...env.HN_REPORTS.rows[0], id: ID, auth_hash: hash };
  check("an existing code still saves when new codes are capped", (await call(env, put(ID, "REVG"))).status === 200);
}
{
  const env = { HN_REPORTS: fakeD1() };
  await call(env, put());
  env.HN_REPORTS.rows[0].writes = LIMITS.WRITES_PER_DAY;
  const refused = await call(env, put(ID, "REVG"));
  check("a code past its daily save cap is refused and keeps its data", refused.status === 429 && env.HN_REPORTS.rows[0].data === "QUJD");
  check("it can still be read while capped", (await call(env, { op: "get", id: ID, auth: AUTH })).status === 200);
  env.HN_REPORTS.rows[0].day = day(1); // yesterday's count does not carry over
  const ok = await call(env, put(ID, "REVG"));
  check("the save cap resets the next day", ok.status === 200 && env.HN_REPORTS.rows[0].writes === 1 && env.HN_REPORTS.rows[0].day === TODAY);
}

// ---- forgetting unused codes ---------------------------------------------------
{
  const old = { id: ID2, auth_hash: "x", rev: 3, iv: IV, data: "QQ==", created: day(400), day: day(LIMITS.KEEP_DAYS + 1), writes: 1 };
  const recent = { id: "e".repeat(64), auth_hash: "x", rev: 1, iv: IV, data: "QQ==", created: day(100), day: day(LIMITS.KEEP_DAYS - 1), writes: 1 };
  const env = { HN_REPORTS: fakeD1([old, recent]) };
  await call(env, put());
  const ids = env.HN_REPORTS.rows.map((r) => r.id);
  check(`a code unused for more than ${LIMITS.KEEP_DAYS} days is deleted`, !ids.includes(ID2));
  check("a code used within that window is kept", ids.includes("e".repeat(64)) && ids.includes(ID));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
