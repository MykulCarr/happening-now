// Forces every branch of the admin token check in
// cloudflare-sync-worker/src/admin.mjs, using a throwaway RSA key standing in
// for the Cloudflare Access team's signing key. The point is the refusals:
// a lock that is only ever tested with the right key proves nothing.
//
//   npm run test:admin
import { handleAdmin } from "../cloudflare-sync-worker/src/admin.mjs";

const TEAM = "example.cloudflareaccess.com";
const AUD = "aud-123";
const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256" };
const other = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);

async function token(payload, { kid = "k1", alg = "RS256", key = privateKey } = {}) {
  const head = enc({ alg, kid, typ: "JWT" }), body = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { aud: [AUD], email: "me@example.com", exp: now + 3600, iat: now, iss: `https://${TEAM}` };

let certFetches = 0;
const fetchImpl = async (url) => {
  certFetches++;
  if (url !== `https://${TEAM}/cdn-cgi/access/certs`) throw new Error("unexpected fetch " + url);
  return new Response(JSON.stringify({ keys: [jwk] }));
};
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, HN_STATE_DATA: { get: async () => null } };
const respond = (body, status) => ({ body, status });
const req = (tok, { method = "GET", path = "/v1/admin/summary" } = {}) => ({
  method, url: `https://happening-now.net${path}`,
  headers: { get: (h) => (h === "Cf-Access-Jwt-Assertion" ? tok : null) },
});

let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; };
const status = async (r, e = env) => (await handleAdmin(r, e, respond, fetchImpl)).status;

const ok = await handleAdmin(req(await token(good)), env, respond, fetchImpl);
check("a valid Access token gets the summary", ok.status === 200 && ok.body.signedInAs === "me@example.com");
check("unconfigured (empty vars) refuses even a valid token", await status(req(await token(good)), { ...env, ACCESS_AUD: "" }) === 401);
check("no token is refused", await status(req("")) === 401);
check("garbage token is refused", await status(req("not.a.jwt")) === 401);
check("token for a different Access app (aud) is refused", await status(req(await token({ ...good, aud: ["someone-else"] }))) === 401);
check("expired token is refused", await status(req(await token({ ...good, exp: now - 10 }))) === 401);
check("token from another team (iss) is refused", await status(req(await token({ ...good, iss: "https://evil.cloudflareaccess.com" }))) === 401);
check("token signed with a different key is refused", await status(req(await token(good, { key: other.privateKey }))) === 401);
check("unknown key id is refused", await status(req(await token(good, { kid: "nope" }))) === 401);
check("alg=none is refused", await status(req(`${enc({ alg: "none", kid: "k1" })}.${enc(good)}.`)) === 401);
const t = await token(good);
const [h, , s] = t.split(".");
check("an edited payload with the original signature is refused", await status(req(`${h}.${enc({ ...good, email: "attacker@x" })}.${s}`)) === 401);
check("POST is refused", await status(req(t, { method: "POST" })) === 405);
check("unknown admin path is 404 (after auth)", await status(req(t, { path: "/v1/admin/delete-everything" })) === 404);
check("team keys are cached, not fetched per request", certFetches === 1);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
