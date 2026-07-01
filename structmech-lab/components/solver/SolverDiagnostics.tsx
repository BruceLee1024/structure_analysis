import React from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, Gauge, LocateFixed, Scale } from 'lucide-react';
import type { ResultSelection } from '../../types';
import type { SolverDiagnosticSummary } from '../../utils/solverDiagnostics';

interface SolverDiagnosticsProps {
  summary: SolverDiagnosticSummary;
  momentSelection: ResultSelection | null;
  deflectionSelection: ResultSelection | null;
  onSelectResult: (selection: ResultSelection) => void;
}

const statusStyles: Record<SolverDiagnosticSummary['modelStatus'], string> = {
  error: 'border-red-500/35 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

const ratioLabel = (ratio: number | null) => {
  if (ratio === null) return '未建立限值';
  if (ratio < 0.5) return `L/250 的 ${(ratio * 100).toFixed(0)}%`;
  if (ratio <= 1) return `接近限值，${(ratio * 100).toFixed(0)}%`;
  return `超过 L/250，${(ratio * 100).toFixed(0)}%`;
};

const DiagnosticCard: React.FC<{
  title: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}> = ({ title, value, detail, icon, className = 'border-slate-800 bg-slate-900/85 text-slate-200', action }) => (
  <div className={`min-w-0 rounded-lg border px-3 py-2 ${className}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider opacity-70">
          {icon}
          <span>{title}</span>
        </div>
        <div className="mt-1 truncate text-xs font-semibold">{value}</div>
        {detail ? <div className="mt-0.5 truncate text-[10px] opacity-65">{detail}</div> : null}
      </div>
      {action}
    </div>
  </div>
);

const LocateButton: React.FC<{
  disabled: boolean;
  label: string;
  onClick: () => void;
}> = ({ disabled, label, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/60 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
    aria-label={label}
    title={label}
  >
    <LocateFixed className="h-3.5 w-3.5" />
  </button>
);

const SolverDiagnostics: React.FC<SolverDiagnosticsProps> = ({
  summary,
  momentSelection,
  deflectionSelection,
  onSelectResult,
}) => (
  <section className="mb-3 grid grid-cols-1 gap-2 text-[11px] md:grid-cols-2 xl:grid-cols-4" aria-label="求解诊断">
    <DiagnosticCard
      title="模型状态"
      value={summary.modelText}
      detail={summary.modelStatus === 'ok' ? '节点、单元、约束和荷载可继续分析' : '查看左侧模型检查列表'}
      icon={summary.modelStatus === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      className={statusStyles[summary.modelStatus]}
    />
    <DiagnosticCard
      title="控制内力"
      value={summary.demandText}
      detail="点击定位后会在结构图中高亮控制截面"
      icon={<Crosshair className="h-3 w-3" />}
      action={
        <LocateButton
          disabled={!momentSelection}
          label="定位最大弯矩"
          onClick={() => momentSelection && onSelectResult(momentSelection)}
        />
      }
    />
    <DiagnosticCard
      title="位移水平"
      value={summary.deflectionText}
      detail={ratioLabel(summary.deflectionRatio)}
      icon={<Gauge className="h-3 w-3" />}
      className={`border-slate-800 bg-slate-900/85 ${
        summary.deflectionRatio !== null && summary.deflectionRatio > 1 ? 'text-amber-200' : 'text-slate-200'
      }`}
      action={
        <LocateButton
          disabled={!deflectionSelection}
          label="定位最大位移"
          onClick={() => deflectionSelection && onSelectResult(deflectionSelection)}
        />
      }
    />
    <DiagnosticCard
      title="平衡残差"
      value={summary.equilibriumText}
      detail={`ΣFx ${summary.equilibrium.sumFx.toFixed(3)} · ΣFy ${summary.equilibrium.sumFy.toFixed(3)} · ΣM ${summary.equilibrium.sumM.toFixed(3)}`}
      icon={<Scale className="h-3 w-3" />}
      className={summary.equilibrium.allOk ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/35 bg-amber-500/10 text-amber-200'}
    />
  </section>
);

export default SolverDiagnostics;
