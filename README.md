# MedNote AI

**Medical Field Intelligence platform for Medical Science Liaisons.**

A category-defining tool that turns every KEE (Key External Expert) interaction into structured, strategy-ready intelligence that compounds over time.

> *Every conversation makes the next one sharper.*

---

## Repository structure

```
MEDNOTEAI/
├── web/              # Web app (mockups + future Next.js code)
│   ├── index.html    # Gallery
│   └── mockups/      # Pre-visit, post-visit, library, wizard mockups
│
├── api/              # Vercel Functions (serverless API)
│   └── generate-insight.js   # POST /api/generate-insight — Gemini 2.5 Flash
│
├── app/              # Mobile companion (Phase 2 — placeholder)
│
├── docs/             # Design specs (Decision Log, full architecture)
│
├── package.json      # Function dependencies (@google/generative-ai)
├── vercel.json       # Deploy config + URL rewrites
├── README.md
└── .gitignore
```

The two clients (`web/`, `app/`) are siblings because the architectural unit of value is the **Insight Engine** — a durable core that both clients call into. Web and mobile are interchangeable surfaces.

---

## Local preview (web mockups)

```bash
open web/index.html
```

Or any browser → `file://.../web/index.html`.

---

## Deployment (Vercel)

`/web/` is served as a static site. `/api/*` runs as Vercel Functions (Node 18+).

### One-time Vercel project setup

1. Push this repo to GitHub.
2. Import at https://vercel.com/new — Vercel auto-detects the function.
3. **Add environment variable** (project settings → Environment Variables):
   - Name: `GEMINI_API_KEY`
   - Value: your Gemini API key from https://aistudio.google.com/apikey (free tier OK)
   - Environments: Production + Preview
4. Click **Deploy**.

Subsequent pushes to `main` redeploy automatically.

---

## Real AI summary feature (prototype)

The `+ New Insight` wizard is wired end-to-end to **Gemini 2.5 Flash** via `/api/generate-insight`. Paste meeting notes (≥ 10 chars) and click *Generate insight* — the engine returns a structured 8-field insight grounded in your input.

### Spec rules enforced by the system prompt (api/generate-insight.js)

- **Strict grounding** — only information explicitly in the input
- **No fabrication** — refuses with `insufficient_information=true` if input is too thin
- **Multi-speaker handling** — prioritizes likely-KEE statements; treats likely-MSL statements as context only (Clova Note / iPhone / Otter compatible)
- **Schema-validated output** — Gemini's `responseSchema` enforces the 10-field JSON shape (8 generative + 2 trust signals: `confidence_level` + `insufficient_information`)
- **Output language** — Korean default, English on request
- **KEE Signal taxonomy** — fixed enum (8 oncology signals); model cannot invent new tags

### What's NOT yet wired (this iteration)

- Pre-visit brief workflow (still hardcoded mock)
- Audio path (Whisper integration deferred)
- Speaker inference pre-pass (single-pass only for now; spec §7.12 covers full design)
- Per-sentence verification with embedding match (spec §7.11)
- KEE record persistence / Save flow (mock-only)

### Production note

Spec §7.3 targets **Claude Sonnet** as the production reasoning model. This iteration uses **Gemini 2.5 Flash** for free-tier prototyping. Production model selection will be re-evaluated based on grounding eval results (Suite A, F, G, H).

### Free-tier rate limits

Gemini 2.5 Flash free tier: ~15 RPM, ~1500 RPD. Sufficient for testing; not for production. Free tier may use data for service improvement — **do NOT input real PHI or sensitive customer data into this prototype**.

---

## Local development

Vercel Functions need Node 18+ for local testing:

```bash
npm install
npm i -g vercel        # one-time
vercel dev             # serves /api/* + /web/* on http://localhost:3000
```

Set `GEMINI_API_KEY` in `.env.local` (gitignored) for local testing.

---

## MVP scope (locked in design)

| Decision | Lock |
|---|---|
| Workflow surfaces | Pre-visit brief · Post-visit insight |
| Inputs | PDF · URL · Text · Audio (Whisper-class → text) |
| Post-visit output (8 fields) | Headline · Summary · Keywords · Discussion points · Action items · Internal sharing · KEE Signal · Email draft |
| Pre-visit output (5 fields) | Scientific context · Key topics · Suggested questions · Discussion strategy · Anticipated concerns |
| Architecture | Engine-centric — Insight Engine as durable core, web/mobile as thin clients |
| Workspace model | "Workspace-of-one" hybrid — workspace is the unit of intelligence |
| Languages | Korean ↔ English cross-language reasoning (KO default output) |
| Therapeutic focus | Generalist core · oncology-grade layer at launch |
| Compliance | Pharma-grade SaaS · AWS Seoul · no model training on customer data |
