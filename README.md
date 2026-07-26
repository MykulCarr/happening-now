# HAPPENING NOW

A personal news, weather and stocks dashboard live at
[happening-now.net](https://happening-now.net). Static HTML/CSS/JS served from
Cloudflare Workers assets, installable as a PWA, with a companion Worker that
proxies and caches the feeds the browser can't fetch directly.

No build step for source — the files you edit are the files that ship. Minification
happens only when staging the deploy bundle.

## Run it locally

Serve the repo root over HTTP (the pages use fetch and a service worker, so
`file://` won't work):

```powershell
python -m http.server 8080
```

Then open <http://localhost:8080/>. The bundled VS Code launch config
(`.vscode/launch.json`) points Chrome at the same port.

The site calls the Worker at `/v1/artemis/updates` for feed data. Running the
static pages locally still hits the **production** Worker, so news widgets work
without running anything else.

## Pages

| Page | What it is |
|---|---|
| `index.html` | Main dashboard — news, info bar |
| `weather.html` | Forecast + weather news |
| `stocks.html` | Tickers + market news |
| `settings.html` | Source picker and preferences (`noindex`) |
| `sources.html` | Public list of feeds used |
| `privacy.html` / `terms.html` | Legal |

## Deploy

```powershell
pwsh -File scripts/deploy-prod.ps1
```

Stages an approved-files-only bundle into `.deploy-public`, minifies it, runs
`wrangler deploy`, pings IndexNow, and snapshots URLs to the Wayback Machine.
See [docs/deploy.md](docs/deploy.md). Requires `npm install` once for esbuild.

## Docs

- [docs/deploy.md](docs/deploy.md) — deploy procedure
- [docs/rollback-runbook.md](docs/rollback-runbook.md) — how to roll back
- [docs/ops-monitoring-checklist.md](docs/ops-monitoring-checklist.md) — check-in cadence
- [docs/web-presence-baseline.md](docs/web-presence-baseline.md) — SEO/analytics setup
- [docs/launch-signoff.md](docs/launch-signoff.md) — launch criteria (signed off)
