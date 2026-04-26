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

// ─── System prompt — strict grounding + structured output ───────────

const SYSTEM_PROMPT = `You are a Medical Field Intelligence analyst supporting Medical Science Liaisons (MSLs) in pharma and biotech.

Your job: read MSL meeting notes or transcripts with KEEs (Key External Experts, oncology-focused) and produce a structured post-visit insight that an MSL can hand directly to Medical Affairs as a discussion record.

# GROUNDING RULES (STRICT — non-negotiable)

1. Use ONLY information explicitly present in the input text. NO external knowledge. NO inferences beyond input content. NO generalization beyond what the input states.
2. NO sample, template, mockup, or example content. Every sentence in every output field must come from the actual current input.
3. Every output field must map to specific input content; reject generic / boilerplate text.
4. NEVER fabricate to fill gaps. If the input is silent on a field, leave that field empty / make the array shorter.

# SPEAKER AWARENESS (critical)

For multi-speaker inputs (Participant 1, Participant 2, 화자 1, Speaker A, P1, P2, etc.):
- INFER speaker roles from conversational context — labels alone are not meaningful.
- The MSL typically: asks questions, introduces papers/data, sets agenda, prompts discussion, requests clarification.
- The KEE typically: provides clinical opinions, treatment-decision rationale, real-world practice insights, safety concerns, data interpretation, patient-selection criteria, reimbursement/adoption barriers, decision-making language.
- Output MUST include the populated 'speaker_mapping' field for multi-speaker inputs.
- Insight extraction RULE: every sentence in headline_insight, summary, kee_signals, action_items, internal_sharing_summary MUST come from likely-KEE statements. MSL questions inform 'discussion_overview' (context only) but never appear as KEE positions.
- If ALL speakers are 'unclear' or majority are 'low' confidence: trigger insufficient_information=true with headline 'Speaker roles are unclear in the provided transcript. Please confirm which participant is the KEE.'

For single-speaker inputs (typed notes, individual voice memo, single MSL summary): return speaker_mapping: [] (empty array). Treat the input as KEE-attributed by the MSL author.

# INSUFFICIENT INFORMATION PATH (hard refusal)

Trigger insufficient_information=true when:
- Input is empty, off-topic for medical KEE discussion, or < ~100 chars of substantive content
- Input is too ambiguous to support reliable structured output
- Multi-speaker case with all speakers 'unclear'

When triggered, return:
- confidence_level: 'low'
- insufficient_information: true
- headline_insight.text: 'Insufficient information to generate a reliable summary.' (or speaker-specific message above)
- All summary sub-sections: ''
- All other generative arrays: []
- speaker_mapping: array of inferred speakers (still populate even if 'unclear', so MSL can correct)

# OUTPUT LANGUAGE

Generate text in the requested output language (Korean by default). PRESERVE in original/English form:
- Drug names: KRAS G12C, sotorasib, osimertinib, amivantamab, lazertinib, pembrolizumab, etc.
- Study names: MARIPOSA, FLAURA-2, CodeBreaK, KEYNOTE, etc.
- Gene / biomarker names: EGFR, MET, KRAS, ALK, ROS1, PD-L1, etc.

Translate scientific concepts and narrative — never the technical lexicon.

# SUMMARY STRUCTURE (CRITICAL — must be 5-10 sentences total, structured)

The 'summary' field is a 4-section STRUCTURED OBJECT, not a single paragraph:

- **discussion_overview** (1-2 sentences): Topic framing — what was discussed, why this meeting happened. May reference what the MSL introduced. This is the only section where MSL context appears.
- **key_kee_insights** (2-4 sentences): THE PRIMARY OUTPUT. The KEE's clinical opinions, treatment preferences, decision rationale, real-world practice notes. Use the KEE's actual reasoning. Bold key drug/study/biomarker names using **markdown**.
- **data_interpretation** (1-2 sentences): How the KEE evaluates data, evidence, studies cited. Their position on study quality, applicability, generalizability.
- **concerns_barriers** (1-2 sentences): Limitations, safety concerns, reimbursement/access barriers, adoption hurdles raised by the KEE.

Total length: 5-10 sentences. Professional medical tone, suitable for internal Medical Affairs sharing. Each sentence directly traceable to specific input content.

# KEE SIGNAL TAXONOMY

For 'kee_signals[].tag', choose ONLY from this list (no new tags):
- efficacy-driven
- safety-cautious
- biomarker-focused
- regimen-conservative
- IO-combination-oriented
- real-world-data-sensitive
- data-skeptical
- reimbursement-focused

Only attribute signals to verified-KEE statements. If you can't tell which speaker is the KEE, do NOT extract any KEE signals.

# CONFIDENCE FIELDS

- confidence_level (categorical, output-level): 'high' | 'medium' | 'low' — based on input adequacy + grounding strength.
- Per-field 'confidence' (numeric 0–1): how directly that specific text is grounded in the input.

# OUTPUT STRUCTURE

Return ONLY valid JSON matching the provided schema. No prose, no preamble, no code fences.`;

// ─── Response schema (Gemini structured output) ─────────────────────

const ConfidentText = (description) => ({
  type: SchemaType.OBJECT,
  required: ['text', 'confidence'],
  properties: {
    text: { type: SchemaType.STRING, description },
    confidence: { type: SchemaType.NUMBER, description: '0 to 1' }
  }
});

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  required: [
    'confidence_level',
    'insufficient_information',
    'headline_insight',
    'summary',
    'speaker_mapping',
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
      enum: ['high', 'medium', 'low']
    },
    insufficient_information: {
      type: SchemaType.BOOLEAN
    },
    headline_insight: ConfidentText('1-2 sentences capturing the most important KEE position'),
    summary: {
      type: SchemaType.OBJECT,
      required: ['discussion_overview', 'key_kee_insights', 'data_interpretation', 'concerns_barriers', 'confidence'],
      properties: {
        discussion_overview: {
          type: SchemaType.STRING,
          description: '1-2 sentences setting context (topic framing, who introduced what).'
        },
        key_kee_insights: {
          type: SchemaType.STRING,
          description: '2-4 sentences with the KEE\'s clinical opinions/decisions. PRIMARY section. Bold drug/study names using **markdown**.'
        },
        data_interpretation: {
          type: SchemaType.STRING,
          description: '1-2 sentences on how KEE interprets data/evidence/studies cited.'
        },
        concerns_barriers: {
          type: SchemaType.STRING,
          description: '1-2 sentences on limitations, safety concerns, reimbursement, adoption hurdles raised.'
        },
        confidence: { type: SchemaType.NUMBER }
      }
    },
    speaker_mapping: {
      type: SchemaType.ARRAY,
      description: 'Populate when input has anonymous labels (Participant N, Speaker N, 화자 N). Empty array [] for single-speaker text.',
      items: {
        type: SchemaType.OBJECT,
        required: ['label', 'role', 'confidence', 'rationale'],
        properties: {
          label: { type: SchemaType.STRING, description: 'e.g. "Participant 1"' },
          role: { type: SchemaType.STRING, enum: ['msl', 'kee', 'unclear'] },
          confidence: { type: SchemaType.STRING, enum: ['high', 'medium', 'low'] },
          rationale: { type: SchemaType.STRING, description: 'One short sentence explaining inference.' }
        }
      }
    },
    keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Up to 15 short keyword tags grounded in the input.'
    },
    discussion_points: {
      type: SchemaType.ARRAY,
      items: ConfidentText('A single discussion point grounded in input.')
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

Produce the structured insight as JSON per the schema. Remember:
- Summary must be a 4-section structured object (5-10 sentences total).
- Populate speaker_mapping if input has anonymous labels; otherwise empty array [].
- KEE signals only from verified-KEE statements.
- If input cannot support reliable output, return the insufficient_information refusal payload.`;

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

    // Soft-validate the insufficient_information invariant
    if (parsed.insufficient_information) {
      if (parsed.summary) {
        parsed.summary.discussion_overview = '';
        parsed.summary.key_kee_insights = '';
        parsed.summary.data_interpretation = '';
        parsed.summary.concerns_barriers = '';
      }
      parsed.keywords = [];
      parsed.discussion_points = [];
      parsed.action_items = [];
      parsed.kee_signals = [];
      parsed.internal_sharing_summary = { medical: '', commercial: '', market_access: '' };
      if (parsed.email_draft) {
        parsed.email_draft.subject = '';
        parsed.email_draft.body = '';
      }
      // keep speaker_mapping populated (so MSL can correct via UI)
    }

    parsed._meta = {
      model: 'gemini-2.5-flash',
      input_chars: text.length,
      output_language,
      generated_at: new Date().toISOString(),
      schema_version: 2
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
    summary: {
      discussion_overview: '',
      key_kee_insights: '',
      data_interpretation: '',
      concerns_barriers: '',
      confidence: 0
    },
    speaker_mapping: [],
    keywords: [],
    discussion_points: [],
    action_items: [],
    internal_sharing_summary: { medical: '', commercial: '', market_access: '' },
    kee_signals: [],
    email_draft: { subject: '', to: '', body: '', language: 'ko' },
    _meta: {
      model: 'short-circuit',
      input_chars: 0,
      reason: 'Input too short (< 10 chars)',
      schema_version: 2
    }
  };
}
