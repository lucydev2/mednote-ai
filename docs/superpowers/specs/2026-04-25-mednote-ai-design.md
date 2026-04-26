# MedNote AI — Product Design

**Date:** 2026-04-25
**Status:** Approved (Sections 1–9), pending final spec review.
**Authors:** Yujeong Lee (PM), Claude (design partner)

---

## 1. Executive Summary

MedNote AI is a **Medical Field Intelligence platform** purpose-built for Medical Science Liaisons (MSLs) in pharma and biotech. It turns every interaction with a Key External Expert (KEE) into structured, strategy-ready intelligence that **compounds over time**.

> *Every conversation makes the next one sharper.*

### The category

MedNote AI is not a CRM (data entry), not a transcription tool (one meeting → one note), and not a generic note-taker (no per-KEE memory). It is a **memory layer** — every saved insight makes the next interaction, the next territory plan, and the next medical strategy smarter.

| | Veeva CRM | Within3 | Generic notes | **MedNote AI** |
|---|---|---|---|---|
| Primary mode | Data entry | Engagement channel | Transcription | **Insight generation** |
| Per-KEE memory | Activity log | Conversation log | None | **Living intelligence profile** |
| Visit lifecycle | Post-visit only | During only | Capture only | **Pre + during + post** |
| Output | Records | Threads | Summaries | **Strategy — discussion plan, action items, engagement approach** |

### Four pillars of differentiation

1. **Insight-first**, not data-entry-first.
2. **KEE intelligence system** — value compounds with every interaction.
3. **Full visit lifecycle** — preparation, conversation, follow-up.
4. **Strategy-oriented outputs** — not just what was said, but what to do next.

---

## 2. MVP Scope (Locked Decisions)

| Decision | Lock | Rationale |
|---|---|---|
| **MVP wedge** | Insight generation engine for **pre-visit and post-visit workflows** | Fast time-to-value; strong demo narrative; keeps focus on core engine; data structure seeds v2 KEE intelligence |
| **Form factor** | Standalone web app | Speed; clarity; no enterprise integration cost; bottom-up adoption path |
| **Inputs** | PDF · URL · typed text · audio (Whisper-class → text) | All inputs normalize to text before the engine; future modalities slot in cleanly |
| **Pre-visit output (5 fields)** | Scientific context · Key topics · Suggested questions · Discussion strategy · Anticipated concerns | Mirrors real MSL prep workflow |
| **Post-visit output (8 fields)** | Headline insight · Summary · Keywords · Discussion points · Action items · Internal sharing summary · KEE Signal · Follow-up email draft | Surfaces both MSL-direct value (action items) and cross-functional value (internal sharing) |
| **KEE association model** | Hybrid — type-ahead resolver with create-on-the-fly default | Zero onboarding friction; clean structured data from day one |
| **Workspace model** | Workspace-of-one hybrid — every user belongs to a workspace from day one | Workspace is the unit of intelligence; no rearchitecture for v2 team features |
| **Languages** | Korean ↔ English cross-language reasoning | Real Korean MSL workflow: English literature, Korean conversation; defensible beachhead |
| **Default output language** | Korean (workspace setting; per-output override) | Korean MSL primary use case |
| **AI strategy** | Selective multi-model — Claude Sonnet for reasoning, Whisper for audio, Haiku for self-rating | Balances quality and cost |
| **Compliance posture** | Pharma-grade SaaS — AWS Seoul, no model training on customer data, PIPA-compliant | Korean pharma buyer expectations |
| **Therapeutic scope** | Generalist core + oncology-grade layer at launch | "Oncology-grade intelligence on top of a generalist engine" |
| **Architectural shape** | Engine-centric — Insight Engine as durable core, web app as thin client | Engine is the product; web/mobile are interchangeable surfaces |

### Out of MVP

- Word / PDF export (post-visit clipboard + markdown copy is sufficient)
- v2 KEE Intelligence Dashboard (signal aggregation, treatment preference charts, engagement strategy panels)
- Mobile companion app (Phase 2 — capture-only thin client)
- Therapeutic layers beyond oncology (immunology, rare disease, etc.)
- SSO / SAML (enterprise tier)
- HIPAA scope expansion
- On-prem deployment
- Native PowerPoint (.pptx) ingestion
- OCR / handwritten note ingestion
- Full meeting transcript ingestion (post-Teams/Zoom export)
- KEE merge / dedup admin tool (data model has `merged_into` field; surface tool ships in v2)
- Workspace member invite & multi-user team features (v2 — auth and `workspace_members` table exist from MVP, but invite UX is deferred)

---

## 3. Architecture Overview

### 3.1 High-level shape

```
                ┌────────────────────────────────────────────────┐
                │                  Web App                       │
                │      (thin client — Next.js / React)           │
                │   workspace · KEE · brief · insight UI         │
                └────────────────────┬───────────────────────────┘
                                     │ REST / streaming SSE
                                     ▼
                ┌────────────────────────────────────────────────┐
                │              Insight Engine (service)          │
                │  ┌──────────────────────────────────────────┐  │
                │  │  Prompt orchestration (KO/EN aware)      │  │
                │  │  Model router (Claude / Whisper / aux)   │  │
                │  │  Oncology layer (taxonomy, templates)    │  │
                │  │  Output schema validator (Zod)           │  │
                │  │  Self-rating confidence pass             │  │
                │  │  Source-ref attachment (embeddings)      │  │
                │  └──────────────────────────────────────────┘  │
                └────┬─────────────────────────┬─────────────────┘
                     │                         │
       ┌─────────────▼─────────┐   ┌───────────▼─────────────┐
       │  Ingestion workers    │   │    Data layer           │
       │  (async, queue-fed)   │   │  Postgres (Seoul)       │
       │  · PDF parser         │   │  Object storage (S3)    │
       │  · URL fetcher        │   │  Audit log              │
       │  · Audio transcriber  │   │  Redis (queue/cache)    │
       │  → normalized text    │   └─────────────────────────┘
       └───────────┬───────────┘
                   ▼
        ┌──────────────────────────┐
        │   External providers     │
        │  · Anthropic (Claude)    │
        │  · OpenAI Whisper        │
        └──────────────────────────┘
```

### 3.2 Key architectural choices

- **Three logical services** (Web App, Insight Engine, Ingestion Workers) — each independently deployable; shared Postgres + S3 in MVP for operational simplicity.
- **Async ingestion** — uploads return job IDs immediately; workers process in background; UI polls or subscribes via SSE. Heavy inputs (PDFs, audio) never block UX.
- **Single canonical engine interface** — `(normalized_text, workflow_type, language, kee_context, oncology_context) → structured_output`. All input modalities converge on this contract.
- **Model routing inside the engine** — web app never knows which model produced a result.
- **Korea-region only data residency** — all customer data in ap-northeast-2 (Seoul).
- **Audit log first-class from day one** — admin UI deferred to v2; data captured synchronously from MVP.

### 3.3 Why engine-centric

> The Insight Engine is the product — the web app is just a client.

Architecturally mirrors the locked product principles:
- Workspace = unit of intelligence ↔ engine = unit of capability
- KEE intelligence compounds in the data layer ↔ v2 dashboard plugs into existing data
- Mobile companion (Phase 2) = thin client over the same engine — no rebuild
- Multi-model routing is encapsulated in one place

---

## 4. Component Breakdown

### 4.1 Web App — *thin client*

**Stack:** Next.js (App Router) · React · TanStack Query · Tailwind · shadcn/ui · Zod (shared schemas)

**Responsibilities**
- Authentication (workspace membership, magic-link login)
- Workspace + KEE record CRUD with type-ahead resolution
- Wizard flows — pre-visit (4-step), post-visit (3-step)
- Output review / edit / save UI
- Library + filtering
- Job status polling / SSE for streaming engine output

**Explicitly NOT in the web app:** LLM calls, PDF/audio parsing, prompt logic.

### 4.2 Insight Engine — *the core*

**Stack:** Node.js (Fastify) · Anthropic SDK · Zod · BullMQ client · OpenTelemetry

**Responsibilities**
- Three-layer prompt orchestration (system → oncology → user)
- Model routing
- Output schema validation
- Confidence self-rating
- Source-ref attachment via embeddings
- Streaming output (SSE)
- Prompt versioning (in-code, not DB)

**Public interface**

| Endpoint | Purpose |
|---|---|
| `POST /generate/pre-visit-brief` | Returns 5-field brief from sources |
| `POST /generate/post-visit-insight` | Returns 8-field insight from notes |
| `GET /jobs/:id` | Status / streamed result |

### 4.3 Ingestion Workers — *normalize-to-text boundary*

**Stack:** Node.js workers · BullMQ · Redis (ElastiCache Seoul)

**Responsibilities**
- PDF parser (`pdf-parse` / `unpdf`) — text extraction; figures dropped (text-first MVP)
- URL fetcher (JSDOM + Mozilla Readability) — PubMed/journal-aware adapters
- Audio transcriber (Whisper API) — KO/EN auto-detect; chunk if > 25 min

**Output:** `{ text, metadata, source_id, lang }` → engine consumes via job result.

### 4.4 Data Layer

| Component | Service | Region |
|---|---|---|
| Primary DB | Postgres on RDS | ap-northeast-2 |
| Object storage | S3 | ap-northeast-2 |
| Cache + queue | Redis (ElastiCache) | ap-northeast-2 |

**Tables:** `workspaces` · `users` · `workspace_members` · `kees` · `briefs` · `insights` · `sources` · `jobs` · `audit_log` · `kee_signals` · `signal_taxonomy`

### 4.5 External Providers

| Provider | Use | Data agreement |
|---|---|---|
| **Anthropic (Claude Sonnet)** | All reasoning, structured generation | Enterprise data agreement — no training on customer data |
| **OpenAI (Whisper)** | Audio → text | API plan with data-use opt-out |

### 4.6 Cross-cutting concerns

- **Audit log** — first-class table; every state-changing event written synchronously. UI for viewing logs deferred to v2; data captured from day one.
- **Observability** — OpenTelemetry traces from web → engine → workers; structured logs to CloudWatch; latency / cost / token-use metrics on every engine call.
- **Feature flags** — single env-driven flag service for MVP.

---

## 5. Data Model

### 5.1 Entity diagram

```
                  ┌─────────────┐
                  │  workspace  │ ← unit of intelligence
                  └──────┬──────┘
                         │
       ┌──────────┬──────┴──────┬─────────────┬────────────┐
       │          │             │             │            │
       ▼          ▼             ▼             ▼            ▼
 workspace_   ┌─────┐      ┌────────┐    ┌────────┐   ┌─────────┐
  members ───►│ kee │      │ source │    │  job   │   │audit_log│
       │     └──┬──┘      └────┬───┘    └───┬────┘   └─────────┘
       │        │              │            │
       │   ┌────┴────┬─────┐   │            │
       │   ▼         ▼     │   │            │
       │┌──────┐ ┌──────┐  │   │            │
       └┤brief │ │insight│  │   │            │
        └──┬───┘ └───┬──┘  │   │            │
           │         │     │   │            │
           ▼         ▼     │   │            │
        source_refs ───────┘   │            │
                               │            │
                ┌──────────────┘            │
                ▼                           │
         ┌────────────┐               ┌─────┴──────┐
         │ kee_signal │◄──────────────│  insight   │
         └─────┬──────┘   (denormalized for v2 dashboard)
               │
               ▼
        ┌────────────────┐
        │signal_taxonomy │   ← seeded with oncology signals
        └────────────────┘
```

### 5.2 Core tables

#### `workspace`
`id · name · settings(jsonb) · default_output_language · created_at`

#### `kee`
`id · workspace_id · name · name_normalized · institution · specialty · tags(text[]) · merged_into · created_at`

**Indices:** `(workspace_id, name_normalized)` for type-ahead resolution; trigram on `name` for fuzzy match.

#### `source`
`id · workspace_id · type(enum: pdf/url/text/audio) · s3_key · url · normalized_text · embeddings(jsonb) · language_detected · processing_status · metadata(jsonb)`

**Lifecycle:** raw uploads in S3 (90 days hot, then Glacier); `normalized_text` retained indefinitely for re-processing.

#### `brief` (pre-visit, 5 output fields)
```
id · workspace_id · kee_id · title · output_language(enum: ko/en)
status(enum: draft/saved)

scientific_context        jsonb  { text, confidence }
key_topics                jsonb  [{ text, confidence, source_ref_ids[] }]
suggested_questions       jsonb  [{ text, confidence, source_ref_ids[] }]
discussion_strategy       jsonb  [{ text, confidence, source_ref_ids[] }]
anticipated_concerns      jsonb  [{ text, confidence, source_ref_ids[] }]

source_refs               jsonb  [{ id, source_id, type, locator, quoted_text }]
ai_confidence             numeric  -- aggregate, derived from per-field
model_version · prompt_version
created_by · created_at · last_edited_by · updated_at
```

#### `insight` (post-visit, 8 output fields)
```
id · workspace_id · kee_id · title · output_language(enum: ko/en)
status(enum: draft/saved)

headline_insight          jsonb  { text, confidence }
summary                   jsonb  { text, confidence }
keywords                  text[]
discussion_points         jsonb  [{ text, confidence, source_ref_ids[] }]
action_items              jsonb  [{ text, due_date?, confidence }]
internal_sharing_summary  jsonb  { medical, commercial, market_access }
kee_signals               jsonb  [{ tag, confidence }]
email_draft               jsonb  { subject, to, body, language }

source_refs · ai_confidence · model_version · prompt_version
audio_source_id           uuid?  -- if from audio, links to source for re-listen
```

#### `kee_signal` (denormalized, append-only — *the v2 dashboard fuel*)
`id · kee_id · workspace_id · signal_tag · confidence · source_insight_id · created_at`

Every saved post-visit insight contributes rows here within a single transaction with the insight save. Append-only on edit (never UPDATE existing rows). The v2 KEE intelligence dashboard reads "latest signal per insight" via window functions over this table.

#### `signal_taxonomy` (seed table)
`tag · display_name_ko · display_name_en · therapeutic_area · description · color_hint`

Seeded with oncology taxonomy: `efficacy-driven`, `safety-cautious`, `biomarker-focused`, `regimen-conservative`, `IO-combination-oriented`, `real-world-data-sensitive`, `data-skeptical`, plus a generic set.

#### `job` and `audit_log`
Standard async tracking and append-only audit table.

### 5.3 Three first-class enhancements

#### Confidence model
- **Per-field `confidence`** numeric `[0, 1]`, returned by the engine for each generative field.
- **Aggregate `ai_confidence`** — derived for at-a-glance card badge.
- **UI surfacing:**
  - `< 0.5` → red dot + tooltip "Low confidence: verify against sources"
  - `0.5 – 0.7` → amber dot + tooltip
  - `≥ 0.7` → no indicator
- **Source of confidence:** Claude's logprobs are unreliable; a *self-rating prompt step* (separate Haiku pass) rates each generated field on a 0–1 scale, calibrated against an offline eval set.

#### Source traceability (`source_refs`)
- Every generative field can carry `source_ref_ids[]` pointing into a top-level `source_refs` array on the same record.
- Each `source_ref` has: `{ source_id, type, locator, quoted_text }`.
- **Locator examples:**
  - PDF: `{ page: 4, char_range: [1240, 1380] }`
  - URL: `{ anchor: '#results', selector: 'p:nth-of-type(3)' }`
  - Audio: `{ start_ms: 142500, end_ms: 156000 }`
- **UI surfacing:** small `[1]` `[2]` superscripts after sentences; clicking opens the source viewer drawer with the quoted passage highlighted.
- **Compliance benefit:** every claim in a saved insight is traceable to a source.

#### Output language
- **`output_language`** is an explicit column.
- Decided at generation time in the wizard, defaulting to workspace's `default_output_language` (KO).
- **Email draft is independent** — own `language` field.
- **Re-translation = re-generation** (engine call), not a translation pass — keeps quality high.

### 5.4 Integrity rules (non-negotiable)

- Every `brief` and `insight` MUST have a `kee_id` (NOT NULL).
- Every record has `workspace_id` (NOT NULL).
- `kee.name_normalized` is `lower(trim(name))` enforced via generated column.
- Soft delete via `deleted_at` on user-facing records; audit log never deleted.
- `signal_taxonomy.tag` is the PK; `kee_signal.signal_tag` references it (FK). New signals can't appear without taxonomy entry.
- Row-level security (RLS) policies on all customer-data tables — workspace isolation enforced at DB layer.

---

## 6. Data Flow

Both workflows share the same engine interface skeleton:

```
[user] → [web app] → [presigned S3] → [ingestion worker] → [normalized text]
                                                                  │
                                                                  ▼
                                                          [Insight Engine]
                                                                  │
                                                                  ▼
                                                       [structured output + confidence + source_refs]
                                                                  │
                                                  ┌───────────────┴───────────────┐
                                                  ▼                               ▼
                                          [draft record in DB]              [SSE stream → UI]
                                                  │
                                                  ▼ (on user "Save")
                                          [saved record + audit + signal denorm]
```

### 6.1 Pre-visit Brief flow

**Step 1 (KEE):** type-ahead resolver picks existing or creates new (name + institution required).

**Step 2 (Sources, async ingestion):**
- PDF: presigned S3 upload → POST /sources → enqueue ingest-pdf job → worker parses → source.normalized_text populated → "Ready" badge in UI.
- URL: POST /sources with URL → enqueue url-fetch job → worker uses JSDOM + Readability → "Ready".
- Web app polls `/jobs/:id` or subscribes via SSE.

**Step 3 (Generate, engine streaming):**
- `POST /generate/pre-visit-brief { kee_id, source_ids, output_language }` → `{ job_id }`.
- Web app opens SSE on `/jobs/:id`.
- Engine: hydrate context → build prompt → stream Claude → validate schema → self-rate confidence → attach source_refs → INSERT brief (status=draft).
- UI renders tokens live, then transitions to structured cards.

**Step 4 (Review & Save):**
- Per-field edits PATCH the record; auto-save draft on blur.
- "Save to KEE Record" → status = saved + audit log entry. Pre-visit briefs do NOT contribute to `kee_signal` (briefs are forward-looking, not observation-based).

### 6.2 Post-visit Insight flow

**Step 1 (KEE + Notes):**
- Text path: textarea, sent inline with generate request — no source record.
- Audio path: S3 presigned upload → source record (type=audio) → enqueue transcribe-audio job → Whisper API → normalized_text populated.

**Step 2 (Generate):** same shape as pre-visit, different endpoint and 8-field output schema.

**Step 3 (Review & Save) — the v2-seeding moment:**
```
BEGIN TRANSACTION
  UPDATE insights SET status='saved', updated_at=now() WHERE id=X
  INSERT INTO audit_log (action='insight.saved', target=X, ...)
  FOR each signal IN insight.kee_signals:
    INSERT INTO kee_signal (kee_id, workspace_id, signal_tag,
                             confidence, source_insight_id, created_at)
COMMIT
```

**Why a transaction:** if signals fail to denormalize, the v2 dashboard becomes inconsistent. All-or-nothing.

**Why append-only on edit:** if MSL later edits a saved insight's signals, INSERT new rows with later `created_at`; never UPDATE existing. Dashboard reads "latest signal per insight."

### 6.3 Cross-cutting

**Job lifecycle:** `queued → processing → streaming → complete | failed`. Telemetry in `job.metadata`.

**Audit log triggers (synchronous, non-degradable):**

| Event | Action |
|---|---|
| `source.created` | Web app POST /sources |
| `brief.created` / `brief.saved` / `brief.edited` | Engine + Web app |
| `insight.created` / `insight.saved` / `insight.edited` | Engine + Web app + signal denorm |
| `kee.created` | KEE service (MVP) |
| `kee.merged` | KEE service (deferred to v2 dedup admin tool) |
| `output.exported` | Web app event |

**Streaming UX contract:**
- Token events — partial generation, rendered live.
- State events — pipeline phase: `parsing_sources` · `generating` · `validating` · `rating_confidence` · `attaching_refs` · `done` · `failed`.

---

## 7. Insight Engine Internals

### 7.1 Pipeline (every generation request)

```
1. Validate input          (Zod schema on the API request)
2. Hydrate context         (fetch sources, KEE record, recent signals, taxonomy)
3. Construct prompt        (system + oncology layer + user)
4. Call primary model      (Claude Sonnet, streaming)
5. Parse + validate output (Zod schema on the JSON return)
6. Self-rate confidence    (second pass — Claude Haiku rates each field)
7. Attach source_refs      (post-hoc match output spans → source spans)
8. Persist draft           (INSERT brief/insight, status='draft')
9. Emit done event         (SSE → web app)
```

### 7.2 Three-layer prompt architecture

```
SYSTEM PROMPT (versioned, stable)
  • Persona: medical intelligence analyst supporting MSLs
  • Output contract: schema + JSON-only
  • Faithfulness rule: only claims supported by sources
  • Cross-language directive (KO/EN)
  • Refusal cases: PHI handling, off-label promotion

ONCOLOGY LAYER (TA-specific, swappable)
  • KEE signal taxonomy (KO/EN names + definitions)
  • Line of therapy framing (1L/2L/3L)
  • Subgroup interpretation (Asia vs Western, biomarker)
  • Common comparator regimens
  • Suggested-question templates per discussion type

USER PROMPT (per-request, dynamic)
  • Workflow type
  • KEE context (last 3-5 saved-insight summaries)
  • Source content (numbered, with type/lang/title metadata)
  • Target output_language
  • Explicit output schema for the workflow's fields
```

**Why three layers:** Anthropic prompt cache makes the stable layers cheap on repeat calls; only user prompt changes per request. ~60-80% cost reduction at scale.

### 7.3 Model routing

| Task | Model | Why |
|---|---|---|
| Pre-visit brief generation | Claude Sonnet | Long context, KO/EN, strong reasoning |
| Post-visit insight generation | Claude Sonnet | Same |
| Confidence self-rating | Claude Haiku | Simple rating task; cost optimization |
| Audio transcription | Whisper API | Industry standard, KO/EN auto-detect |
| (v2) Keyword extraction at scale | Claude Haiku | Cost optimization |

Routing decision is **at the prompt-template level**, not per-request.

### 7.4 Output schema validation

Each workflow has a Zod schema. Example (post-visit, abbreviated):

```typescript
const PostVisitInsightOutput = z.object({
  headline_insight: ConfidentText,
  summary:          ConfidentText,
  keywords:         z.array(z.string()).max(15),
  discussion_points: z.array(ConfidentText.extend({
    source_ref_ids: z.array(z.string()).optional()
  })),
  action_items: z.array(z.object({
    text: z.string(),
    due_date: z.string().date().optional(),
    confidence: z.number().min(0).max(1)
  })),
  internal_sharing_summary: z.object({
    medical: z.string(),
    commercial: z.string(),
    market_access: z.string()
  }),
  kee_signals: z.array(z.object({
    tag: z.enum(SIGNAL_TAGS),    // taxonomy-enforced
    confidence: z.number().min(0).max(1)
  })),
  email_draft: z.object({
    subject: z.string(),
    to: z.string().optional(),
    body: z.string(),
    language: z.enum(['ko','en'])
  })
});
```

**Validation failure handling — bounded retry:**
- Attempt 1 invalid → re-call with error feedback ("Your previous response failed validation: \<error\>. Re-emit valid JSON only.")
- Attempt 2 fails → return partial parsed structure with `validation_warning` field; never fabricate fields.

**Schema-enforced KEE signal tags** (`z.enum(SIGNAL_TAGS)`) — Claude can't invent new signals.

### 7.5 Confidence scoring (self-rating pass)

```
Step 1 (Sonnet): Generate structured output
                                ▼
Step 2 (Haiku):  For each field, given:
                   - the generated text
                   - the source materials
                 Rate "how well-supported is this claim by the sources?"
                 on a 0–1 scale.
```

**Calibration:** quarterly run against held-out eval set with human-labeled ground-truth confidences.

### 7.6 Source reference attachment (post-hoc)

After generation, for each generative field:
1. Split into sentences/clauses.
2. Generate embedding for each clause (small model — e.g., `text-embedding-3-small`).
3. Search source's pre-computed sentence embeddings (cached on `source.embeddings`) for top-K matches.
4. If max similarity > threshold (0.78 tuned): attach `source_ref_id` with locator + quoted_text.

**Why post-hoc, not asked of the model:**
- Asking the model to cite during generation degrades output quality.
- Embedding-based retrieval is deterministic, fast, and falsifiable.

### 7.7 Cross-language reasoning

Three real scenarios in MVP:

| Sources | Notes | Target | Frequency |
|---|---|---|---|
| EN | KO | KO | most common |
| EN | EN | EN | global team use |
| KO | KO | KO | less common |

**System prompt directive:** "Sources may be in any of [English, Korean]. Generate output in `{output_language}` only. Preserve technical terms in their canonical form: drug names, study names, gene/biomarker names stay as-is. Translate scientific *concepts* and *narrative*, never the technical lexicon."

**Eval set covers all three pairs.** Translation drift is measured via term preservation (drug names unchanged), numeric fidelity (HR, p-values, percentages preserved), tone consistency (formal Korean register).

### 7.8 Streaming

- Anthropic SDK streams tokens.
- Engine wraps the stream as SSE events (`token`, `state`, `error`).
- After `done`: web app refetches canonical record.

### 7.9 Prompt versioning

- Prompts in code:
  ```
  src/engine/prompts/
    ├── v1/
    │   ├── system.ko.md
    │   ├── system.en.md
    │   ├── oncology-layer.md
    │   ├── pre-visit-user.md
    │   └── post-visit-user.md
    └── v2/...
  ```
- Each generation records `prompt_version` in the resulting record.
- Old records never auto-regenerated.
- PR-time eval suite blocks regression > 5% on key metrics.

### 7.10 Observability

Every engine call captures into `job.metadata`:
- `prompt_version` · `model` · `input_tokens` · `output_tokens` · `cache_read_tokens` · `cache_write_tokens` · `ttft_ms` · `total_ms`
- `validation_pass` · `validation_retries`
- `confidence_min` · `confidence_mean`
- `source_ref_coverage` (% of clauses with refs)
- `self_rating_cost_usd`

---

## 8. UX Flows

### 8.1 Validated artifacts

| Surface | Mockup | Notes |
|---|---|---|
| Pre-visit Brief — Step 4 | `web/mockups/pre-visit-brief.html` | 5 output cards, sticky action bar |
| Post-visit Insight — Step 3 | `web/mockups/post-visit-insight.html` | 8 fields, KEE signal badges, email draft |
| Library + Right-rail Drawer | `web/mockups/library-drawer.html` | Filtered table + drawer |

Live at https://mednote-ai-gamma.vercel.app

### 8.2 Wizard state machines

**Pre-visit (4 steps, linear with backward navigation):**
```
[1: KEE] → [2: Sources] → [3: Generate] → [4: Review] → [Saved]
```

**Post-visit (3 steps):**
```
[1: KEE & Notes] → [2: Generate] → [3: Review] → [Saved]
```
- Step 1 has tabbed input: `[ Text | Audio ]` — switching preserves state per tab.

### 8.3 Async state UX

| State | UI treatment | Engine event |
|---|---|---|
| Idle | placeholder | none |
| Processing | inline spinner + estimated time + cancel | job: `processing` |
| Streaming | tokens render progressively | SSE: `token` |
| Complete | structured cards render | SSE: `done` |
| Failed | inline red banner + retry + detail | SSE: `error` |

**Cross-screen navigation rule:** users can leave the wizard mid-process. Job continues server-side; toast + dock badge on completion. On return, wizard rehydrates from job state.

### 8.4 KEE resolver — type-ahead

```
User types: "김민"
                              ▼
        ┌─────────────────────────────────────────────┐
        │ ✓ Use existing                              │
        │   • Dr. 김민준 — 서울아산병원 종양내과      │
        │   • Dr. 김민서 — 삼성서울병원 혈액종양내과  │
        ├─────────────────────────────────────────────┤
        │ + Create new KEE: "김민..."                 │
        │   (will prompt for institution)             │
        └─────────────────────────────────────────────┘
```

- Debounced 250ms.
- Trigram fuzzy match on `name` + exact prefix on `name_normalized`; existing wins by default if similarity > 0.85.

### 8.5 Editable output cards

- Hover: card border lightens, "Regenerate" + "Copy" buttons fade in.
- Click editable area: contenteditable region; Esc cancels, Cmd+Enter saves.
- Blur with changes: auto-save draft (debounced 1s).
- Per-field "Regenerate": popover confirm.

### 8.6 Source ref interaction

- Subtle superscripts: `…in 2L NSCLC patients¹.`
- Click → source viewer drawer:
  - PDF: rendered page with highlighted span
  - URL: rendered page with selector highlighted
  - Audio: waveform timeline + playback at timestamp range + transcript view

### 8.7 Library drawer invariants

- Single source of truth: drawer renders the same component used in wizard Step 4.
- Selection is local state, no URL change.
- Keyboard: `j`/`k` row selection; `Enter` opens; `Esc` closes.

### 8.8 Empty / error states

| State | Treatment |
|---|---|
| Workspace zero items | "Start with your first KEE meeting prep" + 2 CTAs |
| KEE no interactions | "No interactions yet for this KEE" |
| Library filtered to empty | "No items match" + reset button |
| Source ingest failed | Inline red row + "Retry" / "Replace" / "Remove" |
| Engine generation failed | Wizard stays on Generate; banner + retry |
| Audio > 25min | Pre-upload validation; suggest splitting |
| Aggregate confidence < 0.5 | Top-of-Review amber banner |

### 8.9 Mobile evolution (Phase 2)

3 screens, capture-only:
1. **"Just met with…"** — KEE picker + record/text + async server processing + notification.
2. **"Today's prep"** — read-only briefs.
3. **"KEE quick view"** — read-only summary + last 3 interactions.

Mobile = thin client over the same Insight Engine.

---

## 9. Error Handling & AI Quality

### 9.1 Two error categories

| Category | Examples | Handling philosophy |
|---|---|---|
| **System errors** | API outages, network drops, DB deadlocks | Retry → fallback → fail-loud |
| **AI quality errors** | Hallucinations, schema violations, low confidence | Multi-layer defense → flag → defer to human |

### 9.2 System error matrix

| Failure | Handling |
|---|---|
| Anthropic 429/5xx | Exponential backoff (1s · 2s · 4s · 8s), max 4 attempts; mark job retryable |
| Whisper failure | Source `failed`; user retries |
| S3 upload failure | Refresh presigned URL; retry once |
| PDF parse exception | Source `failed`; user replaces |
| URL fetch 4xx/5xx | Source `failed` with reason; user provides alternate |
| Mid-stream SSE drop | Job `failed`; partial NOT persisted; user retries (no resume MVP) |
| DB transaction error | Single retry; surface generic error |
| Engine process OOM | Reject at ingestion: source > 200K chars OR audio > 25min |
| Audit log write fails | **ROLLS BACK action**; user sees "Service degraded, retry shortly" |

### 9.3 AI quality — four-layer defense

```
1. Schema validation     (Zod-enforced structure)
2. Confidence rating     (separate Haiku pass)
3. Source-ref coverage   (% of clauses with refs)
4. Content safety scan   (PHI, off-label, regulatory)
```

### 9.4 Hallucination defense (the highest-risk failure)

Layered:
1. System prompt: "Only state claims supported by sources. If sources do not address a question, write 'Sources do not specify' rather than infer."
2. Schema enforcement with explicit "leave empty if unsupported."
3. Source-ref coverage flags ungrounded clauses.
4. Self-rating assigns low confidence to ungrounded claims.
5. Quarterly adversarial eval.

**Quantitative target:** hallucination rate < 2% on labeled eval set, per prompt version.

### 9.5 Graceful degradation

| Service down | Engine behavior | User sees |
|---|---|---|
| Confidence rating model | `confidence: null` | "—" badges; "Confidence scoring unavailable" hint |
| Embeddings service | `source_refs: []` | "Source references unavailable for this generation" |
| Notification service | Toast still shown if user on screen | No dock badge |
| Audit log | **ROLLS BACK** — non-degradable | "Service degraded, retry shortly" |

### 9.6 Regeneration as universal recovery

| Trigger | Scope | Cost |
|---|---|---|
| Per-field "Regenerate" | One field | ~10% of full |
| Whole-output "Regenerate all" | Full re-run | Full |
| (v2) "Regenerate with notes" | With steering hint | Full |

### 9.7 SLOs (operational targets)

- Engine generation success > 99%
- Schema validation first-pass > 95%
- TTFT P95 < 2s
- Total generation P95 < 25s (post-visit), < 35s (pre-visit)
- Source ingestion success > 98%
- Audit log write success > 99.99%

### 9.8 Cost runaway protection

Per-workspace daily generation budget — defaults to **100 generations/day** for MVP. Threshold hit → 429 + UI banner. Admin override allowed (audit logged).

---

## 10. Testing Strategy

### 10.1 Test pyramid + AI evals

```
                    ▲
                    │      E2E (Playwright)            ~20 tests
                    │
                    │  Integration tests              ~150 tests
                    │
                    │      Unit tests                 ~600 tests
                    │
                    │  AI Evaluation Suites           5 suites
                    ▼
```

### 10.2 AI evaluation suites

| Suite | Purpose | Target |
|---|---|---|
| **A. Faithfulness** | Hallucination defense — claim grounding | < 2% per prompt version |
| **B. Schema validity** | First-pass JSON validity | > 95% |
| **C. Cross-language preservation** | Drug names, numerics, study names, tone | Drug ≥ 99%, numeric ≥ 99.5%, study ≥ 99%, tone ≥ 95% |
| **D. KEE Signal precision/recall** | Catches taxonomy drift | precision ≥ 0.85, recall ≥ 0.75 |
| **E. Adversarial** | Anti-hallucination on tricky inputs | Quarterly review |

### 10.3 Schema & contract tests

- Zod schema as source of truth for engine API.
- Web app uses generated TypeScript types from schema.
- Contract tests in CI: web app's mocked engine responses validated against engine schema.

### 10.4 Compliance integrity tests

| Test | Verifies |
|---|---|
| Audit log completeness | Every state-changing action produces a log entry (mutation tests) |
| Audit log integrity | Append-only; UPDATE/DELETE blocked at DB level |
| KEE signal denorm consistency | After save, signal row count matches |
| Workspace isolation | Cross-workspace queries return empty |
| Source residency | Uploads in ap-northeast-2 only |
| Output traceability | source_refs reference valid sources |

### 10.5 Performance tests

Pre-MVP baselines (staging):
- Brief generation P95: ≤ 35s
- Insight generation P95: ≤ 25s
- Audio (5min) transcription P95: ≤ 30s
- PDF (20 pages) parse P95: ≤ 8s

Load: 50 concurrent users, mixed workloads, 5-min soak. Run weekly.

### 10.6 CI pipeline gates

```
Lint + type check → Unit → Integration (testcontainers) → Schema/contract
  → AI evals (if prompts changed; capped $5/run)
  → Compliance integrity → E2E (staging) → Mergeable
```

---

## 11. Compliance, Security & Phasing

### 11.1 Compliance posture

| Standard | Posture |
|---|---|
| **Korean PIPA** | First-class from day one |
| **GDPR-ready** | Architecture-compatible; formal cert deferred |
| **SOC 2 Type II** | Target after first pilot signs |
| **HIPAA** | Not in scope |
| **HITRUST** | Not in scope |

Data classification: *commercially sensitive scientific dialogue* — closer to "high-trust commercial" than "patient health record."

### 11.2 Authentication & Authorization

**MVP auth:** email + magic-link only (no passwords). Magic-link tokens are signed JWTs with 15-minute expiry, single-use, IP-bound. Session: HttpOnly cookie, 30-day refresh, 8-hour idle timeout. **Magic-link request throttling:** 5 requests / 15min per IP + per email to prevent abuse.

**Authorization:** workspace-scoped queries enforced at SQL level via PostgreSQL row-level security (RLS) policies. Two roles: `admin` (workspace creator) and `member`.

### 11.3 Encryption

| Layer | Algorithm | Key management |
|---|---|---|
| In transit | TLS 1.3 | Vercel + ACM |
| Postgres at rest | AES-256 | AWS KMS |
| S3 at rest | SSE-S3 | AWS KMS |
| Redis at rest | AES-256 | AWS KMS |
| Backups | AES-256 | Separate KMS key |

Secrets: AWS Secrets Manager. Rotated quarterly. Service-to-service auth via IAM roles.

### 11.4 Provider data agreements

| Provider | Agreement | Data flow |
|---|---|---|
| Anthropic | Enterprise: no training, 30-day abuse retention | Customer text → US |
| OpenAI Whisper | API plan with data-use opt-out | Customer audio → US |
| AWS | BAA-equivalent | All other data, ap-northeast-2 |
| Vercel | Standard SLA | Static assets only |

PIPA cross-border transfer disclosure at onboarding.

### 11.5 PII / PHI handling

- **PII:** KEE name, institution, MSL email, IP/UA in audit log.
- **PHI:** not expected; if incidental, Layer 4 content safety scan flags.
- Audit log entries do **not** include input/output content — only action + target + metadata.

### 11.6 Data residency & retention

| Data class | Hot | Archive | Total |
|---|---|---|---|
| Saved briefs / insights | Indefinite | — | Until deletion |
| Drafts | 90 days | — | 90 days |
| Source files | 90 days S3 | Glacier 7y | 7 years |
| Source normalized text | Indefinite | — | Linked |
| Audit log | 1 year | 6 years | 7 years |
| Job records | 90 days | — | 90 days |
| App logs | 90 days | 1 year | ~1 year |

**Workspace deletion:** 30-day soft-delete window; then hard-delete (audit log anonymized but retained 7 years).

### 11.7 Network security

- Web app (Vercel public): WAF + rate limit (100 rpm/IP); OWASP Top 10.
- Engine API: private; reachable only from Vercel egress IPs (allow-list) + admin VPN.
- Workers, RDS, Redis: private subnets.
- DDoS: Vercel edge + AWS Shield Standard.

### 11.8 Phasing — 12-week MVP plan

```
WEEK   PHASE                                      DELIVERABLE
─────  ─────────────────────────────────────────  ──────────────────────────────────────────
1-2    Phase 0 — Foundation                       Workspace bootstrapping, audit log,
                                                  AWS Seoul stack, CI/CD, magic-link auth
3-5    Phase 1 — Engine core                      Engine service skeleton + Anthropic +
                                                  Whisper + Zod schemas + 3-layer prompts +
                                                  self-rating + source_refs + eval scaffold
6-8    Phase 2 — Workflows                        Pre-visit + post-visit wizards end-to-end,
                                                  KEE resolver, Library + drawer,
                                                  signal denormalization transaction
9-10   Phase 3 — Quality & polish                 Real medical eval set, adversarial cases,
                                                  perf tuning, compliance integrity tests,
                                                  error handling completeness
11-12  Phase 4 — Pilot prep                       Onboarding flow, admin tools, monitoring
                                                  dashboards, pilot documentation, soak test
```

#### Phase acceptance criteria

| Phase | Gate |
|---|---|
| 0 → 1 | Auth + audit log working in staging; CI green; data residency verified |
| 1 → 2 | Engine generates valid 5-field brief and 8-field insight on synthetic data; eval suites green |
| 2 → 3 | Both wizards functional end-to-end on staging; signal denorm transactional; UI matches mockups |
| 3 → 4 | All 5 eval suites passing thresholds; perf SLOs met; compliance integrity tests passing |
| 4 → Pilot | First customer workspace onboarded; SLOs measured 7 days; SOC 2 readiness assessment passed |

#### Cross-cutting work (every phase)

- Documentation alongside code
- Eval set growth — 5-10 cases/week from real or synthetic data
- Cost tracking dashboards updated as new prompts ship

### 11.9 Resource shape (rough sizing)

For 12-week MVP:
- 2 engineers (1 full-stack lead, 1 backend/AI focus)
- 1 designer (part-time)
- 1 medical content reviewer (part-time, eval labeling, oncology layer)
- 1 PM/founder

---

## Appendix A: Decision Log

Every locked decision with rationale, in chronological order:

1. **MVP wedge = pre-visit + post-visit insight generation.** Fast time-to-value; demo-able transformation; seeds v2 KEE intelligence data layer.
2. **Standalone web app form factor.** Speed; clarity; no enterprise integration cost.
3. **Inputs: PDF + URL + text + audio (Whisper-class).** All inputs normalize to text; future modalities add cleanly.
4. **Output schemas: 5-field pre-visit, 8-field post-visit.** 8 fields include Internal Sharing Summary, KEE Signal, Follow-up Email Draft.
5. **Output destination: in-app review/edit/save + copy-as-markdown.** Defer Word/PDF export.
6. **Outputs editable always.** "AI drafts → MSL refines → saved" is the data flywheel.
7. **KEE association: hybrid create-on-the-fly + structured records.** Type-ahead resolver. Avoid free-text-only fields.
8. **One KEE per output; pre-visit always tied to a KEE.**
9. **Workspace-of-one hybrid.** Workspace is the unit of intelligence.
10. **Korean ↔ English cross-language reasoning.** Default output language KO, per-output override.
11. **Multi-model: Claude Sonnet (reasoning) + Whisper (audio) + Haiku (self-rating).**
12. **Pharma-grade SaaS posture.** AWS Seoul, no training on customer data, PIPA-compliant. Defer SOC 2 to post-pilot, on-prem to enterprise tier.
13. **Generalist engine + oncology-grade layer at launch.** "Oncology-grade intelligence on top of a generalist engine."
14. **Engine-centric architecture.** Insight Engine as durable core; web/mobile as thin clients.
15. **Three component services in MVP.** Web app, Insight Engine, Ingestion workers.
16. **Confidence per output field** (separate Haiku self-rating pass).
17. **Source traceability** via post-hoc embedding-based attachment.
18. **Output language as explicit column.** Re-translation = re-generation, not translation.
19. **Three-layer prompt architecture** (system → oncology → user). Prompt cache benefits.
20. **Schema-enforced KEE signal tags.** Claude can't invent new signals.
21. **kee_signal as denormalized append-only fact table.** v2 dashboard fuel.
22. **Audit log is the only non-degradable subsystem.**
23. **Hallucination rate < 2%** on labeled eval set, per prompt version.
24. **Daily 100 generations/workspace cap.** Cost runaway protection.
25. **AI eval suite as CI gate** on prompt PRs ($5/run cap).
26. **Compliance integrity tests** as a separate test layer.
27. **5 AI eval suites** (Faithfulness, Schema, Cross-language, KEE Signal, Adversarial).
28. **12-week phasing** (Foundation → Engine → Workflows → Quality → Pilot prep).

---

## Appendix B: Glossary

| Term | Meaning |
|---|---|
| **MSL** | Medical Science Liaison — pharma scientific expert engaging KEEs |
| **KEE** | Key External Expert (a.k.a. KOL — Key Opinion Leader) |
| **TA** | Therapeutic Area (oncology, immunology, rare disease, etc.) |
| **NGS** | Next-Generation Sequencing |
| **2L** | Second-line treatment |
| **PIPA** | Korean Personal Information Protection Act (개인정보보호법) |
| **TTFT** | Time-to-first-token (streaming latency metric) |
| **RWD** | Real-world data |
| **SLO** | Service Level Objective |
| **RLS** | Row-Level Security (Postgres) |

---

*End of design specification.*
