# astro-ask

An astrology web app that computes real natal and transit charts from an
ephemeris and lets you explore them in a chat conversation with an LLM. The
model **never computes** any astrological data — every placement, house, and
aspect is calculated deterministically in code and handed to the model as
ground truth. The model's only job is interpretation.

## What it does

- **Natal charts** — enter a birth date, time, and place; the app geocodes the
  place, resolves the exact UTC instant, and computes planetary positions,
  house cusps, and aspects. It renders the chart wheel and a written
  interpretation.
- **Transits** — pick any date (optionally a time and a different place) and see
  how the current sky lands on the natal chart: transiting positions,
  transit-to-transit aspects (the shared "weather"), and transit-to-natal
  aspects (the personal contact).
- **Chat sessions** — turn any natal or transit reading into an ongoing
  conversation. Follow-up answers stream token-by-token and stay grounded in the
  same computed facts, which are re-attached fresh on every turn.
- **Event finder** — give a topic (e.g. "career", "relationships") and a window
  (3/6/12 months); a deterministic scan finds and dates the significant upcoming
  events, ranks them by strength × topic relevance, and the model explains them.

## Architecture

```
Birth data ──► geocode ──► resolve UTC ──► ephemeris (sweph) ──► ChartData
                                                                     │
                                              aspects (pure, recomputed on read)
                                                                     │
                                                    prompt builders (facts as text)
                                                                     │
                                                         LLM (interpret only)
```

The central design rule: **the ephemeris is the source of truth, the model is a
writer.** Positions and house cusps are frozen at write time; aspects are a pure
function of positions + orb config and are recomputed on every read, so changing
the orb table takes effect immediately rather than being frozen into old rows.

### Tech stack

| Layer      | Choice |
|------------|--------|
| Framework  | Next.js 14 (App Router), React 18 |
| Language   | TypeScript |
| Ephemeris  | [`sweph`](https://www.npmjs.com/package/sweph) (Swiss Ephemeris), Moshier mode — no ephemeris data files required |
| Houses     | Placidus |
| Geocoding  | `node-geocoder`; timezone from `geo-tz`; date math with `luxon` |
| Chart wheel| `@astrodraw/astrochart` |
| Database   | SQLite via Prisma (`prisma/dev.db`) — schema stays portable to Postgres |
| LLM SDK    | Vercel AI SDK (`ai`) with `@ai-sdk/google` |
| Validation | `zod` |

### Layout

- `lib/ephemeris.ts` — planet/house computation from `sweph`
- `lib/aspects.ts` — pure aspect detection from positions + orb config
- `lib/transits.ts` — transit computation; aspects recomputed on read
- `lib/events/` — deterministic event scan, scoring, topic→factor mapping
- `lib/prompts.ts` — turns computed data into the text fact blocks sent to the model
- `lib/interpret.ts` — model calls (natal/transit openers, session titles); **single place the model id lives**
- `app/api/` — route handlers (see below)
- `components/` — chart wheel, birth form, chat UI, etc.

## LLM model

All model traffic goes through **Google Gemini** via the Vercel AI SDK
(`@ai-sdk/google`). The model id is defined in exactly one place —
`MODEL_ID` in `lib/interpret.ts` — and shared by the streaming chat route so the
whole app talks to exactly one model:

```ts
export const MODEL_ID =
  (process.env.GOOGLE_MODEL as string | undefined) ?? "gemini-3.5-flash";
```

- **Default:** `gemini-3.5-flash`
- **Override:** set `GOOGLE_MODEL` in `.env`
- **Auth:** `GOOGLE_GENERATIVE_AI_API_KEY` (read by the SDK)

The model is used in four spots, all interpret-only with strict "never compute,
never invent a placement" system prompts (`lib/prompts.ts`):

1. **Natal interpretation** — one-shot reading of the chart (cached per chart).
2. **Transit opener** — the opening transit reading (cached per transit chart, so
   every session over the same date shares one opener).
3. **Chat turns** — streamed follow-up answers, with the full fact block
   re-attached every turn.
4. **Session title** — one small call to name a session from the first question.

> **Note (Gemini free tier):** the free tier is ~20 requests/day/model. Any
> request that resolves a transit with no cached opener fires a real model call
> (~20s). Repeated LLM-route testing can exhaust quota and surface as HTTP 500s
> that look like bugs. Rate-limit errors (HTTP 429) are classified and degraded
> gracefully in read paths (see `resolveTransitOpener`).

## API

All routes are Next.js App Router handlers under `app/api/`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/charts` | Create a birth chart from birth data → computes & stores the chart |
| `GET`  | `/api/charts/:id` | Fetch a stored chart |
| `DELETE` | `/api/charts/:id` | Delete a chart (cascades transits/sessions) |
| `GET`  | `/api/charts/:id/interpretation` | Get the cached natal interpretation |
| `POST` | `/api/charts/:id/interpretation` | Generate (or force-regenerate) the natal interpretation |
| `GET`  | `/api/charts/:id/transits` | Resolve/create a transit chart + opener (see query params) |
| `POST` | `/api/charts/:id/events` | Deterministic event scan for a topic + window (no model call) |
| `POST` | `/api/charts/:id/events/interpret` | Stream the interpretation of a ranked event list |
| `POST` | `/api/charts/:id/sessions` | Start a chat session (promotes a transit view into a session) |
| `GET`  | `/api/charts/:id/sessions` | List sessions (optionally filtered by `transitChartId`) |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `GET`  | `/api/sessions/:id/messages` | Get a session's messages |
| `POST` | `/api/sessions/:id/chat` | Send a message; streams the assistant reply |
| `GET`  | `/api/geocode?q=` | Place autocomplete/geocoding |

### Selected payloads

**`POST /api/charts`**
```json
{ "name": "Ada", "birthDate": "1990-05-12", "birthTime": "14:30",
  "placeLabel": "London, UK", "latitude": 51.5074, "longitude": -0.1278 }
```
`name` optional; `birthDate` is `YYYY-MM-DD`, `birthTime` is `HH:mm` (both local
to the place). Returns `201` with the computed chart, or `400` with Zod field
errors.

**`GET /api/charts/:id/transits`**
```
?date=YYYY-MM-DD[&time=HH:mm][&placeLabel=&placeLat=&placeLng=]
?transitChartId=<id>              # exact restore (also the opener Retry path)
```
Omitting time and place resolves to noon UTC at the natal location.

**`POST /api/charts/:id/events`**
```json
{ "window": "6m", "topic": "career change" }
```
`window` is one of `3m` | `6m` | `12m`. Returns ranked events with computed
dates — no model call, so this route can never rate-limit. The client then posts
that ranked list to `.../events/interpret` for the streamed reading.

**`POST /api/sessions/:id/chat`**
```json
{ "message": { "role": "user", "content": "What does this mean for me?" } }
```
Returns a streaming data-stream response. History is trimmed to the last 40
turns; the computed fact block is never trimmed.

## Getting started

### Prerequisites

- Node.js 18+
- A Google Generative AI API key

### Setup

```bash
npm install
npx prisma migrate dev        # sets up prisma/dev.db
```

Create `.env`:

```bash
DATABASE_URL="file:./prisma/dev.db"
GOOGLE_GENERATIVE_AI_API_KEY="your-key-here"
# Optional: override the default model (gemini-3.5-flash)
# GOOGLE_MODEL="gemini-3.5-flash"
```

### Run

```bash
npm run dev      # http://localhost:3000 (falls back to :3001 if taken)
npm run build
npm run start
```

### Verification scripts

Standalone checks for the deterministic layers (no server needed):

```bash
npm run verify            # ephemeris
npm run verify:geo        # geocoding / UTC resolution
npm run verify:charts     # chart computation
npm run verify:transits   # transit computation
npm run verify:events     # event finder
npm run verify:prompts    # prompt fact blocks
```

## Database

Prisma models (`prisma/schema.prisma`): `BirthChart`, `TransitChart`,
`Interpretation`, `Session`, `Message`. `chartData` / `transitData` are stored as
stringified JSON (not the `Json` type) so the schema stays portable across SQLite
and Postgres. Deletes cascade from a chart down through its transits and
sessions.
