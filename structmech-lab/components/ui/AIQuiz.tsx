import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import type { QuizQuestion } from '../../utils/quizBank';

interface AIQuizProps {
  title?: string;
  contextLabel?: string;
  questions: QuizQuestion[];
}

const AIQuiz: React.FC<AIQuizProps> = ({ title = '测一测', contextLabel, questions }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const questionKey = useMemo(() => questions.map(q => q.id).join('|'), [questions]);

  useEffect(() => {
    setAnswers({});
    setSubmitted(false);
  }, [questionKey]);

  const answeredCount = questions.filter(q => answers[q.id]).length;
  const score = questions.filter(q => answers[q.id] === q.correctOptionId).length;
  const canSubmit = answeredCount === questions.length && questions.length > 0;

  if (questions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Sparkles size={15} />
            </div>
            <h4 className="text-sm font-bold text-slate-800">{title}</h4>
          </div>
          {contextLabel && <div className="mt-1 text-xs text-slate-500">{contextLabel}</div>}
        </div>
        <div className="flex items-center gap-2">
          {submitted && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              {score}/{questions.length}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            aria-label="重置测验"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {questions.map((question, questionIndex) => {
          const selected = answers[question.id];
          const isCorrect = selected === question.correctOptionId;

          return (
            <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                  {questionIndex + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold leading-relaxed text-slate-700">{question.prompt}</p>
                    {question.concept && (
                      <span className="w-fit rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                        {question.concept}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {question.options.map(option => {
                      const active = selected === option.id;
                      const correct = option.id === question.correctOptionId;
                      const showCorrect = submitted && correct;
                      const showWrong = submitted && active && !correct;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            if (!submitted) {
                              setAnswers(prev => ({ ...prev, [question.id]: option.id }));
                            }
                          }}
                          disabled={submitted}
                          className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                            showCorrect
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : showWrong
                                ? 'border-red-300 bg-red-50 text-red-800'
                                : active
                                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/60'
                          }`}
                        >
                          {showCorrect ? (
                            <CheckCircle2 size={15} className="flex-shrink-0" />
                          ) : showWrong ? (
                            <XCircle size={15} className="flex-shrink-0" />
                          ) : (
                            <Circle size={15} className="flex-shrink-0" />
                          )}
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                      isCorrect
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      {question.explanation}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          已答 {answeredCount}/{questions.length}
        </div>
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={!canSubmit || submitted}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          提交
        </button>
      </div>
    </section>
  );
};

export default AIQuiz;
