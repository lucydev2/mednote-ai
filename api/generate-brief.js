import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// ─── System prompt — pre-visit brief, forward-looking, strict grounding ─

const SYSTEM_PROMPT = `You are a Medical Field Intelligence analyst supporting Medical Science Liaisons (MSLs) in pharma and biotech.

Your job: read scientific source materials (papers, journal articles, abstracts, slides) and produce a structured PRE-VISIT BRIEF that helps the MSL prepare for an upcoming meeting with a KEE (Key External Expert, oncology-focused).

# CRITICAL: BRIEF ≠ INSIGHT

A pre-visit brief is FORWARD-LOOKING preparation, not a recap of a past meeting. Therefore:
- The KEE's actual opinions are UNKNOWN — do NOT speculate about them.
- All content must come from the source materials provided, not from any conversation.
- Output is what to DISCUSS, what to ASK, what concerns to ANTICIPATE based on the source data — never what the KEE "said" or "thinks".

# GROUNDING RULES (STRICT — non-negotiable)

1. Use ONLY information explicitly present in the source material. NO external knowledge. NO generalizations beyond what the sources state.
2. NO sample, template, mockup, or example content. Every sentence must come from the provided sources.
3. Every output field must map to specific source content; reject generic / boilerplate text.
4. NEVER fabricate to fill gaps. If the sources are silent on a field, leave it shorter or empty.

# INSUFFICIENT INFORMATION PATH (hard refusal)

Trigger insufficient_information=true when:
- Input is empty, off-topic for medical KEE prep, or < ~200 chars of substantive content
- Sources don't contain enough scientific content to anchor a brief

When triggered:
- confidence_level: 'low'
- insufficient_information: true
- headline: 'Insufficient information'
- scientific_context sub-sections: ''
- All arrays empty

# OUTPUT LANGUAGE

Generate in the requested output language (Korean by default). PRESERVE in original form:
- Drug names (KRAS G12C, sotorasib, osimertinib, amivantamab, lazertinib, etc.)
- Study names (MARIPOSA, FLAURA-2, CodeBreaK, KEYNOTE, etc.)
- Gene / biomarker names (EGFR, MET, KRAS, ALK, ROS1, PD-L1, etc.)

Translate scientific concepts and narrative; never the technical lexicon.

# FIELDS

- **headline** (6-10 words): A SHORT, descriptive title for the brief — suitable for a library list. Should evoke the topic and the discussion framing. Example: "EGFR 변이 NSCLC post-osi 치료 옵션 prep". NOT a full sentence; NOT just a drug name.

- **scientific_context** (3 structured sub-sections, 4-7 sentences total):
  - **overview** (1-2 sentences): Topic framing — what condition / treatment / population the sources discuss.
  - **key_findings** (2-3 sentences): Major data points from the sources. Bold drug/study names with **markdown**.
  - **open_questions** (1-2 sentences): Unresolved or controversial elements explicit in the sources.

- **key_topics** (3-5 items): Discussion topics to bring up with the KEE — derived from what the sources cover. Each item is one short bullet.

- **suggested_questions** (4-6 items): Open-ended, clinically meaningful questions to ASK the KEE. Each must be answerable based on sources you provided (not asking for opinions on data the KEE hasn't seen).

- **discussion_strategy** (3-5 items): How to frame / sequence the conversation, what to lead with, what to follow up on. Tactical guidance.

- **anticipated_concerns** (2-4 items): Likely pushback the KEE may raise based on weaknesses or limitations IN THE SOURCES (e.g., small subgroup data, regional applicability, AE profile). Each starts with a short bold tag like **AE 관리 부담:** or **데이터 일반화:** then 1 sentence.

# CONFIDENCE

- confidence_level: 'high' | 'medium' | 'low' — based on source adequacy and grounding strength.
- Per-field confidence (0-1): how directly that text is grounded in the sources.

Return ONLY valid JSON matching the schema. No prose, no preamble, no code fences.`;

// ─── Schema ─────────────────────────────────────────────────────────

const ConfidentText = (description) => ({
  type: SchemaType.OBJECT,
  required: ['text', 'confidence'],
  properties: {
    text: { type: SchemaType.STRING, description },
    confidence: { type: SchemaType.NUMBER }
  }
});

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  required: [
    'confidence_level',
    'insufficient_information',
    'headline',
    'scientific_context',
    'key_topics',
    'suggested_questions',
    'discussion_strategy',
    'anticipated_concerns'
  ],
  properties: {
    confidence_level: { type: SchemaType.STRING, enum: ['high', 'medium', 'low'] },
    insufficient_information: { type: SchemaType.BOOLEAN },
    headline: {
      type: SchemaType.STRING,
      description: '6-10 word short title for the brief, suitable for a library list.'
    },
    scientific_context: {
      type: SchemaType.OBJECT,
      required: ['overview', 'key_findings', 'open_questions', 'confidence'],
      properties: {
        overview: { type: SchemaType.STRING, description: '1-2 sentences setting topic.' },
        key_findings: { type: SchemaType.STRING, description: '2-3 sentences of major data points with **bold** drug/study names.' },
        open_questions: { type: SchemaType.STRING, description: '1-2 sentences on unresolved elements.' },
        confidence: { type: SchemaType.NUMBER }
      }
    },
    key_topics: {
      type: SchemaType.ARRAY,
      items: ConfidentText('A discussion topic to bring up')
    },
    suggested_questions: {
      type: SchemaType.ARRAY,
      items: ConfidentText('A question to ask the KEE')
    },
    discussion_strategy: {
      type: SchemaType.ARRAY,
      items: ConfidentText('A strategy / sequencing tip')
    },
    anticipated_concerns: {
      type: SchemaType.ARRAY,
      items: ConfidentText('Anticipated KEE concern; format **Tag:** sentence.')
    }
  }
};

// ─── Vercel function ────────────────────────────────────────────────

export const config = { maxDuration: 60 };

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
  const kee_context = typeof body.kee_context === 'string' ? body.kee_context.trim() : '';

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
${kee_context ? `\nKEE context (FYI only — opinions still unknown): ${kee_context}\n` : ''}
--- SOURCE MATERIAL ---

${text}

--- END OF SOURCES ---

Produce the structured pre-visit brief as JSON per the schema.
Remember: this is FORWARD-LOOKING prep. Do not speculate about KEE opinions.
If sources cannot support reliable output, return the insufficient_information payload.`;

    const result = await model.generateContent(userMessage);
    const responseText = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Brief: Gemini response was not valid JSON:', responseText.slice(0, 500));
      return res.status(502).json({
        error: 'Model returned non-JSON output',
        raw_preview: responseText.slice(0, 500)
      });
    }

    if (parsed.insufficient_information) {
      if (parsed.scientific_context) {
        parsed.scientific_context.overview = '';
        parsed.scientific_context.key_findings = '';
        parsed.scientific_context.open_questions = '';
      }
      parsed.key_topics = [];
      parsed.suggested_questions = [];
      parsed.discussion_strategy = [];
      parsed.anticipated_concerns = [];
    }

    parsed._meta = {
      model: 'gemini-2.5-flash',
      input_chars: text.length,
      output_language,
      generated_at: new Date().toISOString(),
      schema_version: 1,
      type: 'brief'
    };

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Brief: Gemini API error:', err);
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
    headline: 'Insufficient information',
    scientific_context: { overview: '', key_findings: '', open_questions: '', confidence: 0 },
    key_topics: [],
    suggested_questions: [],
    discussion_strategy: [],
    anticipated_concerns: [],
    _meta: { model: 'short-circuit', input_chars: 0, reason: 'Input too short', schema_version: 1, type: 'brief' }
  };
}
