# Nebras — Crawl4AI sidecar

Python service that runs [Crawl4AI](https://github.com/unclecode/crawl4ai) and exposes a small HTTP API. The Nebras dashboard talks to it from the server side only (Owner-only routes under `/api/admin/crawl4ai/*`).

## Quick start (Windows, recommended)

The repo ships with a Crawl4AI install at `C:\nbcr` to avoid Windows `MAX_PATH` problems with the bundled `litellm` files. If that venv already exists, the start script reuses it; otherwise it creates a local `.venv` inside this folder.

```powershell
cd Nebras_dashboard-main\dashboard\crawl4ai_service
.\start.ps1
```

## Quick start (Linux / macOS)

```bash
cd Nebras_dashboard-main/dashboard/crawl4ai_service
./start.sh
```

## Configuration

Copy `.env.example` → `.env` if you want to change the bind host/port or set a shared secret:

```env
CRAWL4AI_BIND_HOST=127.0.0.1
CRAWL4AI_BIND_PORT=8790
CRAWL4AI_SERVICE_SECRET=
```

In the dashboard `.env` (the SvelteKit app), set:

```env
CRAWL4AI_SERVICE_URL=http://127.0.0.1:8790
CRAWL4AI_SERVICE_SECRET=
```

## HTTP API

| Method | Path        | Purpose                                  |
| ------ | ----------- | ---------------------------------------- |
| GET    | `/health`   | Liveness ping                            |
| GET    | `/status`   | Worker on/off, stats, current job        |
| POST   | `/control`  | `{ "action": "start" \| "stop" }`        |
| POST   | `/crawl`    | `{ "url": "https://..." }` enqueue a job |
| GET    | `/jobs`     | Recent / queued / running jobs           |

All non-health endpoints accept the `X-Crawl4AI-Secret` header when a secret is configured.
