# Contributing

Thanks for considering a contribution.

## Setup

Docker is the only supported way to exercise the full render pipeline — it bundles
Chrome and all of its OS-level dependencies, so there's no local Node/Chrome setup to
get right.

```bash
git clone https://github.com/Fr34k9/cloudflare-pdf.git
cd cloudflare-pdf
cp .env.example .env
docker compose up --build
```

Rebuild after changing source with `docker compose up --build` again.

For quick iteration on non-render logic (routing, schema validation, config) without
Docker, `npm install && npm run dev` compiles and runs the server with auto-restart on
change — but `POST /pdf` will still fail without a local Chrome install, since Puppeteer
needs one. Use Docker whenever you're touching the actual render path.

## Making changes

- The project is plain TypeScript compiled with `tsc`, no framework-specific tooling.
- Keep new request fields aligned with
  [Cloudflare's `/pdf` schema](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/)
  — the whole point of this project is drop-in compatibility, so field names and
  behavior should match Cloudflare's unless there's a good reason to diverge (document
  the divergence in the README's [Security](README.md#security) section if it's a
  security trade-off).
- New nested request options belong in
  [src/schema/pdfRequest.schema.ts](src/schema/pdfRequest.schema.ts); the render
  pipeline that consumes them lives in [src/render/](src/render/).
- If a new option triggers a network request or filesystem access, check whether it
  needs to go through the SSRF guard ([src/security/ssrfGuard.ts](src/security/ssrfGuard.ts))
  or needs stripping like `addScriptTag.path` does — anything a remote caller can point
  at the server's local filesystem or internal network is a vulnerability, not a
  feature.
- There's no automated test suite yet; verify changes manually against a Docker build
  (`docker compose up --build`, or `docker build -t cloudflare-pdf . && docker run
  --env-file .env -p 3000:3000 cloudflare-pdf`) with a few representative `curl`
  requests. Contributions that add test coverage are welcome.

## Pull requests

- Keep PRs focused — one change per PR is easier to review.
- Describe what changed and why, and call out any behavior differences from Cloudflare's
  own `/pdf` endpoint if applicable.
- Update the README/landing page (`public/index.html`) if you add or change a request
  field so both stay accurate.
