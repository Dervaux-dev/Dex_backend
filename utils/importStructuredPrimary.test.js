const {
  buildLessonRecords,
  createLessonPayload,
  parseArgs,
  selectBooks,
} = require('./importStructuredPrimary');

describe('structured primary curriculum import', () => {
  test('creates stable, ordered lesson records from parsed units', () => {
    const records = buildLessonRecords({
      grade: 'P1',
      subject: 'english',
      units: [
        {
          number: 1,
          title: 'Greetings',
          lessons: [
            { number: '1.1', title: 'Hello', content: 'Hello, class.' },
            { number: '1.2', title: 'Goodbye', content: 'Goodbye, class.' },
          ],
        },
        {
          number: 2,
          title: 'Numbers',
          lessons: [],
          content: 'Count the objects.',
        },
      ],
    });

    expect(records.map((record) => record.chapter)).toEqual([1, 2, 3]);
    expect(records.map((record) => record.curriculumSourceId)).toEqual([
      'reb-primary:P1:english:unit:1:lesson:1.1',
      'reb-primary:P1:english:unit:1:lesson:1.2',
      'reb-primary:P1:english:unit:2:lesson:unit',
    ]);
    expect(records[2]).toMatchObject({
      curriculumUnitNumber: 2,
      curriculumUnitTitle: 'Numbers',
      curriculumLessonNumber: '',
      title: 'Numbers',
      content: 'Count the objects.',
    });
  });

  test('maps malformed UNIT 00 source text to its matching TOC unit', () => {
    const records = buildLessonRecords({
      grade: 'P1',
      subject: 'science',
      tableOfContents: [
        { number: 1, title: 'MATERIALS USED AT SCHOOL AND AT HOME' },
        { number: 4, title: 'ANIMALS' },
      ],
      units: [
        {
          number: 0,
          title: 'Key unit competence:',
          lessons: [],
          content: 'You will identify domestic and wild animals. ANIMALS',
        },
        {
          number: 4,
          title: 'ANIMALS',
          lessons: [{ number: '4.1', title: 'Domestic animals', content: 'Animals live near us.' }],
          content: 'Unit 4: ANIMALS',
        },
      ],
    });

    expect(records[0]).toMatchObject({
      curriculumSourceId: 'reb-primary:P1:science:unit:4:lesson:unit-0-source',
      curriculumUnitNumber: 4,
      curriculumUnitTitle: 'ANIMALS',
      title: 'ANIMALS (additional source text)',
    });
    expect(records.every((record) => record.curriculumUnitNumber >= 1)).toBe(true);
  });

  test('rejects invalid unit numbers without an unambiguous TOC match', () => {
    expect(() => buildLessonRecords({
      grade: 'P1',
      subject: 'science',
      tableOfContents: [{ number: 1, title: 'MATERIALS' }],
      units: [{ number: 0, content: 'Unmatched source content.' }],
    })).toThrow('Cannot map invalid unit number "0" in P1 science');
  });

  test('defaults to a dry-run P1 English pilot and rejects invalid grades', () => {
    expect(parseArgs([])).toMatchObject({
      grade: 'P1',
      subject: 'english',
      apply: false,
    });
    expect(() => parseArgs(['--grade', 'P7', '--subject', 'english'])).toThrow(
      '--grade must be P1 through P6'
    );
  });

  test('selects only matching pupil books unless all-books is requested', () => {
    const manifest = [
      { grade: 'P1', type: 'PB', subject: 'english' },
      { grade: 'P1', type: 'TG', subject: 'english' },
      { grade: 'P2', type: 'PB', subject: 'english' },
      { grade: 'P1', type: 'PB', subject: 'unmapped' },
    ];

    expect(selectBooks(manifest, { allBooks: false, grade: 'P1', subject: 'english' }))
      .toEqual([manifest[0]]);
    expect(selectBooks(manifest, { allBooks: true }))
      .toEqual([manifest[0], manifest[2]]);
  });

  test('keeps non-English source text as the lesson overview without AI claims', () => {
    const payload = createLessonPayload({
      record: {
        curriculumSourceId: 'reb-primary:P1:french:unit:1:lesson:unit',
        chapter: 1,
        curriculumUnitNumber: 1,
        curriculumUnitTitle: 'Les salutations',
        curriculumLessonNumber: '',
        title: 'Les salutations',
        content: 'Bonjour. Comment allez-vous? Voici une leçon de salutation.',
      },
      courseId: 'course-id',
      pdfName: 'book.pdf',
      pdfPath: 'book.pdf',
      subject: 'french',
    });

    expect(payload).toMatchObject({
      aiProvider: 'local',
      title: 'Les salutations',
      content: 'Bonjour. Comment allez-vous? Voici une leçon de salutation.',
      studyNotes: { overview: expect.stringContaining('Bonjour.') },
    });
  });
});
