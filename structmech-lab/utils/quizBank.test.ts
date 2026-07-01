import { describe, expect, it } from 'vitest';
import { getGeometryQuiz } from './quizBank';

describe('getGeometryQuiz', () => {
  it('marks positive W as a mechanism', () => {
    const [statusQuestion] = getGeometryQuiz({
      mode: 'rigid',
      w: 2,
      rigidBodies: 1,
      hinges: 0,
      constraints: 1,
    });

    expect(statusQuestion.correctOptionId).toBe('mechanism');
    expect(statusQuestion.explanation).toContain('自由度还没被约束完');
  });

  it('marks zero W as a determinate necessary condition', () => {
    const [statusQuestion, necessaryQuestion] = getGeometryQuiz({
      mode: 'rigid',
      w: 0,
      rigidBodies: 1,
      hinges: 0,
      constraints: 3,
    });

    expect(statusQuestion.correctOptionId).toBe('determinate-condition');
    expect(necessaryQuestion.correctOptionId).toBe('necessary');
  });

  it('marks negative W as indeterminate', () => {
    const [statusQuestion] = getGeometryQuiz({
      mode: 'truss',
      w: -1,
      joints: 4,
      members: 6,
      supportLinks: 3,
    });

    expect(statusQuestion.correctOptionId).toBe('indeterminate');
    expect(statusQuestion.options.find(option => option.id === 'indeterminate')?.label).toBe('1次超静定');
  });

  it('uses mode-specific constraint questions', () => {
    const rigidQuestions = getGeometryQuiz({ mode: 'rigid', w: 0 });
    const trussQuestions = getGeometryQuiz({ mode: 'truss', w: 0 });

    expect(rigidQuestions[2].id).toBe('geometry-rigid-hinge');
    expect(rigidQuestions[2].correctOptionId).toBe('two');
    expect(trussQuestions[2].id).toBe('geometry-truss-member');
    expect(trussQuestions[2].correctOptionId).toBe('one');
  });
});
