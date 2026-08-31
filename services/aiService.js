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

// Local fallback quiz generator
const localGenerateQuiz = (text) => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
  const questions = [];
  const taken = new Set();
  for (let i = 0; i < Math.min(3, sentences.length); i++) {
    let idx = Math.floor(Math.random() * sentences.length);
    while (taken.has(idx) && taken.size < sentences.length) {
      idx = (idx + 1) % sentences.length;
    }
    taken.add(idx);
    const sentence = sentences[idx].trim();
    if (sentence.length < 20) continue;
    questions.push({
      question: `Based on the lesson, which of the following is correct?`,
      options: [sentence, sentence, sentence, sentence],
      correctIndex: 0,
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

module.exports = {
  extractTextFromPdf,
  generateSummary,
  generateQuiz,
  hasGemini,
  localSummarize,
};