# Production Deploy

This project deploys from a staged public bundle to avoid publishing internal repository files.

## One-command production deploy

From the repository root:

```powershell
pwsh -File scripts/deploy-prod.ps1
```

What it does:
1. Rebuilds `.deploy-public` from approved public files and folders.
2. Runs `wrangler deploy` using `wrangler.jsonc` (`assets.directory` points to `.deploy-public`).

## Stage-only (no deploy)

```powershell
pwsh -File scripts/stage-public-assets.ps1
```

Use this to inspect the exact files that would be published.
