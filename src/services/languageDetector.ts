// Dynamic Multilingual & Language Detection Engine
// Detects languages from incoming user speech transcripts, audio features, and explicit voice commands.

export interface LanguageDetectionResult {
  language: string; // e.g. 'Spanish', 'French', 'English'
  code: string;     // e.g. 'es', 'fr', 'en'
  bcp47: string;    // e.g. 'es-ES', 'fr-FR', 'en-AU'
  isExplicit: boolean;
  confidence: number;
}

export const LANGUAGE_METADATA: Record<string, { name: string; code: string; bcp47: string; flag: string }> = {
  English: { name: 'English', code: 'en', bcp47: 'en-AU', flag: '🇦🇺' },
  Spanish: { name: 'Spanish', code: 'es', bcp47: 'es-ES', flag: '🇪🇸' },
  French: { name: 'French', code: 'fr', bcp47: 'fr-FR', flag: '🇫🇷' },
  German: { name: 'German', code: 'de', bcp47: 'de-DE', flag: '🇩🇪' },
  Hindi: { name: 'Hindi', code: 'hi', bcp47: 'hi-IN', flag: '🇮🇳' },
  Italian: { name: 'Italian', code: 'it', bcp47: 'it-IT', flag: '🇮🇹' },
  Portuguese: { name: 'Portuguese', code: 'pt', bcp47: 'pt-BR', flag: '🇧🇷' },
  Japanese: { name: 'Japanese', code: 'ja', bcp47: 'ja-JP', flag: '🇯🇵' },
  'Mandarin Chinese': { name: 'Mandarin Chinese', code: 'zh', bcp47: 'zh-CN', flag: '🇨🇳' },
  Arabic: { name: 'Arabic', code: 'ar', bcp47: 'ar-SA', flag: '🇸🇦' },
  Russian: { name: 'Russian', code: 'ru', bcp47: 'ru-RU', flag: '🇷🇺' },
};

const LANGUAGE_KEYWORD_ALIASES: Record<string, string> = {
  spanish: 'Spanish',
  espanol: 'Spanish',
  español: 'Spanish',
  castellano: 'Spanish',
  french: 'French',
  francais: 'French',
  français: 'French',
  german: 'German',
  deutsch: 'German',
  hindi: 'Hindi',
  hindustani: 'Hindi',
  italian: 'Italian',
  italiano: 'Italian',
  portuguese: 'Portuguese',
  portugues: 'Portuguese',
  português: 'Portuguese',
  japanese: 'Japanese',
  nihongo: 'Japanese',
  chinese: 'Mandarin Chinese',
  mandarin: 'Mandarin Chinese',
  putonghua: 'Mandarin Chinese',
  arabic: 'Arabic',
  arabiya: 'Arabic',
  russian: 'Russian',
  russki: 'Russian',
  english: 'English',
  ingles: 'English',
  inglés: 'English',
  anglais: 'English',
  englisch: 'English',
};

const VOCAB_PATTERNS: Array<{ language: string; regex: RegExp; weight: number }> = [
  // Spanish
  {
    language: 'Spanish',
    regex: /\b(hola|cómo estás|como estas|qué tal|que tal|amigo|amiga|gracias|por favor|buenas tardes|buenos días|buenas noches|claro|sí|no puedo|ayuda|hablar|amigos|hasta luego|mucho gusto|bienvenido|por supuesto)\b/i,
    weight: 1.0,
  },
  // French
  {
    language: 'French',
    regex: /\b(bonjour|salut|comment allez-vous|comment vas-tu|ça va|ca va|merci|beaucoup|s'il vous plaît|sil vous plait|au revoir|oui|non|d'accord|très bien|enchanté|bonne journée|s'il te plaît)\b/i,
    weight: 1.0,
  },
  // German
  {
    language: 'German',
    regex: /\b(hallo|guten tag|guten morgen|guten abend|wie geht's|wie gehts|danke|bitte|tschüss|tschuess|auf wiedersehen|nicht|alles klar|sehr gut|schön|natürlich|ja|nein)\b/i,
    weight: 1.0,
  },
  // Hindi
  {
    language: 'Hindi',
    regex: /\b(namaste|namaskar|kaise ho|aap kaise|kya haal|shukriya|dhanyavaad|theek|theek hai|batao|karo|accha|haan|nahi|kya kar rahe|dost)\b/i,
    weight: 1.0,
  },
  // Italian
  {
    language: 'Italian',
    regex: /\b(ciao|buongiorno|buonasera|come stai|grazie|mille|per favore|prego|molto bene|amico|arrivederci|va bene|per piacere)\b/i,
    weight: 1.0,
  },
  // Portuguese
  {
    language: 'Portuguese',
    regex: /\b(olá|ola|tudo bem|como vai|obrigado|obrigada|por favor|boa tarde|boa noite|bom dia|sim|não|beleza|até logo)\b/i,
    weight: 1.0,
  },
  // Japanese
  {
    language: 'Japanese',
    regex: /\b(konnichiwa|arigatou|arigato|genki|ohayou|sayonara|hai|iie|onegai|daijoubu|sumimasen|tasukete)\b/i,
    weight: 1.0,
  },
  // Arabic
  {
    language: 'Arabic',
    regex: /\b(marhaban|salam|shukran|ahlan|kayfa halak|habibi|na'am|la|alhamdulillah|inshallah|sabah al-khair)\b/i,
    weight: 1.0,
  },
  // Russian
  {
    language: 'Russian',
    regex: /\b(privet|zdravstvuyte|kak dela|spasibo|pozhaluysta|khorosho|da|net|do svidaniya)\b/i,
    weight: 1.0,
  },
  // English
  {
    language: 'English',
    regex: /\b(hello|g'day|mate|how are you|good morning|good afternoon|thanks|thank you|please|yeah|no worries|right on|reckon|sounds good)\b/i,
    weight: 0.8,
  },
];

/**
 * Detects explicit commands to switch or speak a specific language.
 * Examples:
 * - "Can you speak in Spanish?"
 * - "Speak French please"
 * - "Habla en español"
 * - "Parle en français"
 * - "Sprich deutsch"
 * - "Talk to me in Hindi"
 */
export function detectExplicitLanguageCommand(text: string): LanguageDetectionResult | null {
  if (!text) return null;
  const lower = text.trim().toLowerCase();

  // Multi-language command prefixes:
  // English: "speak ...", "talk in ...", "switch to ...", "can you speak ..."
  // Spanish: "habla en ...", "hablemos en ..."
  // French: "parle en ...", "parlons en ..."
  // German: "sprich auf ...", "sprechen wir ..."
  // Italian: "parla in ..."
  // Portuguese: "fale em ..."
  const explicitRegex =
    /(?:can you|could you|please|let's|lets)?\s*(?:speak|talk|converse|switch to|practice|change to|habla|hablemos|parle|parlons|sprich|sprechen|parla|fale)\s+(?:in\s+|en\s+|auf\s+|em\s+)?([a-z\u00C0-\u024F]+)/i;

  const match = lower.match(explicitRegex);
  if (match && match[1]) {
    const rawTarget = match[1].toLowerCase();
    const mapped = LANGUAGE_KEYWORD_ALIASES[rawTarget];
    if (mapped && LANGUAGE_METADATA[mapped]) {
      const meta = LANGUAGE_METADATA[mapped];
      return {
        language: meta.name,
        code: meta.code,
        bcp47: meta.bcp47,
        isExplicit: true,
        confidence: 1.0,
      };
    }
  }

  // Also check direct short commands like "Spanish please", "En français", "Auf Deutsch"
  for (const [alias, standardName] of Object.entries(LANGUAGE_KEYWORD_ALIASES)) {
    if (
      lower === alias ||
      lower === `${alias} please` ||
      lower === `in ${alias}` ||
      lower === `en ${alias}` ||
      lower === `auf ${alias}`
    ) {
      const meta = LANGUAGE_METADATA[standardName];
      return {
        language: meta.name,
        code: meta.code,
        bcp47: meta.bcp47,
        isExplicit: true,
        confidence: 0.98,
      };
    }
  }

  return null;
}

/**
 * Dynamically analyzes speech text / acoustic transcript to detect spoken language.
 */
export function detectLanguageFromTranscript(
  text: string,
  prioritizedExplicitLang: string | null = null
): LanguageDetectionResult {
  // 1. Check for explicit command first (highest priority)
  const explicitResult = detectExplicitLanguageCommand(text);
  if (explicitResult) {
    return explicitResult;
  }

  // 2. If user has an explicit language locked and didn't request a change, prioritize it!
  if (prioritizedExplicitLang && prioritizedExplicitLang !== 'auto' && LANGUAGE_METADATA[prioritizedExplicitLang]) {
    const meta = LANGUAGE_METADATA[prioritizedExplicitLang];
    return {
      language: meta.name,
      code: meta.code,
      bcp47: meta.bcp47,
      isExplicit: true,
      confidence: 1.0,
    };
  }

  // 3. Script-based detection (Unicode characters)
  if (/[\u0900-\u097F]/.test(text)) {
    const meta = LANGUAGE_METADATA.Hindi;
    return { language: meta.name, code: meta.code, bcp47: meta.bcp47, isExplicit: false, confidence: 0.99 };
  }
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    const meta = LANGUAGE_METADATA.Japanese;
    return { language: meta.name, code: meta.code, bcp47: meta.bcp47, isExplicit: false, confidence: 0.99 };
  }
  if (/[\u4E00-\u9FFF]/.test(text)) {
    const meta = LANGUAGE_METADATA['Mandarin Chinese'];
    return { language: meta.name, code: meta.code, bcp47: meta.bcp47, isExplicit: false, confidence: 0.99 };
  }
  if (/[\u0600-\u06FF]/.test(text)) {
    const meta = LANGUAGE_METADATA.Arabic;
    return { language: meta.name, code: meta.code, bcp47: meta.bcp47, isExplicit: false, confidence: 0.99 };
  }
  if (/[\u0400-\u04FF]/.test(text)) {
    const meta = LANGUAGE_METADATA.Russian;
    return { language: meta.name, code: meta.code, bcp47: meta.bcp47, isExplicit: false, confidence: 0.99 };
  }

  // 4. Vocabulary pattern matching
  for (const item of VOCAB_PATTERNS) {
    if (item.regex.test(text)) {
      const meta = LANGUAGE_METADATA[item.language] || LANGUAGE_METADATA.English;
      return {
        language: meta.name,
        code: meta.code,
        bcp47: meta.bcp47,
        isExplicit: false,
        confidence: 0.92,
      };
    }
  }

  // Default fallback: English
  const defaultMeta = LANGUAGE_METADATA.English;
  return {
    language: defaultMeta.name,
    code: defaultMeta.code,
    bcp47: defaultMeta.bcp47,
    isExplicit: false,
    confidence: 0.75,
  };
}
