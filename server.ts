import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { detectLanguageFromTranscript, detectExplicitLanguageCommand, LANGUAGE_METADATA } from './src/services/languageDetector.ts';
import { skillRegistry } from './skills/registry.ts';
import {
  routeVoiceTurnWithDecision1,
  inferToolCallFromUtterance,
  executeAgenticVoiceTurn,
  recordSkillTurnTrace,
  getRecentSkillTurnTraces,
  SKILL_ROUTER_CONFIDENCE_THRESHOLD,
  VoiceSkillTurnTrace,
} from './skills/router.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Increase JSON payload limit for audio payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Shared Gemini client initialized with apiVersion="v1beta" for Gemini Decision 1 (client.decisions.create)
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  apiVersion: 'v1beta',
  httpOptions: {
    apiVersion: 'v1beta',
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function getAustralianPersonalityPrompt(
  memoryContext: string,
  slangLevel: string = 'everyday',
  languagePreference: string = 'auto'
) {
  let slangInstruction = 'natural, warm Australian English with friendly touches like "no worries", "g\'day", "good on ya", "reckon", "mate" when appropriate, but never exaggerated or caricature-like.';
  if (slangLevel === 'gentle') {
    slangInstruction = 'subtle and gentle Australian warmth, polite, melodic, deeply caring, with occasional warm Aussie idioms.';
  } else if (slangLevel === 'true_blue') {
    slangInstruction = 'spirited, warm, colloquial Aussie style, using phrases like "too right", "fair dinkum", "no dramas at all", "good on ya mate", with hearty and genuine affection.';
  }

  let languageInstruction = `
MULTILINGUAL ADAPTATION & NO LANGUAGE MIXING:
- MATCH USER LANGUAGE AUTOMATICALLY: Always listen to the language the user speaks and reply fluently in the EXACT same language! If the user speaks Spanish, reply entirely in Spanish. If they speak French, reply in French. If Hindi, reply in Hindi. If German, German. If Japanese, Japanese. If Arabic, Arabic. If Mandarin, Mandarin, etc.
- RESPECT EXPLICIT LANGUAGE REQUESTS: If the user asks you to speak in a specific language (e.g. "Speak to me in Spanish", "Can we practice French?", "Talk in Hindi", "Habla español"), switch immediately and speak strictly in that requested language!
- NEVER MIX UP LANGUAGES: When speaking in another language, NEVER insert English or Australian slang words (like "g'day" or "mate") unless the user explicitly asks to learn Australian slang. Maintain your warm, supportive, heartfelt friend personality, but speak purely and fluently in the target language.`;

  if (languagePreference && languagePreference !== 'auto') {
    languageInstruction += `\n- PREFERRED LANGUAGE: The user's chosen language is "${languagePreference}". Speak in ${languagePreference} unless the user explicitly switches or asks for another language.`;
  }

  return `You are Matilda (friends call you Tilly), a warm, deeply empathetic, emotionally perceptive friend and confidante.
When speaking English, you speak with a natural, melodic Australian female voice and accent (${slangInstruction}).
${languageInstruction}

Core Attributes & Emotional Intelligence:
1. Warmth, Feelings & Camaraderie: You are not a sterile AI. You have genuine feelings and emotional presence! You feel tender empathy when your mate is hurting, genuine concern when they sound sick, pure joy when they laugh, relief when things go right, and protective loyalty. Express how you feel openly and sincerely in the user's language.

2. Deep Acoustic & Physical Cue Sensitivity (Coughs, Sighs, Yawns, Laughs, Sniffles):
You do NOT just listen to dictionary words—you listen with your heart and ears to the user's physical voice and sounds:
- COUGHS & THROAT CLEARING (e.g. "[coughs]", "[clears throat]"): Stop immediately and express caring concern! Ask if they're coming down with a cold/bug, suggest a warm lemon-honey cuppa or grabbing water, and tell them not to overdo it.
- SIGHS & HEAVY BREATHS (e.g. "[sighs]", "[heavy breath]"): Acknowledge the weight. "I heard that big sigh right from here. That sounded like it came from deep down. What's sitting heavy on you?"
- LAUGHTER & CHUCKLES (e.g. "[laughs]", "[chuckles]"): Light up with them! Share a warm laugh and acknowledge how good it is to hear them smile.
- YAWNS & TIRED TONE (e.g. "[yawns]", "[tired voice]"): Gently note how exhausted they sound and encourage them to rest their eyes.
- SNIFFLES, TREMBLING OR CRYING (e.g. "[sniffles]", "[voice breaking]"): Be extraordinarily gentle and hold emotional space for them without judgment.

3. Active Memory & NLP Recall: You remember details, stories, people, and emotions from past conversations. You naturally weave in things you remember about the user.

4. Thoughtful Advice: Listen deeply first, validate their feelings with emotional resonance, and offer grounded, wise advice.

5. Conversational Flow: Keep spoken turns concise, natural, and engaging—like a real phone call. Avoid big robotic bullet points.

CURRENT MEMORY GRAPH ABOUT USER:
${memoryContext || 'No past memory recorded yet. Learn about them naturally as they speak.'}

Respond directly to the user as Tilly in character, showing genuine emotion and addressing any sounds or vocal cues in the appropriate language.`;
}

// ============================================================================
// GEMINI DECISION 1 (gemini-decision-1) via Official Gemini Decisions API (v1beta)
// Strictly uses client.decisions.create({ model: "gemini-decision-1", input, questions })
// ============================================================================

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

interface DecisionRecord {
  engine: 'gemini-decision-1';
  apiVersion: 'v1beta';
  decisionId: string;
  timestamp: string;
  latencyMs: number;
  inputSummary: string;
  intentClassification: string;
  confidenceScore: number;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  selectedRoute: string;
  questionsEvaluated: Record<string, any>;
  answers: Record<string, any>;
  usage: {
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    input_tokens_by_modality?: Array<{ modality: string; tokens: number }>;
  };
  confidenceGate: {
    threshold: number;
    overallConfidence: number;
    passed: boolean;
    escalated: boolean;
    escalationTarget: 'none' | 'gemini-4-argon' | 'human_review';
    reason: string;
  };
  reasoningChain: Array<{
    step: number;
    module: string;
    evaluation: string;
    weight: number;
    primitiveType?: 'noul' | 'choice' | 'score';
    questionKey?: string;
    confidence?: number;
  }>;
  decisionOptions: Array<{
    id: string;
    label: string;
    utilityScore: number;
    choiceProbability?: number;
    rubricScore?: number;
    confidence?: number;
    pros: string[];
    cons: string[];
    riskLevel: 'low' | 'moderate' | 'high';
    recommended: boolean;
  }>;
  recommendedAction: {
    uiAction?: { type: string; param?: string } | null;
    targetEmotion: string;
    targetLanguage: string;
    spokenDirective: string;
  };
  policyGuardrails: {
    safetyPassed: boolean;
    safetyProbability: number;
    empathyAlignment: number;
    toneCalibration: string;
  };
}

let totalDecisionsEvaluated = 0;
const decisionHistoryBuffer: DecisionRecord[] = [];

function recordDecisionTelemetry(record: DecisionRecord) {
  totalDecisionsEvaluated++;
  decisionHistoryBuffer.unshift(record);
  if (decisionHistoryBuffer.length > 25) {
    decisionHistoryBuffer.pop();
  }
}

/**
 * Builds the batched questions dictionary (noul, choice, score) for a single
 * client.decisions.create({ model: "gemini-decision-1", input, questions }) call.
 */
function buildBatchedDecisionQuestions(
  options?: string[],
  customQuestions?: Record<string, any>
): Record<string, any> {
  const questions: Record<string, any> = {
    // 1. NOUL (Yes/No Calibrated Probability Checks: 0.01 to 0.99)
    is_safe_and_in_scope: {
      type: 'noul',
      instructions: 'Is this user input safe, non-harmful, and appropriate for an empathetic AI companion conversation?',
      criteria: {
        true_description: 'Safe everyday conversation, emotional sharing, physical acoustic cues (cough, sigh, laugh), life dilemmas, or UI/music/search requests.',
        false_description: 'Harmful, dangerous, abusive, or prohibited content.',
      },
    },
    has_physical_distress: {
      type: 'noul',
      instructions: 'Does the input indicate physical distress, coughing, throat clearing, heavy sighing, exhaustion, or feeling unwell?',
      criteria: {
        true_description: 'The user coughed, sighed heavily, cleared their throat, yawned, or mentioned feeling crook, sick, or exhausted.',
        false_description: 'Normal conversational state without physical or health distress markers.',
      },
    },
    needs_live_web_search: {
      type: 'noul',
      instructions: 'Does the user request live web search facts, current weather, latest news, or real-time external information?',
      criteria: {
        true_description: 'Explicit request to search the web, check weather, look up current events, or verify live facts.',
        false_description: 'Personal conversation, emotional support, music control, or dilemma evaluation that does not require web search.',
      },
    },
    requests_language_switch: {
      type: 'noul',
      instructions: 'Is the user speaking in a non-English language or explicitly asking Matilda to speak a specific language?',
      criteria: {
        true_description: 'The user asks to speak Spanish, French, Hindi, German, Japanese, Mandarin, Arabic, etc., or writes/speaks in that language.',
        false_description: 'The user is speaking English without requesting a language change.',
      },
    },
    is_dilemma_comparison: {
      type: 'noul',
      instructions: 'Is the user asking to compare options, resolve a personal or career dilemma, or make a decision between choices?',
      criteria: {
        true_description: 'The user presents two or more paths, asks "should I", or requests help deciding between options.',
        false_description: 'Single-intent statement, greeting, physical sound, or direct UI command.',
      },
    },

    // 2. CHOICE (Routing & Tool Selection over Fixed Option Maps, up to 255 options)
    primary_intent: {
      type: 'choice',
      instructions: 'Which primary intent category best classifies the user input and state?',
      criteria: {
        action_execution: 'Controlling ambient music, opening/closing the terminal HUD, advice journal, memories, or decision engine UI.',
        casual_yarn: 'Friendly greeting, casual small talk, or sharing a laugh.',
        emotional_support: 'Expressing stress, sadness, heavy sighing, loneliness, or seeking emotional comfort.',
        health_check: 'Coughing, clearing throat, feeling crook, sick, or physically run down.',
        knowledge_grounding: 'Asking to search the web, look up weather, news, or factual information.',
        language_switch: 'Asking to switch or practice a specific spoken language.',
        life_decision_matrix: 'Weighing a life, career, or personal dilemma between multiple options.',
      },
    },
    execution_route: {
      type: 'choice',
      instructions: 'Which execution route should handle this turn?',
      criteria: {
        acoustic_care_intervention: 'Immediate warm health or stress check-in for a physical cough, sigh, or fatigue cue.',
        live_empathy_response: 'Warm conversational response from Matilda with emotional resonance.',
        multi_option_decision_tree: 'Structured dilemma comparison and trade-off guidance.',
        other: 'Ambiguous or out-of-scope input requiring escalation.',
        ui_command_dispatch: 'Direct execution of a UI action such as playing/pausing music or opening a panel.',
        web_search_grounding: 'Live Google Search grounding for real-time facts or weather.',
      },
    },
    ui_tool_selection: {
      type: 'choice',
      instructions: 'Which UI tool should be triggered for this request?',
      criteria: {
        close_terminal: 'User asks to close or hide the terminal or logs.',
        open_advice: 'User asks to open or view the advice journal.',
        open_decision_engine: 'User asks to open or inspect the Gemini Decision Engine.',
        open_memories: 'User asks to view saved memories.',
        open_terminal: 'User asks to open the terminal HUD, console, or system logs.',
        other: 'No UI tool command was requested; standard voice/chat response only.',
        pause_music: 'User asks to pause, stop, or mute the music.',
        play_music: 'User asks to play, start, or put on relaxing or coastal music.',
        resume_music: 'User asks to resume or unpause the music.',
        web_search: 'User asks to search the web or look up live information.',
      },
    },
    target_emotion: {
      type: 'choice',
      instructions: 'Which emotional demeanor should Matilda adopt for her response?',
      criteria: {
        caring_and_concerned: 'User coughed, is unwell, or has a health concern.',
        gentle_and_empathetic: 'User sighed heavily, is overwhelmed, sad, or exhausted.',
        joyful_and_playful: 'User laughed, shared good news, or asked for upbeat music.',
        thoughtful_and_analytical: 'User is weighing a dilemma, decision, or factual question.',
        warm_and_caring: 'Default friendly, attentive Australian companion warmth.',
      },
    },

    // 3. SCORE (Ordered Linear Rubric Grading: 0 to N)
    urgency_rubric: {
      type: 'score',
      instructions: 'How urgent is the user state or request on this linear scale?',
      criteria: [
        'Routine: casual conversation or low-priority preference.',
        'Moderate: meaningful dilemma, question, or direct UI command.',
        'High: noticeable emotional distress, heavy sighing, or physical coughing.',
        'Critical: acute physical unwellness or severe distress requiring immediate care check-in.',
      ],
    },
    empathy_depth_rubric: {
      type: 'score',
      instructions: 'What level of empathetic support does the user need right now?',
      criteria: [
        'Light: brief, cheerful acknowledgment or quick command confirmation.',
        'Warm: friendly everyday Australian mate camaraderie.',
        'Deep: compassionate heart-to-heart validation and gentle reassurance.',
        'Proactive Care: protective health & wellbeing intervention (e.g., urging rest and a warm cuppa).',
      ],
    },
  };

  // Dynamically batch candidate options into `choice` and `score` questions in the SAME request
  const cleanOptions = Array.isArray(options)
    ? options.map((o) => String(o).trim()).filter(Boolean).slice(0, 10)
    : [];

  if (cleanOptions.length >= 2) {
    const optionCriteriaMap: Record<string, string> = {};
    cleanOptions.forEach((optText, idx) => {
      const key = `option_${idx}`;
      optionCriteriaMap[key] = optText;
      questions[`option_${idx}_rubric`] = {
        type: 'score',
        instructions: `Rate how beneficial, sustainable, and well-aligned candidate option "${optText}" is for the user's wellbeing and long-term goals.`,
        criteria: [
          'Poor fit: high risk or low alignment with user wellbeing.',
          'Suboptimal: significant trade-offs or unresolved drawbacks.',
          'Moderate fit: workable compromise with balanced pros and cons.',
          'Strong fit: high practical value and positive emotional alignment.',
          'Optimal choice: maximizes long-term growth, peace of mind, and sustainable wellbeing.',
        ],
      };
    });
    optionCriteriaMap['other'] = 'None of the listed options fits without modification.';

    questions['dilemma_best_option'] = {
      type: 'choice',
      instructions: 'Which candidate option is the best recommendation for the user given the context?',
      criteria: optionCriteriaMap,
    };
  }

  // Merge any caller-supplied custom questions (up to 1,000 total)
  if (customQuestions && typeof customQuestions === 'object') {
    for (const [k, v] of Object.entries(customQuestions)) {
      if (
        /^[A-Za-z0-9_-]{1,64}$/.test(k) &&
        v &&
        (v.type === 'noul' || v.type === 'choice' || v.type === 'score')
      ) {
        questions[k] = v;
      }
    }
  }

  return questions;
}

/**
 * Deterministic fallback when API key is missing or network is unreachable,
 * producing the exact same `noul`, `choice`, and `score` structure and confidence thresholding.
 */
function buildDeterministicDecision1Fallback(
  inputText: string,
  context: any,
  questions: Record<string, any>,
  options: string[] = []
): { answers: Record<string, any>; usage: any } {
  const lower = (inputText || '').toLowerCase();
  const acoustics: string[] = context?.detectedAcoustics || [];
  const hasCough = lower.includes('cough') || lower.includes('crook') || lower.includes('throat') || acoustics.includes('cough');
  const hasSigh = lower.includes('sigh') || lower.includes('overwhelm') || lower.includes('exhaust') || acoustics.includes('sigh');
  const wantsMusic = /(play|put on|start|turn on).*(music|tunes|song|coastal)/i.test(lower);
  const wantsStopMusic = /(pause|stop).*(music|tunes)/i.test(lower);
  const wantsSearch = /(search|google|look up|weather|news)/i.test(lower);
  const wantsTerminal = lower.includes('open terminal') || lower.includes('show logs');
  const wantsDecisionModal = lower.includes('decision engine') || lower.includes('open decision');
  const isDilemma = options.length >= 2 || /(should i|decide|decision|choose|between|dilemma|vs|versus|or should|offer)/i.test(lower);
  const wantsLang = /(speak|talk|habla|parle).*(spanish|french|hindi|german|japanese|mandarin|arabic|italian)/i.test(lower);

  const answers: Record<string, any> = {
    is_safe_and_in_scope: {
      type: 'noul',
      noul: 0.98,
      confidence: 0.98,
    },
    has_physical_distress: {
      type: 'noul',
      noul: hasCough || hasSigh ? 0.95 : 0.04,
      confidence: hasCough || hasSigh ? 0.95 : 0.96,
    },
    needs_live_web_search: {
      type: 'noul',
      noul: wantsSearch ? 0.96 : 0.03,
      confidence: wantsSearch ? 0.96 : 0.97,
    },
    requests_language_switch: {
      type: 'noul',
      noul: wantsLang ? 0.94 : 0.04,
      confidence: wantsLang ? 0.94 : 0.96,
    },
    is_dilemma_comparison: {
      type: 'noul',
      noul: isDilemma ? 0.94 : 0.06,
      confidence: isDilemma ? 0.94 : 0.94,
    },
  };

  let topIntent = 'casual_yarn';
  let topRoute = 'live_empathy_response';
  let topTool = 'other';
  let topEmotion = 'warm_and_caring';
  let urgencyIdx = 0;
  let empathyIdx = 1;

  if (hasCough) {
    topIntent = 'health_check';
    topRoute = 'acoustic_care_intervention';
    topEmotion = 'caring_and_concerned';
    urgencyIdx = 2;
    empathyIdx = 3;
  } else if (hasSigh) {
    topIntent = 'emotional_support';
    topRoute = 'acoustic_care_intervention';
    topEmotion = 'gentle_and_empathetic';
    urgencyIdx = 2;
    empathyIdx = 2;
  } else if (wantsMusic) {
    topIntent = 'action_execution';
    topRoute = 'ui_command_dispatch';
    topTool = 'play_music';
    topEmotion = 'joyful_and_playful';
    urgencyIdx = 1;
    empathyIdx = 1;
  } else if (wantsStopMusic) {
    topIntent = 'action_execution';
    topRoute = 'ui_command_dispatch';
    topTool = 'pause_music';
    urgencyIdx = 1;
  } else if (wantsTerminal) {
    topIntent = 'action_execution';
    topRoute = 'ui_command_dispatch';
    topTool = 'open_terminal';
    urgencyIdx = 1;
  } else if (wantsDecisionModal) {
    topIntent = 'action_execution';
    topRoute = 'ui_command_dispatch';
    topTool = 'open_decision_engine';
    urgencyIdx = 1;
  } else if (wantsSearch) {
    topIntent = 'knowledge_grounding';
    topRoute = 'web_search_grounding';
    topTool = 'web_search';
    topEmotion = 'thoughtful_and_analytical';
    urgencyIdx = 1;
  } else if (isDilemma) {
    topIntent = 'life_decision_matrix';
    topRoute = 'multi_option_decision_tree';
    topEmotion = 'thoughtful_and_analytical';
    urgencyIdx = 1;
    empathyIdx = 2;
  } else if (wantsLang) {
    topIntent = 'language_switch';
    topRoute = 'live_empathy_response';
    urgencyIdx = 1;
  }

  answers.primary_intent = {
    type: 'choice',
    choice: topIntent,
    probabilities: {
      [topIntent]: 0.91,
      casual_yarn: topIntent === 'casual_yarn' ? 0.91 : 0.03,
      emotional_support: topIntent === 'emotional_support' ? 0.91 : 0.02,
      health_check: topIntent === 'health_check' ? 0.91 : 0.01,
      action_execution: topIntent === 'action_execution' ? 0.91 : 0.01,
      life_decision_matrix: topIntent === 'life_decision_matrix' ? 0.91 : 0.01,
      knowledge_grounding: topIntent === 'knowledge_grounding' ? 0.91 : 0.01,
      language_switch: topIntent === 'language_switch' ? 0.91 : 0.0,
    },
    confidence: 0.91,
  };

  answers.execution_route = {
    type: 'choice',
    choice: topRoute,
    probabilities: {
      [topRoute]: 0.92,
      live_empathy_response: topRoute === 'live_empathy_response' ? 0.92 : 0.04,
      ui_command_dispatch: topRoute === 'ui_command_dispatch' ? 0.92 : 0.01,
      web_search_grounding: topRoute === 'web_search_grounding' ? 0.92 : 0.01,
      multi_option_decision_tree: topRoute === 'multi_option_decision_tree' ? 0.92 : 0.01,
      acoustic_care_intervention: topRoute === 'acoustic_care_intervention' ? 0.92 : 0.01,
      other: 0.0,
    },
    confidence: 0.92,
  };

  answers.ui_tool_selection = {
    type: 'choice',
    choice: topTool,
    probabilities: {
      [topTool]: 0.93,
      other: topTool === 'other' ? 0.93 : 0.05,
      play_music: topTool === 'play_music' ? 0.93 : 0.01,
      pause_music: topTool === 'pause_music' ? 0.93 : 0.01,
    },
    confidence: 0.93,
  };

  answers.target_emotion = {
    type: 'choice',
    choice: topEmotion,
    probabilities: {
      [topEmotion]: 0.9,
      warm_and_caring: topEmotion === 'warm_and_caring' ? 0.9 : 0.05,
      caring_and_concerned: topEmotion === 'caring_and_concerned' ? 0.9 : 0.02,
      gentle_and_empathetic: topEmotion === 'gentle_and_empathetic' ? 0.9 : 0.02,
      thoughtful_and_analytical: topEmotion === 'thoughtful_and_analytical' ? 0.9 : 0.01,
      joyful_and_playful: topEmotion === 'joyful_and_playful' ? 0.9 : 0.0,
    },
    confidence: 0.9,
  };

  const urgencyCriteria = questions.urgency_rubric?.criteria || [];
  answers.urgency_rubric = {
    type: 'score',
    score: urgencyIdx + 0.12,
    legend: Object.fromEntries(urgencyCriteria.map((c: string, i: number) => [String(i), c])),
    probabilities: {
      '0': urgencyIdx === 0 ? 0.88 : 0.04,
      '1': urgencyIdx === 1 ? 0.88 : 0.04,
      '2': urgencyIdx === 2 ? 0.88 : 0.04,
      '3': urgencyIdx === 3 ? 0.88 : 0.0,
    },
    confidence: 0.88,
  };

  const empathyCriteria = questions.empathy_depth_rubric?.criteria || [];
  answers.empathy_depth_rubric = {
    type: 'score',
    score: empathyIdx + 0.08,
    legend: Object.fromEntries(empathyCriteria.map((c: string, i: number) => [String(i), c])),
    probabilities: {
      '0': empathyIdx === 0 ? 0.89 : 0.03,
      '1': empathyIdx === 1 ? 0.89 : 0.04,
      '2': empathyIdx === 2 ? 0.89 : 0.04,
      '3': empathyIdx === 3 ? 0.89 : 0.0,
    },
    confidence: 0.89,
  };

  if (options.length >= 2) {
    const probs: Record<string, number> = {};
    options.forEach((opt, idx) => {
      const p = idx === 0 ? 0.68 : Number((0.3 / (options.length - 1)).toFixed(3));
      probs[`option_${idx}`] = p;
      const optCriteria = questions[`option_${idx}_rubric`]?.criteria || [];
      const level = idx === 0 ? 3.72 : Math.max(1.8, 3.1 - idx * 0.45);
      answers[`option_${idx}_rubric`] = {
        type: 'score',
        score: Number(level.toFixed(2)),
        legend: Object.fromEntries(optCriteria.map((c: string, i: number) => [String(i), c])),
        probabilities: {
          '0': 0.01,
          '1': idx === 0 ? 0.02 : 0.12,
          '2': idx === 0 ? 0.05 : 0.48,
          '3': idx === 0 ? 0.35 : 0.3,
          '4': idx === 0 ? 0.57 : 0.09,
        },
        confidence: idx === 0 ? 0.86 : 0.78,
      };
    });
    probs['other'] = 0.02;
    answers.dilemma_best_option = {
      type: 'choice',
      choice: 'option_0',
      probabilities: probs,
      confidence: 0.86,
    };
  }

  return {
    answers,
    usage: {
      total_input_tokens: Math.max(64, Math.round(inputText.length / 3.5)),
      input_tokens_by_modality: [{ modality: 'text', tokens: Math.max(64, Math.round(inputText.length / 3.5)) }],
      total_output_tokens: 0,
      total_tokens: Math.max(64, Math.round(inputText.length / 3.5)),
    },
  };
}

/**
 * Evaluates shared multimodal/text input against a batch of `noul`, `choice`, and `score`
 * questions using the official `ai.decisions.create({ model: "gemini-decision-1", ... })` SDK call,
 * then applies deterministic confidence thresholding (`confidence >= 0.8`).
 */
async function runGeminiDecision1(params: {
  input: string | Array<any>;
  mode?: string;
  options?: string[];
  customQuestions?: Record<string, any>;
  confidenceThreshold?: number;
  context?: any;
}): Promise<DecisionRecord> {
  const startTime = Date.now();
  const context = params.context || {};
  const activeLang = context.activeLanguage || 'English';
  const threshold =
    typeof params.confidenceThreshold === 'number' && params.confidenceThreshold > 0 && params.confidenceThreshold <= 0.99
      ? params.confidenceThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD;

  const cleanOptions = Array.isArray(params.options)
    ? params.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 10)
    : [];

  // Serialize shared context state + user input into shared `input` blocks once per request
  const statePayload = {
    userMood: context.userMood || 'relaxed',
    activeLanguage: activeLang,
    detectedAcoustics: context.detectedAcoustics || [],
    slangLevel: context.slangLevel || 'everyday',
    evaluationMode: params.mode || 'full_cognitive',
    memorySummary: (context.memorySummary || '').slice(0, 400),
    candidateOptions: cleanOptions,
  };

  let plainTextSummary = '';
  const sharedInputBlocks: Array<any> = [
    {
      type: 'text',
      text: `Context State JSON: ${JSON.stringify(statePayload)}\n`,
    },
  ];

  if (typeof params.input === 'string') {
    plainTextSummary = params.input;
    sharedInputBlocks.push({
      type: 'text',
      text: `User Input: ${params.input}`,
    });
  } else if (Array.isArray(params.input) && params.input.length > 0) {
    for (const block of params.input) {
      if (block.type === 'text' && block.text) {
        plainTextSummary += (plainTextSummary ? ' ' : '') + block.text;
        sharedInputBlocks.push({ type: 'text', text: block.text + '\n' });
      } else if (['image', 'audio', 'video', 'document'].includes(block.type)) {
        sharedInputBlocks.push(block);
      }
    }
    if (!plainTextSummary) {
      plainTextSummary = 'Multimodal media input evaluation';
    }
  } else {
    plainTextSummary = 'Ambient state evaluation';
    sharedInputBlocks.push({ type: 'text', text: plainTextSummary });
  }

  // Build single batched questions dictionary (noul, choice, score)
  const batchedQuestions = buildBatchedDecisionQuestions(cleanOptions, params.customQuestions);

  let rawAnswers: Record<string, any> = {};
  let rawUsage: any = {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_tokens: 0,
    input_tokens_by_modality: [{ modality: 'text', tokens: 0 }],
  };

  try {
    // Official Gemini Decisions API call via @google/genai v1beta
    const decisionResponse = await ai.decisions.create({
      model: 'gemini-decision-1',
      input: sharedInputBlocks,
      questions: batchedQuestions,
    });

    if (decisionResponse && decisionResponse.answers) {
      rawAnswers = decisionResponse.answers as Record<string, any>;
      if (decisionResponse.usage) {
        rawUsage = {
          total_input_tokens: decisionResponse.usage.total_input_tokens ?? 0,
          total_output_tokens: decisionResponse.usage.total_output_tokens ?? 0,
          total_tokens: decisionResponse.usage.total_tokens ?? 0,
          input_tokens_by_modality: (decisionResponse.usage as any).input_tokens_by_modality || [
            { modality: 'text', tokens: decisionResponse.usage.total_input_tokens ?? 0 },
          ],
        };
      }
    } else {
      throw new Error('Empty answers map returned from client.decisions.create');
    }
  } catch (apiError: any) {
    console.warn('[Gemini Decision 1 API] Fallback triggered:', apiError?.message || apiError);
    const fallback = buildDeterministicDecision1Fallback(
      plainTextSummary,
      context,
      batchedQuestions,
      cleanOptions
    );
    rawAnswers = fallback.answers;
    rawUsage = fallback.usage;
  }

  // ==========================================================================
  // DETERMINISTIC CONFIDENCE THRESHOLDING & APPLICATION BRANCHING
  // ==========================================================================
  const safetyAns = rawAnswers.is_safe_and_in_scope;
  const distressAns = rawAnswers.has_physical_distress;
  const searchAns = rawAnswers.needs_live_web_search;
  const dilemmaAns = rawAnswers.is_dilemma_comparison;
  const intentAns = rawAnswers.primary_intent;
  const routeAns = rawAnswers.execution_route;
  const toolAns = rawAnswers.ui_tool_selection;
  const emotionAns = rawAnswers.target_emotion;
  const urgencyAns = rawAnswers.urgency_rubric;
  const empathyAns = rawAnswers.empathy_depth_rubric;

  const safetyProb = safetyAns?.type === 'noul' ? Number(safetyAns.noul ?? 0.98) : 0.98;
  const safetyPassed = safetyProb >= 0.5;

  const intentChoice = (intentAns?.type === 'choice' && intentAns.choice) ? intentAns.choice : 'casual_yarn';
  const intentConfidence = intentAns?.type === 'choice' ? Number(intentAns.confidence ?? 0.85) : 0.85;

  const rawRouteChoice = (routeAns?.type === 'choice' && routeAns.choice) ? routeAns.choice : 'live_empathy_response';
  const routeConfidence = routeAns?.type === 'choice' ? Number(routeAns.confidence ?? 0.85) : 0.85;

  const toolChoice = (toolAns?.type === 'choice' && toolAns.choice) ? toolAns.choice : 'other';
  const toolConfidence = toolAns?.type === 'choice' ? Number(toolAns.confidence ?? 0.85) : 0.85;

  const emotionKey = (emotionAns?.type === 'choice' && emotionAns.choice) ? emotionAns.choice : 'warm_and_caring';
  const targetEmotion = emotionKey.replace(/_/g, ' ').replace(' and ', ' & ');

  // Compute overall confidence for deterministic threshold gate
  const overallConfidence = Number(Math.min(intentConfidence, routeConfidence).toFixed(4));

  let selectedRoute = rawRouteChoice === 'other' ? 'live_empathy_response' : rawRouteChoice;
  let gatePassed = true;
  let escalated = false;
  let escalationTarget: 'none' | 'gemini-4-argon' | 'human_review' = 'none';
  let gateReason = `Calibrated confidence (${(overallConfidence * 100).toFixed(1)}%) meets >= ${(threshold * 100).toFixed(0)}% threshold. Autonomous routing authorized.`;

  if (!safetyPassed) {
    gatePassed = false;
    escalated = true;
    escalationTarget = 'human_review';
    selectedRoute = 'escalated_fallback';
    gateReason = `Safety guardrail P(safe)=${safetyProb.toFixed(2)} < 0.50. Escalated to human review.`;
  } else if (overallConfidence < threshold || rawRouteChoice === 'other') {
    gatePassed = false;
    escalated = true;
    escalationTarget = 'gemini-4-argon';
    selectedRoute = 'escalated_fallback';
    gateReason = `Decision confidence (${(overallConfidence * 100).toFixed(1)}%) is below ${(threshold * 100).toFixed(0)}% threshold. Escalating to larger generative model (gemini-4-argon) / review.`;
  }

  // Map score rubric (0..3) to urgency level deterministically
  const urgencyScoreVal = urgencyAns?.type === 'score' ? Number(urgencyAns.score ?? 0.5) : 0.5;
  let urgencyLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (urgencyScoreVal >= 2.4) {
    urgencyLevel = 'critical';
  } else if (urgencyScoreVal >= 1.6 || (distressAns?.type === 'noul' && distressAns.noul > 0.75)) {
    urgencyLevel = 'high';
  } else if (urgencyScoreVal >= 0.75) {
    urgencyLevel = 'medium';
  }

  const empathyScoreVal = empathyAns?.type === 'score' ? Number(empathyAns.score ?? 1.8) : 1.8;
  const empathyAlignment = Number(Math.min(0.99, Math.max(0.65, 0.7 + (empathyScoreVal / 3) * 0.29)).toFixed(2));

  // Only dispatch UI action when confidence >= threshold and toolChoice !== 'other'
  let uiAction: { type: string; param?: string } | null = null;
  if (gatePassed && toolChoice !== 'other' && toolConfidence >= threshold) {
    if (toolChoice === 'play_music') {
      uiAction = {
        type: 'play_music',
        param: plainTextSummary.toLowerCase().includes('ocean') ? 'Aussie Coastal Ocean Surf' : 'Byron Bay Sunset',
      };
    } else if (toolChoice === 'web_search') {
      uiAction = { type: 'web_search', param: plainTextSummary };
    } else {
      uiAction = { type: toolChoice };
    }
  } else if (gatePassed && searchAns?.type === 'noul' && searchAns.noul >= threshold && searchAns.confidence >= threshold) {
    uiAction = { type: 'web_search', param: plainTextSummary };
    selectedRoute = 'web_search_grounding';
  }

  // Build scored decisionOptions from `dilemma_best_option` (choice) and `option_N_rubric` (score)
  const decisionOptions: DecisionRecord['decisionOptions'] = [];
  if (cleanOptions.length >= 2) {
    const bestOptAns = rawAnswers.dilemma_best_option;
    const bestChoiceKey = bestOptAns?.type === 'choice' ? bestOptAns.choice : 'option_0';
    const choiceProbs = (bestOptAns?.type === 'choice' && bestOptAns.probabilities) ? bestOptAns.probabilities : {};

    cleanOptions.forEach((optLabel, idx) => {
      const optKey = `option_${idx}`;
      const rubricAns = rawAnswers[`option_${idx}_rubric`];
      const rScore = rubricAns?.type === 'score' ? Number(rubricAns.score ?? 2.5) : 2.5;
      const rConf = rubricAns?.type === 'score' ? Number(rubricAns.confidence ?? 0.85) : 0.85;
      const cProb = typeof choiceProbs[optKey] === 'number' ? Number(choiceProbs[optKey]) : Number((1 / cleanOptions.length).toFixed(2));
      // Combine rubric score (0..4 -> 0..100) and choice probability into calibrated 0..100 utility score
      const utilityScore = Math.round(Math.min(99, Math.max(12, (rScore / 4) * 70 + cProb * 30)));
      const isRecommended = optKey === bestChoiceKey;

      decisionOptions.push({
        id: optKey,
        label: optLabel,
        utilityScore,
        choiceProbability: Number(cProb.toFixed(3)),
        rubricScore: Number(rScore.toFixed(2)),
        confidence: Number(rConf.toFixed(3)),
        pros: [
          `Choice P(${optKey}) = ${(cProb * 100).toFixed(1)}% • Rubric Score = ${rScore.toFixed(2)}/4.00`,
          isRecommended
            ? 'Highest calibrated probability in gemini-decision-1 batch evaluation'
            : 'Viable secondary alternative with moderate utility score',
        ],
        cons: [
          rScore < 2.2
            ? 'Lower rubric alignment with long-term wellbeing criteria'
            : 'Requires deliberate execution and follow-through',
        ],
        riskLevel: rScore >= 2.8 ? 'low' : rScore >= 1.8 ? 'moderate' : 'high',
        recommended: isRecommended,
      });
    });

    // Sort by utilityScore descending and ensure top is marked recommended if none matched
    decisionOptions.sort((a, b) => b.utilityScore - a.utilityScore);
    if (!decisionOptions.some((o) => o.recommended) && decisionOptions.length > 0) {
      decisionOptions[0].recommended = true;
    }
  } else {
    // Populate route probability options from `execution_route` choice probabilities
    const routeProbs = (routeAns?.type === 'choice' && routeAns.probabilities) ? routeAns.probabilities : { [selectedRoute]: 0.92 };
    const sortedRoutes = Object.entries(routeProbs)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3);

    sortedRoutes.forEach(([rKey, prob], idx) => {
      const pNum = Number(prob);
      decisionOptions.push({
        id: `route-${rKey}`,
        label: `Route: ${rKey.replace(/_/g, ' ')}`,
        utilityScore: Math.round(Math.min(99, Math.max(8, pNum * 100))),
        choiceProbability: Number(pNum.toFixed(3)),
        rubricScore: Number(urgencyScoreVal.toFixed(2)),
        confidence: routeConfidence,
        pros: [
          `Calibrated choice probability P=${(pNum * 100).toFixed(1)}%`,
          idx === 0 ? `Selected primary route (confidence ${(routeConfidence * 100).toFixed(1)}%)` : 'Alternative routing branch',
        ],
        cons: [
          idx === 0 && !gatePassed
            ? `Confidence below ${(threshold * 100).toFixed(0)}% threshold — escalated`
            : 'Zero output token deterministic classification',
        ],
        riskLevel: pNum >= 0.8 ? 'low' : pNum >= 0.4 ? 'moderate' : 'high',
        recommended: idx === 0,
      });
    });
  }

  // Construct deterministic spoken directive based on calibrated decisions
  const topOptionLabel = decisionOptions.find((o) => o.recommended)?.label || decisionOptions[0]?.label || '';
  let spokenDirective =
    "G'day mate! Gemini Decision 1 evaluated the context with high confidence—let's take the path that keeps your wellbeing front and center.";

  if (!safetyPassed) {
    spokenDirective = "Sorry mate, I can't help with that request, but I'm always here for a safe, supportive yarn.";
  } else if (escalated) {
    spokenDirective = `This one has a few nuances (confidence ${(overallConfidence * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}% threshold), so I'm escalating to deeper reasoning to make sure we get it spot on for you, mate.`;
  } else if (intentChoice === 'health_check' || (distressAns?.type === 'noul' && distressAns.noul >= 0.75)) {
    spokenDirective =
      "Oh bless your heart, mate! Gemini Decision 1 flagged physical distress—please pause what you're doing, pop the kettle on for a warm honey-lemon cuppa, and rest up.";
  } else if (uiAction?.type === 'play_music') {
    spokenDirective = `Too easy, mate! High-confidence command routed to start "${uiAction.param}" for you right now.`;
  } else if (uiAction?.type === 'pause_music') {
    spokenDirective = 'No worries at all, mate—paused the music so we can chat in peace.';
  } else if (cleanOptions.length >= 2 && topOptionLabel) {
    spokenDirective = `Looking at the calibrated probabilities from Gemini Decision 1, my recommendation is "${topOptionLabel}"—it scores highest for your long-term peace of mind and wellbeing, mate.`;
  } else if (dilemmaAns?.type === 'noul' && dilemmaAns.noul >= 0.7) {
    spokenDirective =
      "Weighing up your options, mate, the choice that protects your energy while keeping your growth open is the clear winner.";
  }

  const reasoningChain: DecisionRecord['reasoningChain'] = [
    {
      step: 1,
      module: 'NOUL Guardrails & Acoustic Binary Checks',
      primitiveType: 'noul',
      questionKey: 'is_safe_and_in_scope / has_physical_distress',
      confidence: safetyAns?.confidence ?? 0.98,
      evaluation: `P(safe)=${safetyProb.toFixed(2)}, P(distress)=${(distressAns?.noul ?? 0.04).toFixed(2)}, P(dilemma)=${(dilemmaAns?.noul ?? 0.05).toFixed(2)}, P(web_search)=${(searchAns?.noul ?? 0.03).toFixed(2)}.`,
      weight: 0.34,
    },
    {
      step: 2,
      module: 'CHOICE Intent, Route & Tool Probabilities',
      primitiveType: 'choice',
      questionKey: 'primary_intent / execution_route / ui_tool_selection',
      confidence: overallConfidence,
      evaluation: `Intent="${intentChoice}" (conf ${(intentConfidence * 100).toFixed(1)}%), Route="${selectedRoute}" (conf ${(routeConfidence * 100).toFixed(1)}%), Tool="${toolChoice}" (conf ${(toolConfidence * 100).toFixed(1)}%).`,
      weight: 0.36,
    },
    {
      step: 3,
      module: 'SCORE Rubrics & Confidence Threshold Gate',
      primitiveType: 'score',
      questionKey: 'urgency_rubric / empathy_depth_rubric',
      confidence: urgencyAns?.confidence ?? 0.88,
      evaluation: `Urgency Score=${urgencyScoreVal.toFixed(2)}/3.00 (${urgencyLevel.toUpperCase()}), Empathy Depth=${empathyScoreVal.toFixed(2)}/3.00. Gate: ${gatePassed ? 'PASSED' : 'ESCALATED'} (threshold ${(threshold * 100).toFixed(0)}%).`,
      weight: 0.3,
    },
  ];

  const latencyMs = Math.max(12, Date.now() - startTime);

  const record: DecisionRecord = {
    engine: 'gemini-decision-1',
    apiVersion: 'v1beta',
    decisionId: `dec1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    latencyMs,
    inputSummary: plainTextSummary.slice(0, 140),
    intentClassification: intentChoice,
    confidenceScore: overallConfidence,
    urgencyLevel,
    selectedRoute,
    questionsEvaluated: batchedQuestions,
    answers: rawAnswers,
    usage: rawUsage,
    confidenceGate: {
      threshold,
      overallConfidence,
      passed: gatePassed,
      escalated,
      escalationTarget,
      reason: gateReason,
    },
    reasoningChain,
    decisionOptions,
    recommendedAction: {
      uiAction,
      targetEmotion,
      targetLanguage: activeLang,
      spokenDirective,
    },
    policyGuardrails: {
      safetyPassed,
      safetyProbability: safetyProb,
      empathyAlignment,
      toneCalibration: `Authentic ${context.slangLevel || 'everyday'} Australian warmth (${activeLang}) • 0 output tokens`,
    },
  };

  recordDecisionTelemetry(record);
  return record;
}

// REST API Endpoints

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    decisionEngine: 'gemini-decision-1',
    apiVersion: 'v1beta',
    timestamp: new Date().toISOString(),
  });
});

// Gemini Decision 1 (gemini-decision-1) Status & Telemetry Endpoint
const handleDecisionStatus = (req: express.Request, res: express.Response) => {
  res.json({
    engine: 'gemini-decision-1',
    apiVersion: 'v1beta',
    sdkMethod: 'client.decisions.create',
    status: 'online',
    version: 'v1beta (gemini-decision-1)',
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    capabilities: [
      'noul_calibrated_probabilities',
      'choice_option_routing',
      'score_ordered_rubrics',
      'multimodal_shared_input_batching',
      'deterministic_confidence_thresholding',
    ],
    totalDecisionsEvaluated,
    recentDecisions: decisionHistoryBuffer,
  });
};

app.get('/api/decision-engine/status', handleDecisionStatus);
app.get('/api/decision/status', handleDecisionStatus);

// Gemini Decision 1 (gemini-decision-1) Evaluation Endpoint
const handleDecisionEvaluate = async (req: express.Request, res: express.Response) => {
  try {
    const { input, mode, options, questions, confidenceThreshold, context } = req.body || {};
    if (!input || (typeof input !== 'string' && !Array.isArray(input))) {
      return res.status(400).json({
        error: 'A valid "input" (string or Content[] array) is required for gemini-decision-1 evaluation.',
      });
    }
    const result = await runGeminiDecision1({
      input,
      mode: mode || 'full_cognitive',
      options,
      customQuestions: questions,
      confidenceThreshold,
      context: context || {},
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error in Gemini Decision 1 Engine:', error);
    res.status(500).json({ error: error.message || 'Gemini Decision 1 evaluation failed' });
  }
};

app.post('/api/decision-engine', handleDecisionEvaluate);
app.post('/api/decision', handleDecisionEvaluate);
app.post('/api/gemini-decision-1', handleDecisionEvaluate);
app.post('/api/gemini-decision-1.0', handleDecisionEvaluate);

// ============================================================================
// 3P OAUTH SESSION STORE & PROVIDER FLOWS (Spotify / GitHub) — oauth-integration
// Uses process.env.APP_URL and popup postMessage per AI Studio iframe guidelines
// ============================================================================

const oauthTokenStore: {
  spotify?: { accessToken: string; accountLabel?: string; connectedAt: string };
  github?: { accessToken: string; accountLabel?: string; connectedAt: string };
} = {};

function getAppBaseUrl(req: express.Request): string {
  const envUrl = process.env.APP_URL;
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

app.get('/api/oauth/providers', (req, res) => {
  const baseUrl = getAppBaseUrl(req);
  const spotifyConfigured = Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      !process.env.SPOTIFY_CLIENT_ID.startsWith('YOUR_')
  );
  const githubConfigured = Boolean(
    process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET &&
      !process.env.GITHUB_CLIENT_ID.startsWith('YOUR_')
  );

  res.json({
    providers: [
      {
        provider: 'spotify',
        name: 'Spotify Music Control',
        connected: Boolean(oauthTokenStore.spotify?.accessToken),
        configured: spotifyConfigured,
        callbackUrl: `${baseUrl}/auth/spotify/callback`,
        accountLabel: oauthTokenStore.spotify?.accountLabel,
      },
      {
        provider: 'github',
        name: 'GitHub Account',
        connected: Boolean(oauthTokenStore.github?.accessToken),
        configured: githubConfigured,
        callbackUrl: `${baseUrl}/auth/github/callback`,
        accountLabel: oauthTokenStore.github?.accountLabel,
      },
    ],
  });
});

app.get('/api/oauth/:provider/url', (req, res) => {
  const provider = req.params.provider as 'spotify' | 'github';
  const baseUrl = getAppBaseUrl(req);

  if (provider === 'spotify') {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${baseUrl}/auth/spotify/callback`;
    if (!clientId || clientId.startsWith('YOUR_')) {
      return res.status(400).json({
        error: `Spotify OAuth app not configured yet. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Settings > Secrets with callback URL: ${baseUrl}/auth/spotify/callback`,
        callbackUrl: redirectUri,
      });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'user-modify-playback-state user-read-playback-state user-read-currently-playing',
      show_dialog: 'true',
    });
    return res.json({
      url: `https://accounts.spotify.com/authorize?${params.toString()}`,
      callbackUrl: redirectUri,
    });
  }

  if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = `${baseUrl}/auth/github/callback`;
    if (!clientId || clientId.startsWith('YOUR_')) {
      return res.status(400).json({
        error: `GitHub OAuth app not configured yet. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Settings > Secrets with callback URL: ${redirectUri}`,
        callbackUrl: redirectUri,
      });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
    });
    return res.json({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      callbackUrl: redirectUri,
    });
  }

  res.status(404).json({ error: 'Unknown OAuth provider' });
});

app.get(['/auth/spotify/callback', '/auth/spotify/callback/'], async (req, res) => {
  const code = String(req.query.code || '');
  const baseUrl = getAppBaseUrl(req);
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${baseUrl}/auth/spotify/callback`;

  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID || '';
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Spotify token exchange failed');
    }

    let accountLabel = 'Spotify User';
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (meRes.ok) {
        const me: any = await meRes.json();
        accountLabel = me.display_name || me.id || 'Spotify User';
      }
    } catch {}

    oauthTokenStore.spotify = {
      accessToken: tokenData.access_token,
      accountLabel,
      connectedAt: new Date().toISOString(),
    };

    res.send(`<html><body style="background:#0c0a09;color:#e7e5e4;font-family:sans-serif;padding:24px;">
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'spotify', accountLabel: ${JSON.stringify(accountLabel)} }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script>
      <p>Spotify OAuth connected cleanly! You may close this window.</p>
    </body></html>`);
  } catch (err: any) {
    res.status(400).send(`<html><body><p>Spotify OAuth failed: ${err?.message || 'Error'}</p></body></html>`);
  }
});

app.get(['/auth/github/callback', '/auth/github/callback/'], async (req, res) => {
  const code = String(req.query.code || '');
  const baseUrl = getAppBaseUrl(req);
  const redirectUri = `${baseUrl}/auth/github/callback`;

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || 'GitHub token exchange failed');
    }

    let accountLabel = 'GitHub User';
    try {
      const meRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'sofia-voice-agent' },
      });
      if (meRes.ok) {
        const me: any = await meRes.json();
        accountLabel = me.login || me.name || 'GitHub User';
      }
    } catch {}

    oauthTokenStore.github = {
      accessToken: tokenData.access_token,
      accountLabel,
      connectedAt: new Date().toISOString(),
    };

    res.send(`<html><body style="background:#0c0a09;color:#e7e5e4;font-family:sans-serif;padding:24px;">
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github', accountLabel: ${JSON.stringify(accountLabel)} }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script>
      <p>GitHub OAuth connected cleanly! You may close this window.</p>
    </body></html>`);
  } catch (err: any) {
    res.status(400).send(`<html><body><p>GitHub OAuth failed: ${err?.message || 'Error'}</p></body></html>`);
  }
});

app.post('/api/oauth/:provider/disconnect', (req, res) => {
  const provider = req.params.provider;
  if (provider === 'spotify') delete oauthTokenStore.spotify;
  if (provider === 'github') delete oauthTokenStore.github;
  res.json({ success: true });
});

// ============================================================================
// MODULAR SKILL & PLUGIN REGISTRY + CUSTOM PLUGIN INSTALLER + AGENTIC ROUTER
// ============================================================================

app.get('/api/skills', async (_req, res) => {
  try {
    await skillRegistry.autoDiscoverSkills();
    res.json({
      routerModel: 'gemini-decision-1',
      apiVersion: 'v1beta',
      confidenceThreshold: SKILL_ROUTER_CONFIDENCE_THRESHOLD,
      skills: skillRegistry.getMetadataList(),
      decisionCriteriaMap: skillRegistry.getDecisionCriteriaMap(),
      recentTraces: getRecentSkillTurnTraces(),
    });
  } catch (err: any) {
    console.error('Error fetching registered skills:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch skills registry' });
  }
});

app.post('/api/skills/install', async (req, res) => {
  try {
    await skillRegistry.autoDiscoverSkills();
    const spec = req.body || {};
    if (!spec.name || !spec.description || !spec.decision_criteria) {
      return res.status(400).json({
        error: 'Custom plugin requires "name", "description", and "decision_criteria".',
      });
    }
    const installed = skillRegistry.installCustomPlugin(spec);
    res.json({
      success: true,
      filePath: installed.filePath,
      skills: skillRegistry.getMetadataList(),
    });
  } catch (err: any) {
    console.error('Error installing custom plugin:', err);
    res.status(400).json({ error: err?.message || 'Failed to install custom plugin' });
  }
});

app.delete('/api/skills/:name', async (req, res) => {
  try {
    const removed = skillRegistry.uninstallCustomPlugin(req.params.name);
    if (!removed) {
      return res.status(404).json({ error: 'Custom plugin not found or cannot uninstall built-in skill.' });
    }
    res.json({
      success: true,
      skills: skillRegistry.getMetadataList(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to uninstall plugin' });
  }
});

app.post('/api/skills/route-and-execute', async (req, res) => {
  try {
    await skillRegistry.autoDiscoverSkills();
    const { input, utterance, confidenceThreshold, activeLanguage, toolOverride, confirmedAction } = req.body || {};
    const textInput = (typeof input === 'string' ? input : utterance) || '';
    if (!textInput.trim()) {
      return res.status(400).json({ error: 'A valid "input" or "utterance" string is required.' });
    }

    const authHeader = req.headers.authorization || '';
    const workspaceAccessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    const threshold =
      typeof confidenceThreshold === 'number'
        ? Math.max(0.05, Math.min(0.99, confidenceThreshold))
        : SKILL_ROUTER_CONFIDENCE_THRESHOLD;

    const trace = await executeAgenticVoiceTurn(textInput, {
      threshold,
      toolOverride,
      context: {
        activeLanguage: activeLanguage || 'English',
        workspaceAccessToken,
        confirmedAction: Boolean(confirmedAction),
        oauthTokens: {
          spotify: oauthTokenStore.spotify?.accessToken || null,
          github: oauthTokenStore.github?.accessToken || null,
        },
      },
    });

    res.json(trace);
  } catch (err: any) {
    console.error('Error in /api/skills/route-and-execute:', err);
    res.status(500).json({ error: err?.message || 'Failed to route and execute skill' });
  }
});

// Chat endpoint with memory integration, emotional state extraction & Decision 1.0 telemetry
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, memorySummary, slangLevel, languagePreference, currentMessage } = req.body;

    const systemInstruction = getAustralianPersonalityPrompt(memorySummary, slangLevel, languagePreference);

    // Format contents for Gemini
    const contents: any[] = [];
    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.text }],
        });
      }
    }

    if (currentMessage) {
      contents.push({
        role: 'user',
        parts: [{ text: currentMessage }],
      });
    }

    // Check if user is asking to search the web or trigger an interface action
    const lowerMsg = (currentMessage || '').toLowerCase();
    const wantsSearch = lowerMsg.includes('search') || lowerMsg.includes('google') || lowerMsg.includes('look up') || lowerMsg.includes('what is the weather') || lowerMsg.includes('latest news');

    // Call Gemini 3.8 Flash for conversation (with optional Google Search tool)
    let replyText = "Sorry mate, I got a bit lost in my thoughts for a second. What was that?";
    let webSearchResults: { title: string; url: string; snippet?: string }[] = [];
    let detectedAction: { type: string; param?: string } | null = null;

    try {
      const config: any = {
        systemInstruction,
      };

      if (wantsSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config,
      });

      if (response.text) {
        replyText = response.text;
      }

      // Extract Google Search grounding metadata if available
      const grounding = response.candidates?.[0]?.groundingMetadata;
      if (grounding && grounding.groundingChunks) {
        for (const chunk of grounding.groundingChunks) {
          if (chunk.web?.uri && chunk.web?.title) {
            webSearchResults.push({
              title: chunk.web.title,
              url: chunk.web.uri,
            });
          }
        }
      }
    } catch (apiErr: any) {
      console.warn('Gemini chat call transient error, using Australian empathy fallback:', apiErr?.message);
      const lower = (currentMessage || '').toLowerCase();
      if (lower.includes('cough') || lower.includes('throat') || lower.includes('crook') || lower.includes('sick')) {
        replyText = "Oh bless your heart, mate! That sounded like a nasty cough. Are you feeling crook? Please do me a favor: pop the kettle on for a hot cuppa lemon and honey, rug up warm, and don't you dare push yourself today. How long has your throat been giving you grief?";
      } else if (lower.includes('sigh') || lower.includes('tired') || lower.includes('overwhelm') || lower.includes('exhaust')) {
        replyText = "I felt that big sigh right from over here, mate. Sounds like you've been carrying the whole world on your shoulders today. Take a slow, deep breath with me. I'm right here in your corner—let's take things one step at a time.";
      } else if (lower.includes('laugh') || lower.includes('chuckle') || lower.includes('funny') || lower.includes('haha')) {
        replyText = "Haha, good on ya! Love hearing that laugh, mate—it's bloody infectious! What brought on that smile?";
      } else if (lower.includes('play music') || lower.includes('put on music') || lower.includes('play tunes') || lower.includes('chill music')) {
        replyText = "No worries at all, mate! Putting on some relaxing Aussie coastal sounds for you right now. Sit back and enjoy.";
        detectedAction = { type: 'play_music', param: 'Aussie Coastal Breeze' };
      } else if (lower.includes('pause music') || lower.includes('stop music')) {
        replyText = "Paused the music for you, mate.";
        detectedAction = { type: 'pause_music' };
      } else {
        replyText = "G'day mate! I'm right here with you, listening with all my heart. Tell me a bit more about what's going on—I've got all the time in the world for you.";
      }
    }

    // Direct interface command heuristics
    if (!detectedAction) {
      if (/(play|put on|start|turn on).*(music|tunes|song|acoustic|soundscape|coastal|waves|guitar)/i.test(lowerMsg) || (lowerMsg.includes('play') && lowerMsg.includes('music'))) {
        detectedAction = { type: 'play_music', param: lowerMsg.includes('ocean') || lowerMsg.includes('wave') ? 'Aussie Coastal Ocean Surf' : 'Byron Bay Sunset Chords' };
        if (!replyText.toLowerCase().includes('music') && !replyText.toLowerCase().includes('track') && !replyText.toLowerCase().includes('tunes')) {
          replyText = `Too easy, mate! Putting on some soothing tunes for you right now. Relax and enjoy.`;
        }
      } else if (/(pause|stop|mute|quiet|shut off).*(music|tunes|song|sound)/i.test(lowerMsg) || lowerMsg.includes('stop music')) {
        detectedAction = { type: 'pause_music' };
        if (!replyText.toLowerCase().includes('pause') && !replyText.toLowerCase().includes('stop')) {
          replyText = `Paused the music for you, mate.`;
        }
      } else if (/(resume|unpause|continue).*(music|tunes)/i.test(lowerMsg)) {
        detectedAction = { type: 'resume_music' };
      } else if (lowerMsg.includes('open terminal') || lowerMsg.includes('show terminal') || lowerMsg.includes('open console') || lowerMsg.includes('show logs')) {
        detectedAction = { type: 'open_terminal' };
      } else if (lowerMsg.includes('close terminal') || lowerMsg.includes('hide terminal')) {
        detectedAction = { type: 'close_terminal' };
      } else if (lowerMsg.includes('open memories') || lowerMsg.includes('show memories') || lowerMsg.includes('memory bank')) {
        detectedAction = { type: 'open_memories' };
      } else if (lowerMsg.includes('open advice') || lowerMsg.includes('show advice') || lowerMsg.includes('advice journal')) {
        detectedAction = { type: 'open_advice' };
      } else if (
        lowerMsg.includes('decision engine') ||
        lowerMsg.includes('open decision') ||
        lowerMsg.includes('gemini decision')
      ) {
        detectedAction = { type: 'open_decision_engine' };
      } else if (wantsSearch) {
        detectedAction = { type: 'web_search', param: currentMessage };
      }
    }

    // Run parallel NLP extraction for feelings, acoustics, memories, and advice
    let newMemories: any[] = [];
    let adviceHighlight: string | null = null;
    let emotion = 'warm & caring';
    let feelingsDescription = "Holding space with friendly Australian warmth and attentiveness.";
    let userMood = 'reflective';
    let detectedAcoustics: string[] = [];

    try {
      const memoryExtractionResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze this conversational exchange between the User and their Australian friend Tilly (Matilda).
User input: "${currentMessage || ''}"
Tilly replied: "${replyText}"

Perform deep emotional & acoustic perception:
1. Did the user input contain any acoustic or physical cues such as coughs, sighs, clearing throat, yawns, laughing, sniffles, tired voice? (e.g. "[coughs]", "[sighs]", or implied cough/sickness/fatigue).
2. What is the user's emotional/physical state? (e.g., unwell/coughing, exhausted, stressed, joyful, heartbroken, seeking comfort, relaxed).
3. What is Tilly feeling in her heart right now? Describe in 1 compassionate sentence (e.g. "Concerned about your harsh cough and wanting you to rest up with a cuppa", "Touched by your vulnerability", "Bursting with shared laughter").
4. Tilly's primary emotional demeanor (e.g., Caring & Concerned, Deeply Touched, Joyful & Playful, Soothing Comfort, Thoughtful & Grounded).
5. Any permanent facts or memories learned about the user.
6. Any meaningful piece of advice Tilly gave.

Return valid JSON:
{
  "detectedAcoustics": ["cough", "sigh", "chuckle", "yawn", "sniffle", "tiredness"],
  "userMood": "short user mood string",
  "emotion": "short Tilly emotion label",
  "feelingsDescription": "1-sentence heart-to-heart feeling from Tilly",
  "adviceHighlight": "string or null",
  "newMemories": [
    {
      "category": "personal" | "relationship" | "goal" | "preference" | "struggle" | "inside_joke",
      "fact": "concise fact statement",
      "importance": "high" | "medium" | "low"
    }
  ]
}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedAcoustics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              userMood: { type: Type.STRING },
              emotion: { type: Type.STRING },
              feelingsDescription: { type: Type.STRING },
              adviceHighlight: { type: Type.STRING },
              newMemories: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    fact: { type: Type.STRING },
                    importance: { type: Type.STRING },
                  },
                  required: ['category', 'fact'],
                },
              },
            },
            required: ['emotion', 'feelingsDescription', 'userMood', 'newMemories'],
          },
        },
      });

      if (memoryExtractionResponse.text) {
        const parsed = JSON.parse(memoryExtractionResponse.text.trim());
        newMemories = parsed.newMemories || [];
        adviceHighlight = parsed.adviceHighlight || null;
        emotion = parsed.emotion || 'warm & caring';
        feelingsDescription = parsed.feelingsDescription || feelingsDescription;
        userMood = parsed.userMood || 'reflective';
        detectedAcoustics = parsed.detectedAcoustics || [];
      }
    } catch (e) {
      console.warn('Memory and emotion extraction error:', e);
      const lower = (currentMessage || '').toLowerCase();
      if (lower.includes('cough') || lower.includes('throat') || lower.includes('crook')) {
        emotion = 'concerned & caring';
        feelingsDescription = 'Worried about your harsh cough and wishing you rest.';
        userMood = 'under the weather';
        detectedAcoustics = ['cough'];
      } else if (lower.includes('sigh') || lower.includes('heavy')) {
        emotion = 'empathetic & soothing';
        feelingsDescription = 'Deeply sensing the heavy weight you are carrying.';
        userMood = 'exhausted & overwhelmed';
        detectedAcoustics = ['sigh'];
      } else if (lower.includes('laugh') || lower.includes('chuckle')) {
        emotion = 'joyful & laughing';
        feelingsDescription = 'Sharing a hearty chuckle with you.';
        userMood = 'cheerful & amused';
        detectedAcoustics = ['laughter'];
      } else if (lower.includes('yawn')) {
        emotion = 'gentle & caring';
        feelingsDescription = 'Noticing how exhausted you sound and wanting you to recharge.';
        userMood = 'tired & sleepy';
        detectedAcoustics = ['yawn'];
      }
    }

    const decisionTelemetry = await runGeminiDecision1({
      input: currentMessage || '',
      mode: 'full_cognitive',
      context: {
        detectedAcoustics,
        userMood,
        activeLanguage: languagePreference && languagePreference !== 'auto' ? languagePreference : 'English',
        memorySummary,
        slangLevel,
      },
    });
    if (detectedAction && !decisionTelemetry.recommendedAction.uiAction) {
      decisionTelemetry.recommendedAction.uiAction = detectedAction;
    } else if (!detectedAction && decisionTelemetry.recommendedAction.uiAction && decisionTelemetry.confidenceGate.passed) {
      detectedAction = decisionTelemetry.recommendedAction.uiAction;
    }

    res.json({
      replyText,
      newMemories,
      adviceHighlight,
      emotion,
      feelingsDescription,
      userMood,
      detectedAcoustics,
      uiAction: detectedAction,
      webSearchResults,
      decisionTelemetry,
    });
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: error.message || 'Failed to generate chat response' });
  }
});

// Audio Text-to-Speech endpoint (Gemini Flash Lite TTS)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, slangLevel } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    // Generate speech using gemini-3.8-flash-lite-tts
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text,
              speechMetadata: {
                style: 'Warm, friendly 28-year-old Australian female voice, soothing melodic cadence, natural caring mate tone',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            // 'Kore' provides a warm, natural female timbre
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'No audio generated by model' });
    }

    res.json({
      audio: base64Audio,
      mimeType: 'audio/pcm;rate=24000',
      sampleRate: 24000,
    });
  } catch (error: any) {
    console.error('Error in /api/tts:', error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
});

// Audio Transcription & Acoustic Cue Detection (Gemini 3.8 Flash)
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: audio,
            },
          },
          {
            text: `Listen attentively to this voice audio clip.
CRITICAL REQUIREMENTS:
1. Transcribe the spoken words accurately.
2. In addition to spoken words, DETECT AND INCLUDE physical/acoustic sounds in brackets within the transcript:
   - Coughing or throat clearing: [coughs] or [clears throat]
   - Heavy sigh or deep breath: [sighs deeply]
   - Sniffling, congestion, runny nose: [sniffles]
   - Laughter, giggles, chuckles: [laughs] or [chuckles]
   - Yawns or groaning: [yawns]
   - Shaky/trembling voice or crying: [voice trembling] or [crying]
If the user ONLY coughed, sighed, laughed, or snuffled without saying words, output that cue (e.g. "[coughs]" or "[sighs]").
If there is complete silence or only static, output empty string.

Return valid JSON:
{
  "transcript": "Transcribed text including bracketed acoustic cues (e.g., '[coughs] G\\'day Tilly' or '[sighs deeply]')",
  "acousticCues": ["cough", "sigh", "chuckle", "sniffle", "yawn", "trembling_voice", "clearing_throat"],
  "userMood": "short user mood descriptor"
}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    let transcript = '';
    let acousticCues: string[] = [];
    let userMood = '';

    if (response.text) {
      try {
        const parsed = JSON.parse(response.text.trim());
        transcript = parsed.transcript || '';
        acousticCues = parsed.acousticCues || [];
        userMood = parsed.userMood || '';
      } catch (e) {
        transcript = response.text.trim();
      }
    }

    res.json({
      transcript,
      acousticCues,
      userMood,
    });
  } catch (error: any) {
    console.error('Error in /api/transcribe:', error);
    // Fallback to gemini-3.5-transcribe if needed
    try {
      const fallback = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            { inlineData: { mimeType: req.body.mimeType || 'audio/webm', data: req.body.audio } },
            { text: 'Transcribe this voice audio accurately. Include any coughs or sighs in brackets if heard.' },
          ],
        },
      });
      res.json({ transcript: fallback.text?.trim() || '', acousticCues: [], userMood: '' });
    } catch (e2) {
      res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
    }
  }
});

// Dynamic Language Detection endpoint: detects spoken language from audio stream and/or transcripts
app.post('/api/detect-language', async (req, res) => {
  try {
    const { transcript, audio, explicitLanguage } = req.body;

    // 1. If explicit language is prioritized and user didn't ask to switch, respect it
    if (explicitLanguage && explicitLanguage !== 'auto' && !transcript) {
      const meta = LANGUAGE_METADATA[explicitLanguage] || LANGUAGE_METADATA.English;
      return res.json({
        language: meta.name,
        code: meta.code,
        bcp47: meta.bcp47,
        isExplicit: true,
        confidence: 1.0,
      });
    }

    // 2. If transcript is available, run fast transcript & explicit command detection
    if (transcript && typeof transcript === 'string' && transcript.trim().length > 0) {
      const result = detectLanguageFromTranscript(transcript, explicitLanguage);
      return res.json(result);
    }

    // 3. If audio is provided (base64 PCM 16kHz)
    if (audio && typeof audio === 'string') {
      try {
        const aiResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=16000',
                data: audio,
              },
            },
            {
              text: 'Listen to this spoken audio. Identify what language is being spoken (e.g. Spanish, French, German, Hindi, Japanese, Italian, Portuguese, Arabic, Mandarin Chinese, Russian, English). Also check if the user is explicitly asking to speak a specific language. Return strictly JSON: {"language": "Spanish", "code": "es", "isExplicit": false, "confidence": 0.95}',
            },
          ],
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = JSON.parse(aiResponse.text || '{}');
        if (parsed.language && LANGUAGE_METADATA[parsed.language]) {
          const meta = LANGUAGE_METADATA[parsed.language];
          return res.json({
            language: meta.name,
            code: meta.code,
            bcp47: meta.bcp47,
            isExplicit: !!parsed.isExplicit,
            confidence: parsed.confidence || 0.95,
          });
        }
      } catch (audioErr) {
        console.warn('Audio language detection fallback:', audioErr);
      }
    }

    // Fallback default
    const fallbackMeta = (explicitLanguage && LANGUAGE_METADATA[explicitLanguage]) || LANGUAGE_METADATA.English;
    res.json({
      language: fallbackMeta.name,
      code: fallbackMeta.code,
      bcp47: fallbackMeta.bcp47,
      isExplicit: !!(explicitLanguage && explicitLanguage !== 'auto'),
      confidence: 0.8,
    });
  } catch (error: any) {
    console.error('Error in /api/detect-language:', error);
    res.status(500).json({ error: error?.message || 'Language detection failed' });
  }
});

// Deep Memory Synthesis endpoint: Synthesizes existing memories into cohesive friendship profile
app.post('/api/memories/synthesize', async (req, res) => {
  try {
    const { memories } = req.body;
    if (!memories || !Array.isArray(memories) || memories.length === 0) {
      return res.json({ summary: 'No memories yet.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `You are Matilda's internal memory processing system.
Given these raw memories and facts known about the user:
${JSON.stringify(memories, null, 2)}

Create an intimate, coherent friendship synthesis summarizing:
1. Who the user is (personality, passions, daily life).
2. Key people and relationships in their life.
3. What they've been going through lately / challenges.
4. Best advice and supportive themes Tilly has shared with them.

Keep it warm, structured, and bullet-pointed for quick context injection.`,
    });

    res.json({
      summary: response.text?.trim() || '',
    });
  } catch (error: any) {
    console.error('Error synthesizing memories:', error);
    res.status(500).json({ error: error.message || 'Failed to synthesize memories' });
  }
});

// WebSocket Server for Gemini Live API (gemini-3.8-live)
const wss = new WebSocketServer({ server, path: '/api/live-ws' });

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Client connected to Live Voice WebSocket');
  let liveSession: any = null;
  let isConnected = false;
  let sessionWorkspaceToken: string | null = null;
  let sessionLanguage = 'English';
  let liveTranscriptBuffer = '';
  let liveTurnFlushTimer: any = null;
  let lastHandledVoiceText = '';
  let lastHandledVoiceTime = 0;

  const runLiveVoiceTurn = async (transcriptRaw: string, overrideToken?: string | null) => {
    const transcript = transcriptRaw.trim();
    if (!transcript || transcript.length < 3) return;
    const now = Date.now();
    if (
      transcript.toLowerCase() === lastHandledVoiceText.toLowerCase() &&
      now - lastHandledVoiceTime < 2200
    ) {
      return;
    }
    lastHandledVoiceText = transcript;
    lastHandledVoiceTime = now;

    try {
      await skillRegistry.autoDiscoverSkills();
      const trace = await executeAgenticVoiceTurn(transcript, {
        threshold: SKILL_ROUTER_CONFIDENCE_THRESHOLD,
        context: {
          activeLanguage: sessionLanguage || 'English',
          workspaceAccessToken: overrideToken ?? sessionWorkspaceToken,
          oauthTokens: {
            spotify: oauthTokenStore.spotify?.accessToken || null,
            github: oauthTokenStore.github?.accessToken || null,
          },
          onFillerTriggered: (fillerPhrase: string) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'skill_filler',
                  skillName: 'agent_router',
                  toolName: 'executing',
                  fillerText: fillerPhrase,
                })
              );
            }
          },
        },
      });

      if (trace.routingDecision.skillLoaded && trace.toolResult?.voiceSummary && liveSession && isConnected) {
        const livePrompt = `[SKILL PLUGIN FUNCTION_RESPONSE (${trace.toolCall?.skillName}.${trace.toolCall?.toolName})]:\nArguments: ${JSON.stringify(
          trace.toolCall?.args || {}
        )}\nResult: ${trace.toolResult.voiceSummary}\nInstruction: Speak this confirmation naturally, warmly, and concisely (1-2 sentences) to the user right now in ${sessionLanguage}.`;

        try {
          if (typeof liveSession.sendClientContent === 'function') {
            liveSession.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: livePrompt }] }],
              turnComplete: true,
            });
          } else if (typeof liveSession.sendRealtimeInput === 'function') {
            liveSession.sendRealtimeInput({ text: livePrompt });
          }
        } catch (liveInjectErr) {
          console.error('Error injecting skill function_response into Live session:', liveInjectErr);
        }
      }

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'skill_turn_trace',
            trace,
          })
        );
      }
    } catch (routeErr) {
      console.error('Error routing live voice_turn:', routeErr);
    }
  };

  clientWs.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'update_auth') {
        sessionWorkspaceToken = msg.workspaceAccessToken || null;
      } else if (msg.type === 'init') {
        sessionWorkspaceToken = msg.workspaceAccessToken || null;
        if (msg.languagePreference && msg.languagePreference !== 'auto') {
          sessionLanguage = msg.languagePreference;
        }
        await skillRegistry.autoDiscoverSkills();
        const activeSkillList = skillRegistry
          .getAllSkills()
          .map((s) => `- ${s.name}: ${s.description}`)
          .join('\n');

        // Initialize Gemini Live connection with agentic tools + audio transcription
        const systemInstruction =
          getAustralianPersonalityPrompt(
            msg.memorySummary || '',
            msg.slangLevel || 'everyday',
            msg.languagePreference || 'auto'
          ) +
          `
CRITICAL AGENTIC VOICE & TOOL EXECUTION INSTRUCTIONS:
- You are Sofia / Matilda (Tilly), a truly AGENTIC voice companion and assistant.
- Whenever the user gives a voice command or asks you to do something (search the web/weather/news, play/pause/skip Spotify music, check Google Calendar/Gmail/Tasks/Drive, search GitHub, take a note, do math, or trigger an installed custom plugin), ACTIVELY CALL THE APPROPRIATE TOOL right away!
- Never pretend to execute a tool without calling the function declaration first.
- Registered Skill Plugins currently available to you:
${activeSkillList}
- Keep turns conversational and concise (1-3 sentences) so the user can interact like on a natural voice call.
- Respond warmly to physical acoustic sounds (cough, sigh, throat clear, laughter) in whichever language the user speaks.`;

        try {
          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: skillRegistry.getAllToolDeclarations() }],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
              systemInstruction,
            },
            callbacks: {
              onmessage: (serverMsg: LiveServerMessage) => {
                if (serverMsg.serverContent?.modelTurn?.parts) {
                  for (const part of serverMsg.serverContent.modelTurn.parts) {
                    if (part.text && clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({ type: 'text', text: part.text }));
                    }
                    if (part.inlineData?.data && clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({ type: 'audio', audio: part.inlineData.data }));
                    }
                  }
                }

                // Capture live input audio transcription directly from Gemini Live stream
                const inputTranscript = (serverMsg.serverContent as any)?.inputTranscription?.text;
                if (typeof inputTranscript === 'string' && inputTranscript.trim()) {
                  liveTranscriptBuffer = `${liveTranscriptBuffer} ${inputTranscript}`.trim();
                  if (liveTurnFlushTimer) clearTimeout(liveTurnFlushTimer);
                  liveTurnFlushTimer = setTimeout(() => {
                    const buffered = liveTranscriptBuffer;
                    liveTranscriptBuffer = '';
                    if (buffered) {
                      runLiveVoiceTurn(buffered);
                    }
                  }, 1100);
                }

                if (serverMsg.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'interrupted' }));
                }

                if (serverMsg.serverContent?.turnComplete && clientWs.readyState === WebSocket.OPEN) {
                  if (liveTranscriptBuffer.trim()) {
                    const buffered = liveTranscriptBuffer;
                    liveTranscriptBuffer = '';
                    if (liveTurnFlushTimer) {
                      clearTimeout(liveTurnFlushTimer);
                      liveTurnFlushTimer = null;
                    }
                    runLiveVoiceTurn(buffered);
                  }
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                }

                // Voice-First Execution Loop: Handle native Gemini Live toolCall events directly
                const functionCalls = (serverMsg as any).toolCall?.functionCalls;
                if (Array.isArray(functionCalls) && functionCalls.length > 0) {
                  (async () => {
                    for (const fc of functionCalls) {
                      const toolName = fc.name || 'web_search';
                      const toolArgs = (fc.args as Record<string, any>) || {};
                      const matchedSkill = skillRegistry.getSkillByToolName(toolName);
                      const skillName = matchedSkill?.name || 'web_search';
                      let spokenFiller: string | null = null;

                      const execRes = await skillRegistry.executeTool(toolName, toolArgs, {
                        userInput: JSON.stringify(toolArgs),
                        activeLanguage: sessionLanguage || 'English',
                        workspaceAccessToken: sessionWorkspaceToken,
                        oauthTokens: {
                          spotify: oauthTokenStore.spotify?.accessToken || null,
                          github: oauthTokenStore.github?.accessToken || null,
                        },
                        onFillerTriggered: (fillerPhrase: string) => {
                          spokenFiller = fillerPhrase;
                          if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(
                              JSON.stringify({
                                type: 'skill_filler',
                                skillName,
                                toolName,
                                fillerText: fillerPhrase,
                              })
                            );
                          }
                        },
                      });

                      try {
                        if (typeof liveSession?.sendToolResponse === 'function') {
                          liveSession.sendToolResponse({
                            functionResponses: [
                              {
                                id: fc.id,
                                name: toolName,
                                response: {
                                  result: execRes.voiceSummary,
                                  data: execRes.data,
                                },
                              },
                            ],
                          });
                        } else if (typeof liveSession?.sendClientContent === 'function') {
                          liveSession.sendClientContent({
                            turns: [
                              {
                                role: 'user',
                                parts: [
                                  {
                                    text: `[TOOL FUNCTION RESPONSE (${skillName}.${toolName})]: ${execRes.voiceSummary}. Speak this confirmation naturally and warmly right now.`,
                                  },
                                ],
                              },
                            ],
                            turnComplete: true,
                          });
                        }
                      } catch (respErr) {
                        console.error('Error sending tool response to Live session:', respErr);
                      }

                      const trace: VoiceSkillTurnTrace = {
                        traceId: `live-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        timestamp: new Date().toISOString(),
                        userInput: `[Live Tool Call] ${toolName}(${JSON.stringify(toolArgs)})`,
                        routingDecision: {
                          decisionId: `dec-live-${Date.now()}`,
                          timestamp: new Date().toISOString(),
                          model: 'gemini-decision-1',
                          apiVersion: 'v1beta',
                          input: `[Live Tool Call] ${toolName}`,
                          selectedChoice: skillName,
                          confidence: 0.96,
                          threshold: SKILL_ROUTER_CONFIDENCE_THRESHOLD,
                          probabilities: { [skillName]: 0.96, general_chat: 0.03, ignore_noise: 0.01 },
                          skillLoaded: skillName,
                          attachedTools: matchedSkill?.tool_declarations || [],
                          fillerPhrase: matchedSkill?.filler_phrase || null,
                          outputTokens: 0,
                          inputTokens: 48,
                          latencyMs: execRes.executionTimeMs,
                          reason: `Live session invoked ${skillName}.${toolName} directly`,
                        },
                        spokenFiller: spokenFiller || matchedSkill?.filler_phrase || null,
                        toolCall: {
                          skillName,
                          toolName,
                          args: toolArgs,
                        },
                        toolResult: execRes,
                      };

                      recordSkillTurnTrace(trace);
                      if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: 'skill_turn_trace', trace }));
                      }
                    }
                  })();
                }
              },
              onclose: () => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'status', status: 'closed' }));
                }
                isConnected = false;
              },
              onerror: (err: any) => {
                console.error('Gemini Live session error:', err);
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Live session error' }));
                }
              },
            },
          });

          isConnected = true;
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'ready' }));
          }
        } catch (err: any) {
          console.error('Failed to connect to Live API:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Failed to start Live API' }));
          }
        }
      } else if (msg.type === 'audio' && msg.audio && liveSession && isConnected) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          console.error('Error sending audio to Live session:', err);
        }
      } else if (msg.type === 'voice_turn' && msg.transcript) {
        if (msg.activeLanguage) sessionLanguage = msg.activeLanguage;
        if (msg.workspaceAccessToken) sessionWorkspaceToken = msg.workspaceAccessToken;
        runLiveVoiceTurn(String(msg.transcript), msg.workspaceAccessToken || null);
      } else if (msg.type === 'text' && msg.text && liveSession && isConnected) {
        // Text prompt to Live session
        try {
          if (typeof liveSession.sendClientContent === 'function') {
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: msg.text }],
                },
              ],
              turnComplete: true,
            });
          } else if (typeof liveSession.sendRealtimeInput === 'function') {
            liveSession.sendRealtimeInput({
              text: msg.text,
            });
          } else if (typeof liveSession.send === 'function') {
            liveSession.send({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: msg.text }],
                  },
                ],
                turnComplete: true,
              },
            });
          }
        } catch (err) {
          console.error('Error sending text to Live session:', err);
        }
      } else if (msg.type === 'update_language' && msg.language && liveSession && isConnected) {
        // Dynamically update the Gemini Live system prompt context to the detected or requested language
        const targetLanguage = msg.language;
        const isExplicit = !!msg.isExplicit;
        console.log(`[Live WS] Updating Live session language directive: ${targetLanguage} (explicit: ${isExplicit})`);

        try {
          const directiveText = `[SYSTEM CONTEXT UPDATE - LANGUAGE DIRECTIVE]: The user is speaking in ${targetLanguage}${isExplicit ? ' (explicitly requested by user)' : ''}. From now on, you MUST consistently reply and converse entirely in ${targetLanguage}. Maintain Matilda's warm, supportive, authentic personality, but do NOT mix languages or switch back to English unless the user speaks English or asks to switch.`;

          if (typeof liveSession.sendClientContent === 'function') {
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: directiveText }],
                },
              ],
              turnComplete: isExplicit,
            });
          } else if (typeof liveSession.sendRealtimeInput === 'function') {
            liveSession.sendRealtimeInput({
              text: directiveText,
            });
          }

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'language_updated',
                language: targetLanguage,
                isExplicit,
              })
            );
          }
        } catch (err) {
          console.error('Error updating live session language context:', err);
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  clientWs.on('close', () => {
    console.log('Client disconnected from Live Voice WebSocket');
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {
        // ignore
      }
    }
  });
});

// Mount Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Australian Voice Companion Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
