const EventEmitter = require('events');
const https = require('https');
const {
  generateQuiz,
  generateStudyNotes,
  generateSummary,
} = require('./aiService');

const mockAnthropicResponse = (content, statusCode = 200) => {
  https.request.mockImplementation((options, callback) => {
    const request = new EventEmitter();
    request.end = jest.fn(() => {
      const response = new EventEmitter();
      response.statusCode = statusCode;
      response.setEncoding = jest.fn();
      callback(response);
      response.emit('data', JSON.stringify(content));
      response.emit('end');
    });
    request.destroy = (error) => request.emit('error', error);
    return request;
  });
};

describe('Anthropic lesson content generation', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
    delete process.env.GEMINI_API_KEY;
    jest.spyOn(https, 'request');
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    https.request.mockRestore();
  });

  test('sends lesson text to Anthropic and returns its summary', async () => {
    mockAnthropicResponse({ content: [{ type: 'text', text: 'A lesson summary.' }] });

    await expect(generateSummary('Lesson source text', 'anthropic')).resolves.toBe('A lesson summary.');

    const [options, callback] = https.request.mock.calls[0];
    expect(options.path).toBe('/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    expect(callback).toEqual(expect.any(Function));
  });

  test('parses Anthropic study notes and quiz JSON', async () => {
    mockAnthropicResponse({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: 'An overview.',
          keyPoints: ['Point one.'],
          vocabulary: [{ term: 'Word', definition: 'Meaning.' }],
          keyFacts: ['Fact one.'],
        }),
      }],
    });
    await expect(generateStudyNotes('Lesson source text', 'anthropic')).resolves.toEqual({
      overview: 'An overview.',
      keyPoints: ['Point one.'],
      vocabulary: [{ term: 'Word', definition: 'Meaning.' }],
      keyFacts: ['Fact one.'],
    });

    mockAnthropicResponse({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          question: 'Question?',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 2,
        }]),
      }],
    });
    await expect(generateQuiz('Lesson source text', 'anthropic')).resolves.toEqual([{
      question: 'Question?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
    }]);
  });

  test('reports missing Anthropic credentials instead of falling back', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(generateSummary('Lesson source text', 'anthropic')).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(https.request).not.toHaveBeenCalled();
  });
});
