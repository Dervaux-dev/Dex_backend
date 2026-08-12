// AI service for generating summaries and quizzes using OpenAI.
// Falls back to a local heuristic summarizer if no OPENAI_API_KEY is set.
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Load OpenAI dynamically so the app works even if the package isn't installed yet.
let OpenAI = null;
try {
  ({ OpenAI } = require('openai'));
} catch (e) {
  OpenAI = null;
}

const hasOpenAI = () => Boolean(process.env.OPENAI_API_KEY && OpenAI);

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

// Local fallback summarizer (used when no OpenAI key is present)
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

// Generate a readable summary from lesson text using OpenAI (or fallback)
const generateSummary = async (text) => {
  if (!hasOpenAI()) {
    return localSummarize(text);
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert educator. Summarize the given lesson content into clear, concise study notes suitable for an e-learning platform. Use bullet points and short paragraphs. Keep it under 300 words.',
        },
        { role: 'user', content: text.slice(0, 12000) },
      ],
      temperature: 0.4,
    });
    return response.choices[0]?.message?.content?.trim() || localSummarize(text);
  } catch (error) {
    console.error('OpenAI summary error:', error.message);
    return localSummarize(text);
  }
};

// Generate quiz questions from lesson text using OpenAI (or fallback)
const generateQuiz = async (text) => {
  if (!hasOpenAI()) {
    return localGenerateQuiz(text);
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert quiz creator. Generate 4 multiple-choice questions based on the lesson content provided. Respond ONLY with valid JSON in this exact format: [{"question":"...","options":["a","b","c","d"],"correctIndex":0}] where correctIndex is the index of the correct option. Ensure exactly 4 options per question.',
        },
        { role: 'user', content: text.slice(0, 12000) },
      ],
      temperature: 0.5,
    });
    const content = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return localGenerateQuiz(text);
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return localGenerateQuiz(text);
    return parsed
      .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({
        question: q.question,
        options: q.options.slice(0, 4),
        correctIndex: Number(q.correctIndex) || 0,
      }));
  } catch (error) {
    console.error('OpenAI quiz error:', error.message);
    return localGenerateQuiz(text);
  }
};

module.exports = {
  extractTextFromPdf,
  generateSummary,
  generateQuiz,
  hasOpenAI,
};
