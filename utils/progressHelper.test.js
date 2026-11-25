const {
  clampProgress,
  normalizeEnrollmentProgress,
} = require('./progressHelper');

describe('course progress normalization', () => {
  test.each([
    [-10, 0],
    [42.6, 43],
    [100, 100],
    [120, 100],
    [NaN, 0],
  ])('clamps %s to %s', (value, expected) => {
    expect(clampProgress(value)).toBe(expected);
  });

  test('normalizes and persists legacy progress above 100%', async () => {
    const enrollment = {
      progress: 120,
      status: 'active',
      completedAt: null,
      save: jest.fn().mockResolvedValue(),
    };

    await normalizeEnrollmentProgress(enrollment);

    expect(enrollment.progress).toBe(100);
    expect(enrollment.status).toBe('completed');
    expect(enrollment.completedAt).toBeInstanceOf(Date);
    expect(enrollment.save).toHaveBeenCalledTimes(1);
  });

  test('keeps already normalized progress unchanged', async () => {
    const enrollment = {
      progress: 60,
      status: 'active',
      completedAt: null,
      save: jest.fn(),
    };

    await normalizeEnrollmentProgress(enrollment);

    expect(enrollment.progress).toBe(60);
    expect(enrollment.status).toBe('active');
    expect(enrollment.save).not.toHaveBeenCalled();
  });
});
