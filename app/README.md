# MedNote AI — Mobile Companion (Phase 2)

Placeholder for the mobile capture companion. Empty for MVP — real code lands in Phase 2.

## Planned scope

Mobile is a **thin client over the same Insight Engine** that powers the web app — not a shrunken version of the web UI. Three screens:

1. **"Just met with…"** — quick capture (🎤 record or ✎ text), KEE selection, async server-side processing, push notification when ready.
2. **"Today's prep"** — read-only access to pre-visit briefs prepared on web.
3. **"KEE quick view"** — read-only summary + last 3 interactions of a KEE.

## Why this is in a separate directory

The Insight Engine is the durable core; web and mobile are interchangeable clients. Keeping `app/` and `web/` as siblings makes that architectural separation explicit in the repo.
