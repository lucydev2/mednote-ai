# MedNote AI

**Medical Field Intelligence platform for Medical Science Liaisons.**

A category-defining tool that turns every KEE (Key External Expert) interaction into structured, strategy-ready intelligence that compounds over time.

> *Every conversation makes the next one sharper.*

---

## Repository structure

```
MEDNOTEAI/
├── web/              # Web app (current MVP — static mockups; future: real Next.js code)
│   ├── index.html    # Gallery
│   └── mockups/      # Pre-visit, post-visit, library mockups
│
├── app/              # Mobile companion (Phase 2 — placeholder)
│
├── docs/             # Design specs and implementation plans (forthcoming)
│
├── vercel.json       # Vercel deploy config
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

The `web/` directory is deployed to Vercel as a static site.

### One-time Vercel project setup

1. **Create a GitHub repo** and push this repo to it.
2. **Connect to Vercel** at https://vercel.com/new — import the GitHub repo.
3. In Vercel project settings: **Build & Output Settings → Root Directory → `web`**
4. Click **Deploy**.

Subsequent pushes to `main` deploy automatically.

### Alternative — Vercel CLI

If you have Node + Vercel CLI installed:
```bash
npm i -g vercel
cd web
vercel
```

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
