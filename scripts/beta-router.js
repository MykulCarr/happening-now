// Beta site Worker (news-pages-beta, `wrangler deploy --env beta`).
//
// Production gets /v1/* to the API Worker with a zone route. Beta lives on a
// Workers custom domain instead (beta.happening-now.net, no DNS to manage),
// so this hands /v1/* to happening-now-sync-beta over a service binding and
// serves everything else from the staged site. The beta API therefore has no
// public address of its own: it is only reachable through this Worker,
// which sits behind Cloudflare Access.
//
// Static files never reach this code: assets are matched first, and only a
// request with no matching file (every /v1/* call) runs the Worker.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/v1/")) return env.API.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
