// AI service for generating lesson content with Gemini or Anthropic.
// Falls back to high-yield local NLP algorithms when AI providers are unavailable.
const { cleanPdfText, extractAndCleanPdf, computeTextStats } = require('./pdfService');
const https = require('https');
const stripBoilerplate = (text = '') => {
  if (!text) return '';
  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = t.split('\n');
  const counts = new Map();
  for (const l of lines) {
    const k = l.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (k.length < 20) continue;
    const parts = k.split(' ').filter(Boolean);
    if (parts.length < 5) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const repeat = new Set([...counts.entries()].filter(([, c]) => c >= 3).map(([k]) => k));
  t = lines
    .filter((l) => {
      const k = l.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (repeat.has(k)) return false;
      if (/^(in god we trust|rest we bring)/i.test(l)) return false;
      return true;
    })
    .join('\n');
  // Remove any remaining exact watermark lines
  t = t.replace(/^\s*in god we trust.*$/gim, '').replace(/^\s*the rest we bring.*$/gim, '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
};

// Load provider SDKs dynamically so local fallbacks still work without AI packages.
let GoogleGenAI = null;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch (e) {
  GoogleGenAI = null;
}

const hasGemini = () => Boolean(process.env.GEMINI_API_KEY && GoogleGenAI);
const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);

const getModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const getClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const normalizeProvider = (provider = 'gemini') => {
  const normalized = String(provider).toLowerCase();
  if (!['gemini', 'anthropic'].includes(normalized)) {
    throw new Error('AI provider must be either gemini or anthropic');
  }
  return normalized;
};

const assertAnthropicConfigured = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error('Anthropic is selected but ANTHROPIC_API_KEY is not configured in the backend environment');
    error.statusCode = 503;
    throw error;
  }
};

const generateWithAnthropic = async ({ text, system, maxTokens, temperature = 0.4 }) => {
  const payload = JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: text }],
  });

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };

  // Workspace-scoped API keys require the target workspace to be specified.
  if (process.env.ANTHROPIC_WORKSPACE_ID) {
    headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
  }

  const response = await new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers,
      timeout: 60000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (error) {
          reject(new Error(`Anthropic returned invalid JSON (HTTP ${res.statusCode})`));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(parsed.error?.message || `Anthropic request failed (HTTP ${res.statusCode})`));
          return;
        }
        resolve(parsed);
      });
    });

    request.on('timeout', () => request.destroy(new Error('Anthropic request timed out')));
    request.on('error', reject);
    request.end(payload);
  });

  return (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
};

const parseJsonResponse = (text, kind) => {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const match = kind === 'array'
    ? cleaned.match(/\[[\s\S]*\]/)
    : cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
};

// Extract text from a PDF buffer (using robust pdfService cleaning)
const extractTextFromPdf = async (buffer) => {
  const res = await extractAndCleanPdf(buffer);
  return res.cleanText || res.rawText || '';
};

// ── NLP Stop Words & Utility ────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'were',
  'weren\'t', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours',
]);

const tokenizeSentences = (text = '') => {
  if (!text) return [];
  const cleaned = cleanPdfText(text);
  const rawSentences = cleaned.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]{20,}(?:\n+|$)/g) || [cleaned];
  return rawSentences
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 15 && s.split(/\s+/).length >= 4);
};

// Build word frequency table (excluding stop words)
const buildWordFrequencies = (text = '') => {
  const words = (text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
  const freq = new Map();
  for (const w of words) {
    if (!STOP_WORDS.has(w)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return freq;
};

// Score sentence based on content word frequency, length penalty, and position bonus
const scoreSentence = (sentence, freqMap, index, totalSentences) => {
  const words = (sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
  if (words.length === 0) return 0;

  let score = 0;
  for (const w of words) {
    score += (freqMap.get(w) || 0);
  }

  // Length normalization (ideal sentence length: 8 - 25 words)
  const len = words.length;
  const lengthFactor = len >= 8 && len <= 28 ? 1.2 : len < 6 || len > 40 ? 0.6 : 1.0;

  // Position bonus: first 15% of document or early paragraph sentence receives a boost
  const positionFactor = index < Math.max(3, totalSentences * 0.15) ? 1.25 : 1.0;

  // Key pedagogy indicators bonus
  const hasPedagogicalKeyword = /\b(learn|understand|objective|important|define|definition|example|remember|concept|process|rule|function)\b/i.test(sentence);
  const pedagogyBonus = hasPedagogicalKeyword ? 1.3 : 1.0;

  return (score / Math.sqrt(len)) * lengthFactor * positionFactor * pedagogyBonus;
};

// ── Smart Pedagogical Text Compression ──────────────────────────────────────
/**
 * Compresses large educational text down to high-salience concepts
 * without arbitrary blind truncation.
 */
const compressEducationalText = (rawText = '', maxChars = 14000) => {
  const cleaned = cleanPdfText(rawText);
  if (cleaned.length <= maxChars) return cleaned;

  // When text exceeds maxChars, perform intelligent sentence extraction
  const sentences = tokenizeSentences(cleaned);
  if (sentences.length <= 10) return cleaned.slice(0, maxChars);

  const freqMap = buildWordFrequencies(cleaned);
  const scored = sentences.map((sentence, idx) => ({
    sentence,
    originalIndex: idx,
    score: scoreSentence(sentence, freqMap, idx, sentences.length),
  }));

  // Sort by score descending to pick top informative sentences
  scored.sort((a, b) => b.score - a.score);

  // Take top sentences that fit within maxChars
  const selected = [];
  let currentLen = 0;
  for (const item of scored) {
    if (currentLen + item.sentence.length + 2 <= maxChars) {
      selected.push(item);
      currentLen += item.sentence.length + 2;
    }
  }

  // Re-order selected sentences chronologically to preserve discourse coherence
  selected.sort((a, b) => a.originalIndex - b.originalIndex);
  return selected.map((s) => s.sentence).join(' ');
};

// ── Local Fallback Summarizer (TF-IDF / Frequency-Weighted Extractive) ───────
const localSummarize = (text) => {
  const cleaned = stripBoilerplate(cleanPdfText(text));
  if (!cleaned) return 'No content available for this lesson.';

  const sentences = tokenizeSentences(cleaned);
  if (sentences.length === 0) return cleaned.slice(0, 300);
  if (sentences.length <= 4) return sentences.join(' ');

  const freqMap = buildWordFrequencies(cleaned);
  const scored = sentences.map((sentence, idx) => ({
    sentence,
    originalIndex: idx,
    score: scoreSentence(sentence, freqMap, idx, sentences.length),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topSentences = scored.slice(0, 5);
  topSentences.sort((a, b) => a.originalIndex - b.originalIndex);

  return topSentences.map((s) => s.sentence).join(' ');
};

// ── Local Fallback Study Notes Generator ────────────────────────────────────
const localStudyNotes = (text) => {
  const cleaned = stripBoilerplate(cleanPdfText(text));
  if (!cleaned) return { overview: '', keyPoints: [], vocabulary: [], keyFacts: [] };

  const sentences = tokenizeSentences(cleaned);
  const freqMap = buildWordFrequencies(cleaned);

  // 1. Overview: first 1-2 prominent sentences
  const overview = sentences.slice(0, 2).join(' ').slice(0, 320) || 'Overview of this lesson.';

  // 2. Key Points: top scored sentences across text
  const scored = sentences.map((sentence, idx) => ({
    sentence,
    originalIndex: idx,
    score: scoreSentence(sentence, freqMap, idx, sentences.length),
  }));
  scored.sort((a, b) => b.score - a.score);
  const keyPoints = scored
    .slice(0, 6)
    .map((s) => s.sentence.replace(/^[0-9]+[.)]\s*/, '').trim().slice(0, 220));

  // 3. Vocabulary: extract genuine definition patterns
  const vocabulary = [];
  const seenTerms = new Set();
  const definitionPatterns = [
    // Pattern: Term is defined as / is a / means / refers to ...
    /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Za-z]+){0,2})\s+(?:is defined as|refers to|means|is called|is a type of|describes)\s+([^.;:\n]{10,120})/g,
    // Pattern: Term: definition
    /(?:^|\n)\s*([A-Z][a-zA-Z]{2,}(?:\s+[A-Za-z]+){0,2})\s*:\s*([^.\n]{10,140})/g,
  ];

  for (const pat of definitionPatterns) {
    let m;
    while ((m = pat.exec(cleaned)) !== null && vocabulary.length < 6) {
      const term = m[1].trim();
      const lower = term.toLowerCase();
      const invalidWords = ['chapter', 'lesson', 'unit', 'the', 'this', 'that', 'these', 'primary', 'rwanda', 'topic', 'page'];
      if (!seenTerms.has(lower) && !invalidWords.includes(lower) && term.length >= 3) {
        seenTerms.add(lower);
        vocabulary.push({
          term,
          definition: m[2].trim().replace(/\s+/g, ' '),
        });
      }
    }
  }

  // Fallback vocabulary if specific syntax wasn't found: high-frequency proper keywords
  if (vocabulary.length < 3) {
    const sortedKeywords = [...freqMap.entries()]
      .filter(([w]) => w.length >= 4 && !['lesson', 'chapter', 'primary', 'questions', 'activities'].includes(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [kw] of sortedKeywords) {
      if (vocabulary.length >= 5) break;
      if (!seenTerms.has(kw)) {
        seenTerms.add(kw);
        // Find a sentence containing this keyword to extract context definition
        const containing = sentences.find((s) => new RegExp(`\\b${kw}\\b`, 'i').test(s));
        const def = containing ? containing.slice(0, 100) : `A key topic explored in this chapter.`;
        vocabulary.push({
          term: kw.charAt(0).toUpperCase() + kw.slice(1),
          definition: def,
        });
      }
    }
  }

  // 4. Key Facts: sentences containing factual numbers, rules, or measurements
  const keyFacts = sentences
    .filter((s) => /\b(?:\d+|percent|always|never|every|must|first|essential|composed of|measured in)\b/i.test(s))
    .slice(0, 4)
    .map((s) => s.slice(0, 180));

  if (keyFacts.length === 0) {
    keyFacts.push(...scored.slice(6, 9).map((s) => s.sentence.slice(0, 160)));
  }

  return {
    overview,
    keyPoints: keyPoints.length > 0 ? keyPoints : [overview],
    vocabulary,
    keyFacts,
  };
};

// ── Local Fallback Quiz Generator (Pedagogically Valid Distractors) ─────────
const localGenerateQuiz = (text) => {
  const cleaned = stripBoilerplate(cleanPdfText(text));
  if (!cleaned) return [];

  const sentences = tokenizeSentences(cleaned);
  if (sentences.length === 0) return [];

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const notes = localStudyNotes(cleaned);
  const questions = [];

  // Pool of candidate terms and concept answers for generating realistic distractors
  const termPool = new Set();
  (notes.vocabulary || []).forEach((v) => termPool.add(v.term));

  // Extract additional noun candidates from sentences
  const nounMatches = cleaned.match(/\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,})?\b/g) || [];
  nounMatches.forEach((n) => {
    if (!['Chapter', 'Lesson', 'Primary', 'Teacher', 'Page', 'Exercise', 'Activity'].includes(n)) {
      termPool.add(n);
    }
  });

  const allTerms = [...termPool];

  // 1. Generate Definition / Vocabulary Questions
  for (const item of (notes.vocabulary || [])) {
    if (questions.length >= 4) break;
    const correctOption = item.term;
    const distractors = allTerms
      .filter((t) => t.toLowerCase() !== correctOption.toLowerCase())
      .slice(0, 10);

    const pickedDistractors = shuffle(distractors).slice(0, 3);
    if (pickedDistractors.length < 3) continue;

    const options = shuffle([correctOption, ...pickedDistractors]);
    questions.push({
      question: `Which of the following terms describes: "${item.definition}"?`,
      options,
      correctIndex: options.indexOf(correctOption),
      explanation: `${correctOption} refers to: ${item.definition}`,
    });
  }

  // 2. Generate Cloze / Principle Completion Questions
  const informativeSentences = (notes.keyPoints || []).concat(notes.keyFacts || []);
  for (const sentence of informativeSentences) {
    if (questions.length >= 4) break;

    // Look for definitions or key assertions: "X is ...", "X can be used to ..."
    const verbMatch = sentence.match(/\b(is|are|means|helps to|allows us to|consists of|contains)\s+([^.,;]+)/i);
    if (!verbMatch) continue;

    const keyPredicate = verbMatch[2].trim();
    if (keyPredicate.length < 6 || keyPredicate.length > 70) continue;

    const correctOption = keyPredicate;
    // Pick other sentence fragments as distractors
    const candidateDistractors = sentences
      .filter((s) => s !== sentence)
      .map((s) => {
        const m = s.match(/\b(?:is|are|means|helps to|consists of|contains)\s+([^.,;]+)/i);
        return m ? m[2].trim() : null;
      })
      .filter(Boolean)
      .filter((d) => d.toLowerCase() !== correctOption.toLowerCase() && d.length >= 5 && d.length <= 80);

    const pickedDistractors = shuffle(candidateDistractors).slice(0, 3);
    if (pickedDistractors.length < 3) continue;

    const subjectPart = sentence.slice(0, sentence.indexOf(verbMatch[0]) + verbMatch[1].length);
    const question = `According to the lesson, ${subjectPart} which of the following?`;
    const options = shuffle([correctOption, ...pickedDistractors]);

    questions.push({
      question,
      options,
      correctIndex: options.indexOf(correctOption),
      explanation: `Based on the lesson: ${sentence}`,
    });
  }

  // 3. Fallback: High-quality comprehension statement question
  if (questions.length < 4 && sentences.length >= 4) {
    const candidateSentences = sentences.filter((s) => s.length >= 35 && s.length <= 130);
    const shuffledSents = shuffle(candidateSentences);

    for (let i = 0; i < shuffledSents.length && questions.length < 4; i++) {
      const correctSentence = shuffledSents[i];
      const otherSentences = shuffledSents.filter((s) => s !== correctSentence);
      if (otherSentences.length < 3) break;

      const distractors = otherSentences.slice(0, 3).map((s) => {
        // Natural variation without appending fake flags
        return s.replace(/\b(can|will|must|is|are)\b/i, (m) => (m.toLowerCase() === 'is' ? 'is not always' : 'might occasionally'));
      });

      const options = shuffle([correctSentence, ...distractors]);
      questions.push({
        question: `Which of the following statements is directly supported by this lesson?`,
        options,
        correctIndex: options.indexOf(correctSentence),
        explanation: `Confirmed by the lesson text: "${correctSentence}"`,
      });
    }
  }

  return questions.slice(0, 4);
};

// ── Summary Generator ───────────────────────────────────────────────────────
const generateSummary = async (text, requestedProvider = 'gemini') => {
  const provider = normalizeProvider(requestedProvider);
  const compressed = compressEducationalText(text, 12000);

  if (provider === 'anthropic') {
    assertAnthropicConfigured();
    try {
      const summary = await generateWithAnthropic({
        text: compressed,
        system: 'You are an expert educator. Summarize the given lesson content into clear, concise study notes suitable for an e-learning platform. Use bullet points and short paragraphs. Keep it under 300 words.',
        maxTokens: 700,
      });
      if (!summary) throw new Error('Anthropic returned an empty summary');
      return summary;
    } catch (error) {
      console.error('Anthropic summary error:', error.message);
      if (!hasGemini()) {
        return localSummarize(compressed);
      }
    }
  } else if (!hasGemini()) {
    return localSummarize(compressed);
  }

  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: compressed,
      config: {
        systemInstruction:
          'You are an expert educator. Summarize the given lesson content into clear, concise study notes suitable for an e-learning platform. Use bullet points and short paragraphs. Keep it under 300 words.',
        temperature: 0.4,
      },
    });
    const summary = response?.text?.trim();
    return summary || localSummarize(compressed);
  } catch (error) {
    console.error('Gemini summary error:', error.message);
    return localSummarize(compressed);
  }
};

const QUIZ_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      question: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
      correctIndex: { type: 'INTEGER' },
      explanation: { type: 'STRING' },
    },
    required: ['question', 'options', 'correctIndex'],
  },
};

// ── Quiz Generator ──────────────────────────────────────────────────────────
const generateQuiz = async (text, requestedProvider = 'gemini') => {
  const provider = normalizeProvider(requestedProvider);
  const compressed = compressEducationalText(text, 12000);
  const system =
    'You are an expert quiz creator. Generate 4 multiple-choice questions based only on the lesson content provided. ' +
    'Each question must have exactly 4 plausible options, correctIndex must be the index of the correct option (0-based), ' +
    'and an explanation justifying why the answer is correct. Return only a valid JSON array of objects with question, options, correctIndex, and optional explanation.';

  if (provider === 'anthropic') {
    assertAnthropicConfigured();
    try {
      const raw = await generateWithAnthropic({
        text: compressed,
        system,
        maxTokens: 1800,
        temperature: 0.5,
      });
      const parsed = parseJsonResponse(raw, 'array');
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Anthropic returned invalid quiz JSON');
      }
      const questions = parsed
        .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
        .map((q) => {
          const item = {
            question: q.question,
            options: q.options.slice(0, 4),
            correctIndex: Number(q.correctIndex) || 0,
          };
          if (q.explanation) item.explanation = q.explanation;
          return item;
        });
      if (questions.length === 0) throw new Error('Anthropic returned no valid quiz questions');
      return questions;
    } catch (error) {
      console.error('Anthropic quiz error:', error.message);
      if (!hasGemini()) {
        return localGenerateQuiz(compressed);
      }
    }
  } else if (!hasGemini()) {
    return localGenerateQuiz(compressed);
  }

  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: compressed,
      config: {
        systemInstruction: system,
        temperature: 0.5,
        responseMimeType: 'application/json',
        responseSchema: QUIZ_SCHEMA,
      },
    });

    let parsed = null;
    if (response && response.parsed) {
      parsed = response.parsed;
    } else {
      const raw = response?.text?.trim() || '';
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) return localGenerateQuiz(compressed);
    return parsed
      .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => {
        const item = {
          question: q.question,
          options: q.options.slice(0, 4),
          correctIndex: Number(q.correctIndex) || 0,
        };
        if (q.explanation) item.explanation = q.explanation;
        return item;
      });
  } catch (error) {
    console.error('Gemini quiz error:', error.message);
    return localGenerateQuiz(compressed);
  }
};

// ── Study Notes Generator ───────────────────────────────────────────────────
const generateStudyNotes = async (text, requestedProvider = 'gemini') => {
  const provider = normalizeProvider(requestedProvider);
  const compressed = compressEducationalText(stripBoilerplate(text), 14000);
  const system =
    `You are an expert educator creating polished study notes for young learners. ` +
    `Analyze the lesson content and return only valid JSON with: ` +
    `"overview" (1-2 welcoming sentences on the topic), ` +
    `"keyPoints" (5-7 clear, kid-friendly teaching points), ` +
    `"vocabulary" (3-6 important words with simple definitions as {term, definition} pairs), ` +
    `and "keyFacts" (2-4 memorable facts or rules). ` +
    `Keep every string concise and easy for a primary-school student to read.`;

  if (provider === 'anthropic') {
    assertAnthropicConfigured();
    try {
      const raw = await generateWithAnthropic({
        text: compressed,
        system,
        maxTokens: 1800,
      });
      const parsed = parseJsonResponse(raw, 'object');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Anthropic returned invalid study-notes JSON');
      }
      return {
        overview: parsed.overview || '',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
        keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      };
    } catch (error) {
      console.error('Anthropic study-notes error:', error.message);
      if (!hasGemini()) {
        return localStudyNotes(compressed);
      }
    }
  } else if (!hasGemini()) {
    return localStudyNotes(compressed);
  }

  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: compressed,
      config: {
        systemInstruction: system,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            overview: { type: 'STRING' },
            keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
            vocabulary: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  term: { type: 'STRING' },
                  definition: { type: 'STRING' },
                },
                required: ['term', 'definition'],
              },
            },
            keyFacts: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['overview', 'keyPoints', 'vocabulary', 'keyFacts'],
        },
      },
    });

    let parsed = null;
    if (response && response.parsed) {
      parsed = response.parsed;
    } else {
      const raw = response?.text?.trim() || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    }

    if (!parsed || typeof parsed !== 'object') return localStudyNotes(compressed);
    return {
      overview: parsed.overview || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
    };
  } catch (error) {
    console.error('Gemini study-notes error:', error.message);
    return localStudyNotes(compressed);
  }
};

const OUTLINE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      chapter: { type: 'INTEGER' },
      title: { type: 'STRING' },
      objectives: { type: 'ARRAY', items: { type: 'STRING' } },
      keyTopics: { type: 'ARRAY', items: { type: 'STRING' } },
      estimatedPages: { type: 'INTEGER' },
    },
    required: ['chapter', 'title', 'objectives', 'keyTopics'],
  },
};

const LESSON_SECTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    studyNotes: {
      type: 'OBJECT',
      properties: {
        overview: { type: 'STRING' },
        keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
        vocabulary: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { term: { type: 'STRING' }, definition: { type: 'STRING' } },
            required: ['term', 'definition'],
          },
        },
        keyFacts: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['overview', 'keyPoints', 'vocabulary', 'keyFacts'],
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctIndex: { type: 'INTEGER' },
        },
        required: ['question', 'options', 'correctIndex'],
      },
    },
  },
  required: ['summary', 'studyNotes', 'quiz'],
};

// Generate course outline as JSON from full text
const generateCourseOutline = async (text, requestedProvider = 'gemini') => {
  const provider = normalizeProvider(requestedProvider);
  const compressed = compressEducationalText(text, 16000);
  const system =
    'You are an instructional designer. Analyze the textbook/PDF content and produce a clean course outline as JSON. ' +
    'Group content into logical chapters in order. For each chapter return: chapter (number starting at 1), title, objectives (2–4 learning objectives), keyTopics (3–6), estimatedPages (optional). ' +
    'Base ONLY on the provided content. Return ONLY valid JSON (no markdown).';

  if (provider === 'anthropic') {
    assertAnthropicConfigured();
    try {
      const raw = await generateWithAnthropic({
        text: compressed,
        system,
        maxTokens: 1200,
        temperature: 0.3,
      });
      const parsed = parseJsonResponse(raw, 'array');
      if (!Array.isArray(parsed)) throw new Error('Invalid outline JSON from Anthropic');
      return parsed;
    } catch (error) {
      console.error('Anthropic outline error:', error.message);
      if (hasGemini()) {
        // fall through to Gemini below
      } else {
        return [
          {
            chapter: 1,
            title: 'Core Fundamentals',
            objectives: ['Master the key concepts and vocabulary of this topic'],
            keyTopics: ['Introduction', 'Core Methods', 'Practical Applications'],
          },
        ];
      }
    }
  } else if (!hasGemini()) {
    return [
      {
        chapter: 1,
        title: 'Core Fundamentals',
        objectives: ['Master the key concepts and vocabulary of this topic'],
        keyTopics: ['Introduction', 'Core Methods', 'Practical Applications'],
      },
    ];
  }

  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: compressed,
      config: {
        systemInstruction: system,
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: OUTLINE_SCHEMA,
      },
    });

    let parsed = null;
    if (response && response.parsed) {
      parsed = response.parsed;
    } else {
      const raw = response?.text?.trim() || '';
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error('Gemini outline error:', error.message);
    throw error;
  }
};

// Generate complete lesson (summary + study notes + quiz) from a section/chapter text
const generateLessonFromSection = async (sectionText, chapterMeta = {}, requestedProvider = 'gemini') => {
  const provider = normalizeProvider(requestedProvider);
  const compressed = compressEducationalText(sectionText, 14000);
  const metaText = chapterMeta.title ? `Chapter: ${chapterMeta.title}. Objectives: ${(chapterMeta.objectives || []).join('; ')}.` : '';
  const system =
    'You are an expert primary-school teacher. Generate a complete lesson for this chapter/section using ONLY the provided text. ' +
    metaText +
    ' Return valid JSON with: summary (concise), studyNotes (overview, keyPoints 5–7, vocabulary 3–6 with {term,definition}, keyFacts 2–4), ' +
    'and quiz (exactly 4 multiple-choice questions, each 4 options, correctIndex 0-based). Keep kid-friendly and age-appropriate.';

  if (provider === 'anthropic') {
    assertAnthropicConfigured();
    try {
      const raw = await generateWithAnthropic({
        text: compressed,
        system,
        maxTokens: 2000,
        temperature: 0.4,
      });
      const parsed = parseJsonResponse(raw, 'object');
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid lesson JSON from Anthropic');
      return {
        summary: parsed.summary || '',
        studyNotes: {
          overview: parsed.studyNotes?.overview || '',
          keyPoints: Array.isArray(parsed.studyNotes?.keyPoints) ? parsed.studyNotes.keyPoints : [],
          vocabulary: Array.isArray(parsed.studyNotes?.vocabulary) ? parsed.studyNotes.vocabulary : [],
          keyFacts: Array.isArray(parsed.studyNotes?.keyFacts) ? parsed.studyNotes.keyFacts : [],
        },
        quiz: Array.isArray(parsed.quiz)
          ? parsed.quiz
              .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
              .map((q) => ({
                question: q.question,
                options: q.options.slice(0, 4),
                correctIndex: Number(q.correctIndex) || 0,
              }))
          : [],
      };
    } catch (error) {
      console.error('Anthropic section lesson error:', error.message);
      if (hasGemini()) {
        // fall through to Gemini below
      } else {
        return {
          summary: localSummarize(compressed),
          studyNotes: localStudyNotes(compressed),
          quiz: localGenerateQuiz(compressed),
        };
      }
    }
  } else if (!hasGemini()) {
    return {
      summary: localSummarize(compressed),
      studyNotes: localStudyNotes(compressed),
      quiz: localGenerateQuiz(compressed),
    };
  }

  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: compressed,
      config: {
        systemInstruction: system,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: LESSON_SECTION_SCHEMA,
      },
    });

    let parsed = null;
    if (response && response.parsed) {
      parsed = response.parsed;
    } else {
      const raw = response?.text?.trim() || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        summary: localSummarize(compressed),
        studyNotes: localStudyNotes(compressed),
        quiz: localGenerateQuiz(compressed),
      };
    }

    return {
      summary: parsed.summary || '',
      studyNotes: {
        overview: parsed.studyNotes?.overview || '',
        keyPoints: Array.isArray(parsed.studyNotes?.keyPoints) ? parsed.studyNotes.keyPoints : [],
        vocabulary: Array.isArray(parsed.studyNotes?.vocabulary) ? parsed.studyNotes.vocabulary : [],
        keyFacts: Array.isArray(parsed.studyNotes?.keyFacts) ? parsed.studyNotes.keyFacts : [],
      },
      quiz: Array.isArray(parsed.quiz)
        ? parsed.quiz
            .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
            .map((q) => ({
              question: q.question,
              options: q.options.slice(0, 4),
              correctIndex: Number(q.correctIndex) || 0,
            }))
        : [],
    };
  } catch (error) {
    console.error('Gemini section lesson error:', error.message);
    return {
      summary: localSummarize(compressed),
      studyNotes: localStudyNotes(compressed),
      quiz: localGenerateQuiz(compressed),
    };
  }
};

module.exports = {
  extractTextFromPdf,
  generateSummary,
  generateStudyNotes,
  generateQuiz,
  generateCourseOutline,
  generateLessonFromSection,
  hasGemini,
  hasAnthropic,
  localSummarize,
  localGenerateQuiz,
  localStudyNotes,
  compressEducationalText,
};