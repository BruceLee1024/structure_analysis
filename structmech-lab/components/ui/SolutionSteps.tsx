import React, { useId, useState } from 'react';
import { ChevronDown, Info, ListOrdered } from 'lucide-react';

interface Step {
  title: string;
  equation?: string;
  result?: string;
  explanation?: string;
  /** Additional principle explanation supplied by the learning module. */
  aiWhy?: string;
}

interface SolutionStepsProps {
  steps: Step[];
  title?: string;
  defaultExpanded?: boolean;
}

const SolutionSteps: React.FC<SolutionStepsProps> = ({ steps, title = '求解过程', defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [whyOpen, setWhyOpen] = useState<Record<number, boolean>>({});
  const id = useId();
  const explainable = steps.flatMap((step, i) => step.aiWhy ? [i] : []);
  const allPrinciplesOpen = explainable.length > 0 && explainable.every(i => whyOpen[i]);
  const toggleWhy = (index: number) => setWhyOpen(prev => ({ ...prev, [index]: !prev[index] }));
  const toggleAll = () => setWhyOpen(Object.fromEntries(explainable.map(i => [i, !allPrinciplesOpen])));

  return (
    <section className="learning-solution-card solution-workbook" aria-labelledby={`${id}-title`}>
      <header className="solution-heading">
        <div className="solution-heading-label">
          <ListOrdered size={17} aria-hidden="true" />
          <h3 id={`${id}-title`}>{title}</h3>
          <span className="solution-step-count">{steps.length} 个步骤</span>
        </div>
        <div className="solution-heading-actions">
          {expanded && explainable.length > 0 && (
            <button type="button" className="solution-all-principles" onClick={toggleAll} aria-expanded={allPrinciplesOpen}>
              <Info size={13} aria-hidden="true" />{allPrinciplesOpen ? '收起原理' : '展开原理'}
            </button>
          )}
          <button type="button" className="solution-collapse" onClick={() => setExpanded(prev => !prev)} aria-expanded={expanded} aria-controls={`${id}-body`} aria-label={`${expanded ? '收起' : '展开'}${title}`}>
            <ChevronDown size={17} className={expanded ? 'is-expanded' : ''} aria-hidden="true" />
          </button>
        </div>
      </header>
      {expanded && (
        <div id={`${id}-body`} className="solution-body">
          <table className="solution-table" aria-labelledby={`${id}-title`}>
            <colgroup><col className="solution-title-column" /><col className="solution-equation-column" /><col className="solution-result-column" /></colgroup>
            <thead><tr><th scope="col">推导步骤</th><th scope="col">公式与代入</th><th scope="col">计算结果</th></tr></thead>
            <tbody>
              {steps.map((step, i) => (
                <React.Fragment key={i}>
                  <tr className="solution-step-row">
                    <th scope="row" className="solution-step-title">
                      <div className="solution-step-identity">
                        <span className="solution-step-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        <div className="solution-step-label">
                          <span>{step.title}</span>
                          {step.aiWhy && (
                            <button type="button" className={`solution-principle-toggle ${whyOpen[i] ? 'is-open' : ''}`} onClick={() => toggleWhy(i)} aria-expanded={!!whyOpen[i]} aria-controls={`${id}-principle-${i}`} aria-label={`${whyOpen[i] ? '收起' : '展开'}步骤${i + 1}原理`}>
                              原理说明<ChevronDown size={12} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                    <td className="solution-equation-cell" data-label="公式与代入">
                      {step.equation ? <div className="solution-equation">{step.equation}</div> : <span className="solution-no-equation" aria-label="此步骤直接给出结果">—</span>}
                      {step.explanation && <p className="solution-step-note">{step.explanation}</p>}
                    </td>
                    <td className="solution-result-cell" data-label="计算结果"><div className="solution-step-result">{step.result ?? '—'}</div></td>
                  </tr>
                  {step.aiWhy && (
                    <tr id={`${id}-principle-${i}`} className="solution-principle-row" hidden={!whyOpen[i]}>
                      <td colSpan={3}><div className="solution-principle-content"><Info size={15} aria-hidden="true" /><div><span className="solution-principle-caption">步骤 {i + 1} · 原理说明</span><p>{step.aiWhy}</p></div></div></td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default SolutionSteps;
