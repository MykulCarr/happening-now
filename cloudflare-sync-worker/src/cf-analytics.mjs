// Cloudflare's own analytics for /admin, read from the GraphQL Analytics API.
//
// Two datasets, both on the free plan:
//   - Web Analytics (RUM): the beacon Cloudflare injects into our pages. Real
//     page loads by real browsers: visits, page views, pages, referrers,
//     countries, devices, browsers, OS, and Core Web Vitals.
//   - Zone HTTP traffic: every request the edge served for the zone, bots
//     included, and for every hostname on it (FlightTrack too). Requests,
//     bandwidth, cache, threats, status codes.
//
// Needs CF_ANALYTICS_TOKEN, a secret (wrangler secret put), scoped to
// Account Analytics:Read + Zone Analytics:Read. Read-only by construction.
// A failure shows on /admin as Cloudflare's own error text.

const GQL = "https://api.cloudflare.com/client/v4/graphql";
const SITE_HOST = "happening-now.net";

async function gql(env, query, fetchImpl) {
  const res = await fetchImpl(GQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.errors?.length) {
    const msg = body?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    console.log(`cf-analytics: ${msg}`);
    throw new Error(msg);
  }
  return body.data;
}

export async function cloudflareAnalytics(env, days, fetchImpl = fetch) {
  if (!env.CF_ANALYTICS_TOKEN) return { error: "CF_ANALYTICS_TOKEN is not set on this Worker." };
  const acc = env.CF_ACCOUNT_ID, zone = env.CF_ZONE_ID;
  const until = new Date();
  const since = new Date(until - days * 86400e3);
  // Headless Chrome is our own testing (and scrapers), not readers: it was
  // ~15% of a week's "visits" the first time this ran.
  const rumFilter = `{AND:[{datetime_geq:"${since.toISOString()}"},{datetime_leq:"${until.toISOString()}"},{requestHost:"${SITE_HOST}"},{userAgentBrowser_neq:"ChromeHeadless"}]}`;
  // One RUM breakdown: top values of `dim` by page views, with visits.
  const rum = (alias, dim, limit) =>
    `${alias}:rumPageloadEventsAdaptiveGroups(limit:${limit},filter:${rumFilter},orderBy:[count_DESC]){count sum{visits} dimensions{${dim}}}`;

  // Everything in ONE request: the GraphQL API rate-limits per request
  // budget, and nine parallel queries ran it dry on the first try.
  let d;
  try {
    d = await gql(env, `{viewer{
      accounts(filter:{accountTag:"${acc}"}){
        byDay:rumPageloadEventsAdaptiveGroups(limit:100,filter:${rumFilter},orderBy:[date_ASC]){count sum{visits} dimensions{date}}
        ${rum("pages", "requestPath", 20)}
        ${rum("referrers", "refererHost", 12)}
        ${rum("countries", "countryName", 12)}
        ${rum("devices", "deviceType", 6)}
        ${rum("browsers", "userAgentBrowser", 8)}
        ${rum("os", "userAgentOS", 8)}
        vitals:rumWebVitalsEventsAdaptiveGroups(limit:1,filter:${rumFilter}){count
          quantiles{largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75}}
      }
      zones(filter:{zoneTag:"${zone}"}){
        traffic:httpRequests1dGroups(limit:${days + 1},filter:{date_geq:"${since.toISOString().slice(0, 10)}"},orderBy:[date_ASC]){
          dimensions{date} uniq{uniques}
          sum{requests cachedRequests bytes cachedBytes threats pageViews
            countryMap{clientCountryName requests} responseStatusMap{edgeResponseStatus requests}}}
      }}}`, fetchImpl);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  const a = d.viewer.accounts?.[0] || {};
  const breakdown = (rows, dim) => ({ data: (rows || []).map((r) => ({ k: r.dimensions[dim] || "(none)", views: r.count, visits: r.sum.visits })) });
  return {
    days,
    byDay: { data: (a.byDay || []).map((r) => ({ day: r.dimensions.date, views: r.count, visits: r.sum.visits })) },
    pages: breakdown(a.pages, "requestPath"),
    referrers: breakdown(a.referrers, "refererHost"),
    countries: breakdown(a.countries, "countryName"),
    devices: breakdown(a.devices, "deviceType"),
    browsers: breakdown(a.browsers, "userAgentBrowser"),
    os: breakdown(a.os, "userAgentOS"),
    vitals: { data: a.vitals?.[0] || null },
    traffic: summarizeTraffic(d.viewer.zones?.[0]?.traffic || []),
  };
}

// Fold the per-day zone rows into totals plus top countries and status codes.
function summarizeTraffic(rows) {
  const sum = (f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const fold = (list, key) => {
    const m = new Map();
    for (const r of rows) for (const x of list(r) || []) m.set(x[key], (m.get(x[key]) || 0) + x.requests);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ k: String(k), n }));
  };
  return { data: {
    requests: sum((r) => r.sum.requests), cached: sum((r) => r.sum.cachedRequests),
    bytes: sum((r) => r.sum.bytes), cachedBytes: sum((r) => r.sum.cachedBytes),
    threats: sum((r) => r.sum.threats), pageViews: sum((r) => r.sum.pageViews),
    uniquesByDay: rows.map((r) => ({ day: r.dimensions.date, uniques: r.uniq.uniques, requests: r.sum.requests })),
    countries: fold((r) => r.sum.countryMap, "clientCountryName"),
    statuses: fold((r) => r.sum.responseStatusMap, "edgeResponseStatus"),
  } };
}
