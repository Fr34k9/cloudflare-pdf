# cloudflare-pdf

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Self-hosted, Docker-deployable clone of Cloudflare's
[Browser Rendering `/pdf` endpoint](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/).
Send it a URL or raw HTML, get a rendered PDF back — same request field names as
Cloudflare's API, so switching between the two is just a base-URL change, no rewrite
required.

A usage-focused landing page describing the API is served at `GET /` on every deployment
(see [public/index.html](public/index.html)).

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Docker](#docker)
- [Deploying](#deploying)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Drop-in Cloudflare `/pdf` compatibility** — `url`/`html`, `viewport`, `gotoOptions`,
  `cookies`, `authenticate`, `userAgent`, `setJavaScriptEnabled`,
  `setExtraHTTPHeaders`, `addScriptTag`/`addStyleTag`, `allow/rejectResourceTypes`,
  `allow/rejectRequestPattern`, `waitForSelector`, `waitForTimeout`, `emulateMediaType`,
  `bestAttempt`, `actionTimeout`, and the full `pdfOptions` set.
- **No account, no API token, no vendor lock-in** — runs anywhere Docker runs.
- **SSRF-hardened by default** — private/internal network targets are blocked
  automatically (see [Security](#security)).
- **Deploys anywhere Docker runs** — a single Dockerfile, healthcheck included, no
  manual Chromium setup.
- **Small, boring stack** — Node.js, Express, TypeScript, Puppeteer, Zod. No exotic
  runtime requirements.

## Quick start

```bash
git clone https://github.com/Fr34k9/cloudflare-pdf.git
cd cloudflare-pdf
cp .env.example .env
docker compose up --build
```

`docker-compose.yml` loads its configuration from that `.env` file (`env_file: .env`) —
`docker compose up` refuses to start without one, so there's no silent fallback to
whatever happens to be in `.env.example`. Edit `.env` to change any of the
[configuration](#configuration) values below.

Then:

```bash
curl -X POST http://localhost:3000/pdf \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}' \
  --output example.pdf
```

Docker is the only supported way to run this service — it bundles Chrome and all of its
OS-level dependencies, so there's no local Node/Chrome setup to get right. See
[Contributing](#contributing) for a non-Docker `npm run dev` workflow if you're iterating
on logic that doesn't need Chrome.

## Configuration

All configuration is via environment variables (see [.env.example](.env.example) for the
full template). How you provide them depends on how you're running the service:

- **Docker Compose** (local self-host): copy `.env.example` to `.env` and edit it — the
  container reads its config from that file (`env_file: .env` in
  [docker-compose.yml](docker-compose.yml)), and `docker compose up` will refuse to start
  if `.env` is missing.
- **Plain `docker run` or any other host**: set variables via `-e KEY=value` flags or
  your platform's environment-variable settings — no `.env` file is needed, and every
  variable below has a sane default if left unset.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MAX_CONCURRENT_RENDERS` | `4` | Renders processed in parallel before returning `429` |
| `REQUEST_TIMEOUT_MS` | `60000` | Overall wall-clock timeout per render |
| `MAX_BODY_SIZE` | `2mb` | Max JSON request body size |
| `SHUTDOWN_GRACE_PERIOD_MS` | `15000` | Max time to wait for in-flight renders on shutdown |
| `ALLOW_PRIVATE_NETWORK_TARGETS` | `false` | Disable the SSRF guard (see [Security](#security)) — only for trusted-network deployments |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window for `POST /pdf` |
| `RATE_LIMIT_MAX` | `30` | Max requests per IP per window |
| `TRUST_PROXY_HOPS` | `1` | Reverse-proxy hops to trust for client IP (a single reverse proxy, e.g. Traefik or nginx, = 1) |

No API key is required by default — this is an open endpoint, by design, so it's a true
drop-in replacement without needing to manage a secret. See [Security](#security) for
what protects it instead, and for stronger options if you need them.

## API

`POST /pdf` — body is a JSON object matching
[Cloudflare's `/pdf` request schema](https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/):
exactly one of `url` or `html`, plus any of `viewport`, `gotoOptions`, `cookies`,
`authenticate`, `userAgent`, `setJavaScriptEnabled`, `setExtraHTTPHeaders`,
`addScriptTag`/`addStyleTag`, `allow/rejectResourceTypes`, `allow/rejectRequestPattern`,
`waitForSelector`, `waitForTimeout`, `emulateMediaType`, `bestAttempt`, `actionTimeout`,
and `pdfOptions` (`format`, `landscape`, `scale`, `margin`, `printBackground`,
`displayHeaderFooter`, `headerTemplate`/`footerTemplate`, `pageRanges`, `width`/`height`,
`preferCSSPageSize`). Full field-level behavior mirrors Cloudflare's own documentation —
the landing page at `GET /` has a complete parameter reference table.

```bash
curl -X POST http://localhost:3000/pdf \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com",
    "pdfOptions": { "format": "A4", "printBackground": true, "landscape": true }
  }' \
  --output styled.pdf
```

Response: `200` with `Content-Type: application/pdf` and the PDF binary. Errors are JSON
(`400` invalid request/blocked target, `413` body over `MAX_BODY_SIZE`, `429` over the
concurrency or rate limit, `502` render failure, `504` render timeout).

`GET /health` — `200` if the shared browser instance is up, `503` otherwise. Used by the
Docker `HEALTHCHECK` and can be wired up as your platform's health check path.

`GET /limits` — returns the running instance's public-safe config as JSON
(`maxConcurrentRenders`, `requestTimeoutMs`, `maxBodySize`, `rateLimitWindowMs`,
`rateLimitMax`). Used by the landing page at `GET /` to display live limits instead of
hardcoded numbers.

## Docker

```bash
docker build -t cloudflare-pdf .
docker run -p 3000:3000 cloudflare-pdf
```

This runs with built-in defaults (no `.env` needed) — pass `--env-file .env` or `-e
KEY=value` flags to override any of the [configuration](#configuration) values.

The runtime image is `ghcr.io/puppeteer/puppeteer:25.3.0`, which ships a matching Chrome
build and all required OS-level dependencies preinstalled — no manual Chromium/apt setup
needed.

## Deploying

This is a plain Dockerfile-based service, so it runs on any platform that can build and
run one — a VPS, a PaaS with a "deploy from Dockerfile" option, Kubernetes, etc.:

1. Push this repository to a Git remote your platform can access, or build the image
   directly with `docker build` (see [Docker](#docker)).
2. Build from the [Dockerfile](Dockerfile) — it already declares `EXPOSE 3000` and a
   `HEALTHCHECK`, which most platforms auto-detect; point your platform's health check at
   `/health` if it asks for one explicitly.
3. No environment variables are required to get a working deployment; set any of the
   [configuration](#configuration) values above through your platform's environment
   variable settings to tune limits.
4. Once it's healthy, visiting the app's URL shows the landing page, and `POST` to
   `<your-app-url>/pdf` renders PDFs.

## Security

This service is designed to be safely exposed beyond a trusted network **without** an
API token — a static access token wouldn't actually close the gaps that matter here
(it's just a secret to leak, not a fix for SSRF or file-read bugs). In short, it ships
with:

- An always-on **SSRF guard** blocking navigation and sub-requests to private, loopback,
  link-local, and cloud-metadata addresses — re-checked on every sub-resource request
  (not cached), so a hostname can't pass the check once and then rebind to an internal
  address mid-render.
- **No local filesystem access** driven by request bodies (`addScriptTag`/`addStyleTag`
  `path`, `pdfOptions.path` are always ignored server-side).
- **Per-IP rate limiting** and **concurrency/timeout/body-size limits** — `actionTimeout`
  can only shorten a render's timeout, never extend it past the server's own
  `REQUEST_TIMEOUT_MS`, and `viewport` dimensions are capped at 10,000px — so no single
  request can hold resources past what the operator configured, or force pathological
  memory use.
- **Defense-in-depth validation of user-supplied regex filters**
  (`allowRequestPattern`/`rejectRequestPattern`) that rejects common
  catastrophic-backtracking shapes before they're compiled, to limit ReDoS risk.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
