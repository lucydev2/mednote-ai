# MedNote AI

**Medical Field Intelligence platform for Medical Science Liaisons.**

A category-defining tool that turns every KEE (Key External Expert) interaction into structured, strategy-ready intelligence that compounds over time.

> *Every conversation makes the next one sharper.*

---

## What's in this repo (current stage)

| Path | Contents |
|---|---|
| `mockups/` | Static UI mockups for the MVP — pre-visit brief, post-visit insight, library + drawer pattern |
| `vercel.json` | Vercel deploy config — `/` rewrites to the mockup gallery |
| `docs/` *(forthcoming)* | Design specs and implementation plans |

This repository is at the **product design stage**. Real application code will land in subsequent branches.

---

## Local preview

```bash
open mockups/index.html
```

Or any browser → `file://.../mockups/index.html`.

---

## Deployment (Vercel)

The mockups are deployed as a static site. The Vercel config (`vercel.json`) rewrites the root URL to `/mockups/index.html` so visitors land directly on the gallery.

### One-time deploy setup

1. **Create a GitHub repo** (e.g. `mednote-ai`) and push this repo to it.
2. **Connect to Vercel** at https://vercel.com/new — import the GitHub repo.
3. Vercel auto-detects this as a static site (no build step). Click **Deploy**.

Subsequent pushes to `main` deploy automatically.

### Alternative — Vercel CLI

If you have Node + Vercel CLI installed:
```bash
npm i -g vercel
vercel
```

Follow the prompts. The CLI handles auth and project linking.

---

## MVP scope (locked in design)

- **Workflow surfaces:** pre-visit brief, post-visit insight
- **Inputs:** PDF, URL, typed text, audio (audio → Whisper-class transcription → text)
- **Outputs (post-visit, 8 fields):** headline insight, summary, keywords, discussion points, action items, internal sharing summary, KEE signal, follow-up email draft
- **Outputs (pre-visit):** scientific context, key topics, suggested questions, discussion strategy, anticipated concerns
- **Architecture:** engine-centric — the Insight Engine is a durable service; web app is a thin client over it
- **Data model:** workspace-of-one hybrid — every user belongs to a workspace from day one
- **Languages:** Korean ↔ English cross-language reasoning (KO default output)
- **Therapeutic focus:** generalist core, oncology-grade layer at launch
- **Compliance:** pharma-grade SaaS, AWS Seoul region, no model training on customer data
