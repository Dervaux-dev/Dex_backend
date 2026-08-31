// AI service for generating summaries and quizzes using Google Gemini.
// Falls back to a local heuristic summarizer/quiz generator if no GEMINI_API_KEY is set.
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Load the Gemini SDK dynamically so the app still works even if it isn't installed.
let GoogleGenAI = null;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch (e) {
  GoogleGenAI = null;
}

const hasGemini = () => Boolean(process.env.GEMINI_API_KEY && GoogleGenAI);

const getModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const getClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Extract text from a PDF buffer
const extractTextFromPdf = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF parse error:', error.message);
    return '';
  }
};

// Local fallback summarizer (used when no Gemini key is present)
const localSummarize = (text) => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'No content available for this lesson.';
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  // Take the first few sentences as a summary
  return sentences.slice(0, 5).join(' ');
};

// Local fallback quiz generator - creates real multiple-choice questions with
// genuine distractors from the lesson text (no API dependency, no rate limits).
const localGenerateQuiz = (text) => {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // Split into meaningful sentences, dropping short/noisy ones
  const sentences = (cleaned.match(/[^.!?]+[.!?]+/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4 && s.length <= 220);

  if (sentences.length === 0) return [];

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const questions = [];
  const maxQ = Math.min(4, sentences.length);
  const picked = shuffle(sentences);

  for (let i = 0; i < maxQ; i++) {
    const sentence = picked[i];

    // Try to extract a key phrase to build a cloze-style question where the
    // removed phrase is the correct answer.
    const keyPhraseMatch = sentence.match(
      /\b((?:is|are|was|were|means|refer[s]? to|called|used for|such as|named|include[s]?)\s+.{2,35}?)(?=\s*[;,.]|$)/i
    );

    let question;
    let correctOption;
    let distractors;
    const fallback = sentences
      .filter((s) => s !== sentence)
      .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 120));

    if (keyPhraseMatch && fallback.length >= 3) {
      const key = keyPhraseMatch[1].trim();
      question =
        'What does the lesson say about the following? Which option correctly completes this statement?';
      correctOption = key.slice(0, 120);
      distractors = shuffle(fallback).slice(0, 3);
    } else {
      // Fallback: Q about the sentence content, with the sentence as the right answer
      question = `According to this lesson, which of the following statements is correct?`;
      correctOption = sentence.slice(0, 130);
      distractors = shuffle(fallback).slice(0, 3).map((s) => s + ' (incorrect)');
    }

    // Ensure we always have 4 unique-looking options
    const optionSet = new Set();
    optionSet.add(correctOption);
    distractors.forEach((d) => optionSet.add(d));
    let options = [...optionSet];
    while (options.length < 4 && fallback.length) {
      const extra = fallback[Math.floor(Math.random() * fallback.length)];
      if (!optionSet.has(extra)) {
        optionSet.add(extra);
        options.push(extra);
      }
      if (optionSet.size >= 8) break; // safety
    }
    options = options.slice(0, 4);

    // At least 4 options required for a usable quiz
    if (options.length < 4) continue;

    const shuffled = shuffle(options);
    const correctIndex = shuffled.indexOf(correctOption);
    if (correctIndex === -1) continue;

    questions.push({
      question,
      options: shuffled,
      correctIndex,
    });
  }

  return questions;
};

// Generate a readable summary from lesson text using Gemini (or fallback)
const generateSummary = async (text) => {
  if (!hasGemini()) {
    return localSummarize(text);
  }
  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: text.slice(0, 12000),
      config: {
        systemInstruction:
          'You are an expert educator. Summarize the given lesson content into clear, concise study notes suitable for an e-learning platform. Use bullet points and short paragraphs. Keep it under 300 words.',
        temperature: 0.4,
      },
    });
    const summary = response?.text?.trim();
    return summary || localSummarize(text);
  } catch (error) {
    console.error('Gemini summary error:', error.message);
    return localSummarize(text);
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
    },
    required: ['question', 'options', 'correctIndex'],
  },
};

// Generate quiz questions from lesson text using Gemini (or fallback)
const generateQuiz = async (text) => {
  if (!hasGemini()) {
    return localGenerateQuiz(text);
  }
  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: text.slice(0, 12000),
      config: {
        systemInstruction:
          'You are an expert quiz creator. Generate 4 multiple-choice questions based on the lesson content provided. Each question must have exactly 4 options and correctIndex must be the index of the correct option (0-based).',
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

    if (!Array.isArray(parsed) || parsed.length === 0) return localGenerateQuiz(text);
    return parsed
      .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({
        question: q.question,
        options: q.options.slice(0, 4),
        correctIndex: Number(q.correctIndex) || 0,
      }));
  } catch (error) {
    console.error('Gemini quiz error:', error.message);
    return localGenerateQuiz(text);
  }
};

// Local fallback study-notes generator (used when no Gemini key is present)
const localStudyNotes = (text) => {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { overview: '', keyPoints: [], vocabulary: [], keyFacts: [] };

  const sentences = (cleaned.match(/[^.!?]+[.!?]+/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);

  const keyPoints = sentences.slice(0, 6).map((s) => s.slice(0, 180));

  const vocabulary = [];
  const termRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const seen = new Set();
  for (const s of sentences.slice(0, 12)) {
    let m;
    while ((m = termRegex.exec(s)) !== null && vocabulary.length < 6) {
      const term = m[1];
      if (!seen.has(term.toLowerCase()) && term.length >= 3 && !['The', 'This', 'That', 'These', 'Those', 'Rwanda', 'Primary', 'Chapter'].includes(term)) {
        seen.add(term.toLowerCase());
        const ctx = s.indexOf(m[0]);
        const definition = s.slice(Math.max(0, ctx - 40), ctx + term.length + 60).replace(/\s+/g, ' ').trim();
        vocabulary.push({ term, definition });
      }
    }
  }

  return {
    overview: sentences.slice(0, 2).join(' ').slice(0, 320),
    keyPoints,
    vocabulary,
    keyFacts: sentences.slice(6, 10).map((s) => s.slice(0, 160)),
  };
};

// Generate structured AI study notes from lesson text using Gemini (or fallback)
const generateStudyNotes = async (text) => {
  if (!hasGemini()) {
    return localStudyNotes(text);
  }
  try {
    const response = await getClient().models.generateContent({
      model: getModel(),
      contents: text.slice(0, 14000),
      config: {
        systemInstruction:
          `You are an expert educator creating polished study notes for young learners. ` +
          `Analyze the lesson content and return structured study notes with: ` +
          `"overview" (1-2 welcoming sentences on the topic), ` +
          `"keyPoints" (5-7 clear, kid-friendly bullet teaching points), ` +
          `"vocabulary" (3-6 important words with simple definitions as {term, definition} pairs), ` +
          `and "keyFacts" (2-4 memorable facts or rules). ` +
          `Keep every string concise and easy for a primary-school student to read.`,
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

    if (!parsed || typeof parsed !== 'object') return localStudyNotes(text);
    return {
      overview: parsed.overview || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
    };
  } catch (error) {
    console.error('Gemini study-notes error:', error.message);
    return localStudyNotes(text);
  }
};

// Generate our classic plain summary too (kept for backward compatibility)
module.exports = {
  extractTextFromPdf,
  generateSummary,
  generateStudyNotes,
  generateQuiz,
  hasGemini,
  localSummarize,
  localGenerateQuiz,
  localStudyNotes,
};