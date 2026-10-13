const {
  cleanPdfText,
  computeTextStats,
  detectChapters,
} = require('./pdfService');
const {
  localSummarize,
  localStudyNotes,
  localGenerateQuiz,
  compressEducationalText,
} = require('./aiService');

describe('PDF text cleaning & processing pipeline', () => {
  test('cleans running headers, pagination, form feeds, and hyphenated wraps', () => {
    const raw = `
Page 1 of 42
Photosynthesis is an essen-
tial biological process.
12 / 80
Plants absorb sun-
light to produce glucose and oxygen.
\f
Page 2 of 42
Chlorophyll is the green pigment found in plant chloroplasts.
`;
    const cleaned = cleanPdfText(raw);

    // Checks
    expect(cleaned).not.toContain('Page 1 of 42');
    expect(cleaned).not.toContain('12 / 80');
    expect(cleaned).not.toContain('\f');
    // Words hyphenated across lines must be joined
    expect(cleaned).toContain('essential');
    expect(cleaned).toContain('sunlight');
    expect(cleaned).toContain('Photosynthesis is an essential biological process.');
  });

  test('computes accurate reading stats', () => {
    const sample = 'Word '.repeat(360);
    const stats = computeTextStats(sample, 2);
    expect(stats.wordCount).toBe(360);
    expect(stats.readingTimeMinutes).toBe(2);
    expect(stats.pageCount).toBe(2);
  });

  test('detects chapter structures in documents', () => {
    const text = `
Chapter 1: The Solar System
The solar system consists of the Sun and planetary bodies.

Chapter 2: Planets and Moons
Earth is the third planet from the Sun and harbors life.
`;
    const chapters = detectChapters(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0].chapterNumber).toBe('1');
    expect(chapters[0].title).toBe('The Solar System');
    expect(chapters[1].chapterNumber).toBe('2');
    expect(chapters[1].title).toBe('Planets and Moons');
  });
});

describe('Local NLP extractive algorithms & quiz generation', () => {
  const educationalText = `
Photosynthesis is defined as the chemical process by which green plants make food using sunlight.
Chlorophyll refers to the green pigment in leaves that traps light energy from the sun.
Water and carbon dioxide are the raw materials needed for photosynthesis to take place.
Oxygen is released into the atmosphere as a vital byproduct of this process.
Plants store excess energy in the form of starch for future growth.
Photosynthesis provides 99 percent of the biochemical energy needed for life on Earth.
`;

  test('localSummarize extracts salient sentences in order', () => {
    const summary = localSummarize(educationalText);
    expect(summary).toBeTruthy();
    expect(summary.length).toBeGreaterThan(40);
    expect(typeof summary).toBe('string');
  });

  test('localStudyNotes extracts overview, keyPoints, vocabulary definitions, and keyFacts', () => {
    const notes = localStudyNotes(educationalText);
    expect(notes.overview).toBeTruthy();
    expect(Array.isArray(notes.keyPoints)).toBe(true);
    expect(notes.keyPoints.length).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(notes.vocabulary)).toBe(true);
    expect(notes.vocabulary.length).toBeGreaterThan(0);
    // Verify each vocabulary item has term and definition
    notes.vocabulary.forEach((v) => {
      expect(v.term).toBeTruthy();
      expect(v.definition).toBeTruthy();
    });

    expect(Array.isArray(notes.keyFacts)).toBe(true);
  });

  test('localGenerateQuiz creates clean 4-option questions with NO "(incorrect)" strings', () => {
    const questions = localGenerateQuiz(educationalText);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(4);

    questions.forEach((q) => {
      expect(q.question).toBeTruthy();
      expect(q.options.length).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(4);

      // CRITICAL CHECK: ensure no cheesy "(incorrect)" label exists!
      q.options.forEach((opt) => {
        expect(opt).not.toContain('(incorrect)');
        expect(opt).not.toContain('undefined');
        expect(opt.trim().length).toBeGreaterThan(0);
      });

      // All 4 options must be unique
      const uniqueOptions = new Set(q.options);
      expect(uniqueOptions.size).toBe(4);
    });
  });

  test('compressEducationalText reduces volume while preserving central topics', () => {
    const largeText = educationalText.repeat(20);
    const compressed = compressEducationalText(largeText, 500);
    expect(compressed.length).toBeLessThanOrEqual(500);
    expect(compressed).toContain('Photosynthesis');
  });
});
