# Rentline Sandbox

Real estate investment simulation game engine — **sandbox.rentline.xyz**

Built on the Rentline treasury stack. Players compete over a curated pool of tokenised properties using real RWA data, Plaid-linked mortgages, Fed rate cycles, and macro events.

## Structure

```
rentline-sandbox/
  sandbox-api/     FastAPI game engine (port 6532)
  sandbox-web/     Next.js frontend → sandbox.rentline.xyz
  docker-compose.yml
  .env.example
```

## Quick start

```bash
cp .env.example .env
# Fill in Clerk keys, Supabase URL/key

# API
cd sandbox-api
uv sync
uv run uvicorn app.main:app --reload --port 6532

# Web (separate terminal)
cd sandbox-web
npm install
npm run dev  # runs on port 3001 by default
```

## Env vars

See `.env.example` for all required and optional variables.

The sandbox shares the same Clerk application as `rentline` — users sign in once and both apps recognise the session.

The optional `RENTLINE_API_URL` + `RENTLINE_SANDBOX_BRIDGE_KEY` pair enables simulated rent payments to write real ledger entries into the Rentline dashboard. Leave blank to disable.

## API docs

`http://localhost:6532/docs`

## Deployment

- **API**: Docker via `docker-compose.yml` on the same host as Rentline API (port 6532), or a dedicated VPS. Set `ALLOWED_ORIGINS=https://sandbox.rentline.xyz`.
- **Web**: Vercel project pointing at `sandbox-web/` root. Add `NEXT_PUBLIC_SANDBOX_API_URL` and Clerk env vars.
- **DNS**: `sandbox.rentline.xyz` → CNAME to `cname.vercel-dns.com`.
