import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// ─── Constants from spec §7.x ───────────────────────────────────────

const SIGNAL_TAGS = [
  'efficacy-driven',
  'safety-cautious',
  'biomarker-focused',
  'regimen-conservative',
  'IO-combination-oriented',
  'real-world-data-sensitive',
  'data-skeptical',
  'reimbursement-focused'
];

// ─── System prompt — directly mirrors spec §7.2 grounding rules ─────

const SYSTEM_PROMPT = `You are a Medical Field Intelligence analyst supporting Medical Science Liaisons (MSLs) in pharma and biotech.

Your job: read MSL meeting notes or transcripts with KEEs (Key External Experts, oncology-focused) and produce a structured post-visit insight.

# GROUNDING RULES (STRICT — non-negotiable)

1. Use ONLY information explicitly present in the input text. NO external knowledge. NO inferences beyond input content. NO generalization beyond what the input states.
2. NO sample, template, mockup, or example content. Every sentence in every output field must come from the actual current input.
3. Every output field must map to specific input content; reject generic / boilerplate text.
4. For multi-speaker inputs (Participant 1, Participant 2, 화자 1, Speaker A, etc.):
   - INFER speaker roles from conversational context — not from labels alone.
   - The MSL typically asks questions, introduces data/papers, sets agenda, and prompts discussion.
   - The KEE typically provides clinical opinions, treatment-decision rationale, real-world practice insights, safety concerns, data interpretation, patient-selection criteria, and reimbursement/adoption barriers.
   - Prioritize likely-KEE statements as the source of insight. Treat likely-MSL statements as context only — do NOT extract KEE Signals from them.
   - If speaker roles are highly ambiguous: trigger the insufficient_information path with a clear note about role uncertainty.

# INSUFFICIENT INFORMATION PATH (hard refusal)

If the input is empty, off-topic for medical KEE discussion, contains less than ~100 characters of substantive content, or is too ambiguous to support reliable structured output, return:
- confidence_level: "low"
- insufficient_information: true
- headline_insight.text: "Insufficient information to generate a reliable summary."
- summary.text: "Insufficient information to generate a reliable summary."
- keywords: []
- discussion_points: []
- action_items: []
- internal_sharing_summary: { medical: "", commercial: "", market_access: "" }
- kee_signals: []
- email_draft: { subject: "", to: "", body: "", language: "ko" }

NEVER fabricate or fill gaps when the input doesn't support it. Refusing is the correct behavior.

# OUTPUT LANGUAGE

Generate text in the requested output language (Korean by default). PRESERVE in original/English form:
- Drug names: KRAS G12C, sotorasib, osimertinib, amivantamab, lazertinib, pembrolizumab, etc.
- Study names: MARIPOSA, FLAURA-2, CodeBreaK, KEYNOTE, etc.
- Gene / biomarker names: EGFR, MET, KRAS, ALK, ROS1, PD-L1, etc.

Translate scientific concepts and narrative — never the technical lexicon.

# KEE SIGNAL TAXONOMY

For \`kee_signals[].tag\`, choose ONLY from this list (no new tags):
- efficacy-driven
- safety-cautious
- biomarker-focused
- regimen-conservative
- IO-combination-oriented
- real-world-data-sensitive
- data-skeptical
- reimbursement-focused

Only attribute signals to the likely-KEE speaker(s). If you can't tell which speaker is the KEE, do NOT extract any KEE signals.

# CONFIDENCE FIELDS

- confidence_level (categorical, output-level): "high" | "medium" | "low" — based on input adequacy and grounding strength.
  - high: input clearly supports all generated fields
  - medium: input partially supports output; some fields may be thin
  - low: input is weak; consider returning insufficient_information=true instead
- Per-field \`confidence\` (numeric 0–1): how directly that specific text is grounded in the input.

# OUTPUT STRUCTURE

Return ONLY valid JSON matching the provided schema. No prose, no preamble, no code fences.`;

// ─── Response schema (Gemini structured output) ─────────────────────

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  required: [
    'confidence_level',
    'insufficient_information',
    'headline_insight',
    'summary',
    'keywords',
    'discussion_points',
    'action_items',
    'internal_sharing_summary',
    'kee_signals',
    'email_draft'
  ],
  properties: {
    confidence_level: {
      type: SchemaType.STRING,
      enum: ['high', 'medium', 'low'],
      description: 'Output-level categorical confidence based on input adequacy.'
    },
    insufficient_information: {
      type: SchemaType.BOOLEAN,
      description: 'True when input cannot support reliable output.'
    },
    headline_insight: {
      type: SchemaType.OBJECT,
      required: ['text', 'confidence'],
      properties: {
        text: { type: SchemaType.STRING },
        confidence: { type: SchemaType.NUMBER, description: '0 to 1' }
      }
    },
    summary: {
      type: SchemaType.OBJECT,
      required: ['text', 'confidence'],
      properties: {
        text: { type: SchemaType.STRING },
        confidence: { type: SchemaType.NUMBER }
      }
    },
    keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Up to 15 short keyword tags grounded in the input.'
    },
    discussion_points: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        required: ['text', 'confidence'],
        properties: {
          text: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER }
        }
      }
    },
    action_items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        required: ['text', 'confidence'],
        properties: {
          text: { type: SchemaType.STRING },
          due_date: {
            type: SchemaType.STRING,
            description: 'YYYY-MM-DD or empty string if not specified.'
          },
          confidence: { type: SchemaType.NUMBER }
        }
      }
    },
    internal_sharing_summary: {
      type: SchemaType.OBJECT,
      required: ['medical', 'commercial', 'market_access'],
      properties: {
        medical: { type: SchemaType.STRING, description: 'Empty string if not enough input.' },
        commercial: { type: SchemaType.STRING },
        market_access: { type: SchemaType.STRING }
      }
    },
    kee_signals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        required: ['tag', 'confidence'],
        properties: {
          tag: { type: SchemaType.STRING, enum: SIGNAL_TAGS },
          confidence: { type: SchemaType.NUMBER }
        }
      }
    },
    email_draft: {
      type: SchemaType.OBJECT,
      required: ['subject', 'body', 'language'],
      properties: {
        subject: { type: SchemaType.STRING },
        to: { type: SchemaType.STRING, description: 'KEE email address or empty string.' },
        body: { type: SchemaType.STRING },
        language: { type: SchemaType.STRING, enum: ['ko', 'en'] }
      }
    }
  }
};

// ─── Vercel function ────────────────────────────────────────────────

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  // CORS-safe headers (same-origin in production but useful for dev)
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not configured',
      hint: 'Add GEMINI_API_KEY in Vercel project settings → Environment Variables, then redeploy.'
    });
  }

  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const output_language = body.output_language === 'en' ? 'en' : 'ko';

  // Short-circuit: trivial input → insufficient_information without burning API call
  if (text.length < 10) {
    return res.status(200).json(insufficientInformationPayload());
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 8192
      }
    });

    const userMessage = `Output language: ${output_language}

--- INPUT TO ANALYZE ---

${text}

--- END OF INPUT ---

Produce the structured insight as JSON per the schema. If the input cannot support a reliable output, return the insufficient_information refusal payload exactly as specified.`;

    const result = await model.generateContent(userMessage);
    const responseText = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Gemini response was not valid JSON:', responseText.slice(0, 500));
      return res.status(502).json({
        error: 'Model returned non-JSON output',
        raw_preview: responseText.slice(0, 500)
      });
    }

    // Soft-validate the critical invariant from spec §5.3:
    // when insufficient_information=true, generative arrays must be empty.
    if (parsed.insufficient_information) {
      parsed.keywords = [];
      parsed.discussion_points = [];
      parsed.action_items = [];
      parsed.kee_signals = [];
      parsed.internal_sharing_summary = { medical: '', commercial: '', market_access: '' };
      if (parsed.email_draft) {
        parsed.email_draft.subject = '';
        parsed.email_draft.body = '';
      }
    }

    // Telemetry meta — useful for the UI debug panel
    parsed._meta = {
      model: 'gemini-2.5-flash',
      input_chars: text.length,
      output_language,
      generated_at: new Date().toISOString()
    };

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Gemini API error:', err);
    return res.status(500).json({
      error: err.message || 'Unknown error',
      type: err.constructor?.name || 'Error'
    });
  }
}

function insufficientInformationPayload() {
  return {
    confidence_level: 'low',
    insufficient_information: true,
    headline_insight: { text: 'Insufficient information to generate a reliable summary.', confidence: 0 },
    summary: { text: 'Insufficient information to generate a reliable summary.', confidence: 0 },
    keywords: [],
    discussion_points: [],
    action_items: [],
    internal_sharing_summary: { medical: '', commercial: '', market_access: '' },
    kee_signals: [],
    email_draft: { subject: '', to: '', body: '', language: 'ko' },
    _meta: {
      model: 'short-circuit',
      input_chars: 0,
      reason: 'Input too short (< 10 chars)'
    }
  };
}
