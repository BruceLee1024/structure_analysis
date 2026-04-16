import React, { useMemo, useRef, useState } from 'react';
import { Bot, Send, Sparkles, ImagePlus, X as XIcon, Loader2 } from 'lucide-react';
import type { AnalysisResult, SolverParams } from '@/types';
import { buildModelSummary } from '@/utils/agent/modelSummary';
import type { AgentAction, AgentParseResult } from '@/utils/agent/types';
import AgentActionCard from './AgentActionCard';
import AgentMessageList, { type AgentMessage } from './AgentMessageList';
import VisionResultEditor from './VisionResultEditor';

interface AgentPanelProps {
  params: SolverParams;
  results: AnalysisResult;
  parseInput: (text: string, contextHint?: string, onChunk?: (delta: string) => void) => Promise<AgentParseResult>;
  onApplyActions: (actions: AgentAction[], summary: string) => string | void;
  onExplainResults: (question: string, onChunk?: (delta: string) => void) => Promise<string>;
  onParseImage?: (imageDataUrl: string, userHint?: string, onProgress?: (status: string) => void) => Promise<AgentParseResult>;
  onUndo: () => string | void;
  canUndo: boolean;
  variant?: 'inline' | 'sidebar';
  className?: string;
  messageClassName?: string;
}

const defaultPanelClassName = 'mb-4 flex flex-shrink-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-3';
const defaultMessageClassName = 'max-h-56 overflow-hidden rounded-xl bg-slate-950/60 p-2';

const AgentPanel: React.FC<AgentPanelProps> = ({
  params,
  results,
  parseInput,
  onApplyActions,
  onExplainResults,
  onParseImage,
  onUndo,
  canUndo,
  variant = 'inline',
  className,
  messageClassName,
}) => {
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pending, setPending] = useState<AgentParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(variant !== 'sidebar');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageRecognizing, setImageRecognizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelSummary = useMemo(() => buildModelSummary(params, results), [params, results]);
  const quickPrompts = useMemo(
    () => [
      '最大位移是多少？',
      '为什么最大弯矩出现在这里？',
      modelSummary.loadCount > 0 ? '把它再大一点' : '在第二跨跨中加 20kN 向下集中力',
    ],
    [modelSummary.loadCount],
  );
  const statusText = results.error
    ? `求解状态：${results.error}`
    : modelSummary.resultSummary[0] ?? `求解状态：已完成计算，当前共 ${modelSummary.loadCount} 个荷载`;
  const latestAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant');

  function describeAction(action: AgentAction): string {
    const p = action.payload;
    switch (action.kind) {
      case 'create_structure': return `创建结构${p.structureType ? `（${String(p.structureType)}）` : ''}`;
      case 'create_custom_structure': return `创建自定义结构（${Array.isArray(p.nodes) ? p.nodes.length : 0}节点/${Array.isArray(p.elements) ? p.elements.length : 0}单元）`;
      case 'add_load': {
        const type = p.loadType === 'distributed' ? '均布荷载' : p.loadType === 'moment' ? '力矩' : '集中力';
        const span = p.targetSpan ? `第${String(p.targetSpan)}跨` : '';
        const mag = p.magnitude ? `${Math.abs(Number(p.magnitude))}kN` : '';
        return [type, span, mag].filter(Boolean).join(' ');
      }
      case 'update_load': return '修改荷载';
      case 'remove_load': return '移除荷载';
      case 'update_geometry': return '调整几何';
      case 'update_material': return '修改材料';
      case 'update_support': return '调整支座';
      case 'explain_results': return '分析结果';
      case 'summarize_model': return '模型概要';
      case 'undo_last_agent_action': return '撤销操作';
      default: return action.kind;
    }
  }

  async function executeParsedActions(parsed: AgentParseResult, fallbackQuestion: string) {
    const explainAction = parsed.actions.find(action => action.kind === 'explain_results');
    const executableActions = parsed.actions.filter(action => action.kind !== 'explain_results');

    if (executableActions.length > 0) {
      const toolMsgId = `assistant-tools-${Date.now()}`;
      const pendingLines = executableActions.map(a => `▸ ${describeAction(a)}`).join('\n');
      setMessages(prev => [...prev, { id: toolMsgId, role: 'assistant', content: pendingLines, streaming: true }]);

      await new Promise(resolve => requestAnimationFrame(resolve));

      const feedback = onApplyActions(executableActions, parsed.summary);
      const doneLines = executableActions.map(a => `✓ ${describeAction(a)}`).join('\n');
      const finalContent = feedback ? `${doneLines}\n${feedback}` : doneLines;
      setMessages(prev =>
        prev.map(m => (m.id === toolMsgId ? { ...m, content: finalContent, streaming: false } : m)),
      );
    }

    if (explainAction) {
      const question = String(explainAction.payload.question ?? fallbackQuestion);
      const msgId = `assistant-explain-${Date.now()}`;
      const toolLabel = `▸ ${describeAction(explainAction)}\n`;
      setMessages(prev => [...prev, { id: msgId, role: 'assistant', content: toolLabel, streaming: true }]);
      setStreamingId(msgId);

      const onChunk = (delta: string) => {
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: m.content + delta } : m)),
        );
      };

      try {
        const finalAnswer = await onExplainResults(question, onChunk);
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: finalAnswer, streaming: false } : m)),
        );
      } catch {
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, content: '解释请求失败，请重试。', streaming: false } : m)),
        );
      } finally {
        setStreamingId(null);
      }
    }
  }

  function pushAssistantMessage(content: string, prefix: string) {
    setMessages(prev => [...prev, { id: `${prefix}-${prev.length}`, role: 'assistant', content }]);
  }

  async function handleSend(nextText?: string) {
    const text = (nextText ?? value).trim();
    if (!text || isLoading || streamingId !== null) return;
    setMessages(prev => [...prev, { id: `user-${prev.length}`, role: 'user', content: text }]);
    if (!nextText) setValue('');
    setIsLoading(true);

    const contextHint = pending?.summary ?? undefined;
    if (pending) setPending(null);

    const thinkingId = `assistant-thinking-${Date.now()}`;
    setMessages(prev => [...prev, { id: thinkingId, role: 'assistant', content: '', streaming: true }]);

    const onChunk = (delta: string) => {
      setMessages(prev =>
        prev.map(m => (m.id === thinkingId ? { ...m, content: m.content + delta } : m)),
      );
    };

    try {
      const parsed = await parseInput(text, contextHint, onChunk);
      setMessages(prev =>
        prev.map(m => (m.id === thinkingId ? { ...m, content: parsed.summary, streaming: false } : m)),
      );

      if (parsed.requiresConfirmation) {
        setPending(parsed);
        return;
      }

      await executeParsedActions(parsed, text);
    } catch {
      setMessages(prev =>
        prev.map(m => (m.id === thinkingId ? { ...m, content: '解析失败，请重试。', streaming: false } : m)),
      );
    } finally {
      setIsLoading(false);
      if (nextText) setValue('');
    }
  }

  async function handleConfirm() {
    if (!pending) return;
    await executeParsedActions(pending, pending.userText);
    setPending(null);
  }

  async function handleVisionConfirm(corrected: AgentParseResult) {
    await executeParsedActions(corrected, corrected.userText);
    setPending(null);
  }

  const isVisionPending = pending?.actions.some(a => a.kind === 'create_custom_structure') ?? false;

  function handleUndoClick() {
    const feedback = onUndo();
    if (feedback) {
      pushAssistantMessage(feedback, 'assistant-undo');
    }
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      pushAssistantMessage('请上传图片文件（JPG/PNG/WebP）', 'assistant-error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClearImage() {
    setImagePreview(null);
  }

  async function handleImageRecognize() {
    if (!imagePreview || !onParseImage || isLoading || imageRecognizing) return;
    setImageRecognizing(true);
    setShowHistory(true);

    const statusMsgId = `assistant-vision-${Date.now()}`;
    setMessages(prev => [...prev,
      { id: `user-img-${Date.now()}`, role: 'user', content: `🖼️ 上传了一张结构力学图片${value.trim() ? `（补充：${value.trim()}）` : ''}` },
      { id: statusMsgId, role: 'assistant', content: '正在识别图片中的结构信息...', streaming: true },
    ]);

    const onProgress = (status: string) => {
      setMessages(prev =>
        prev.map(m => (m.id === statusMsgId ? { ...m, content: status } : m)),
      );
    };

    try {
      const parsed = await onParseImage(imagePreview, value.trim() || undefined, onProgress);
      const summaryContent = parsed.actions.length > 0
        ? `识别完成：${parsed.summary}\n共识别出 ${parsed.actions.length} 个操作，请确认后执行。`
        : parsed.summary;
      setMessages(prev =>
        prev.map(m => (m.id === statusMsgId ? { ...m, content: summaryContent, streaming: false } : m)),
      );
      if (parsed.actions.length > 0) {
        setPending(parsed);
      }
    } catch {
      setMessages(prev =>
        prev.map(m => (m.id === statusMsgId ? { ...m, content: '图片识别失败，请重试。', streaming: false } : m)),
      );
    } finally {
      setImageRecognizing(false);
      setImagePreview(null);
      setValue('');
    }
  }

  return (
    <section className={className ?? defaultPanelClassName}>
      {variant === 'sidebar' ? (
        <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-slate-100">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-sky-500/20 p-1.5 text-sky-300 ring-1 ring-sky-400/20">
              <Bot size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold leading-none text-slate-100">结构助手</h2>
              <p className="mt-0.5 text-[10px] leading-none text-slate-400">一句话输入，底层自动解析与执行</p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              已同步
            </span>
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              className="shrink-0 rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:bg-slate-800"
            >
              {showHistory ? '折叠' : '展开'}
            </button>
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndoClick}
              className="shrink-0 rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
            >
              撤销
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Agent 模式</h2>
            <p className="text-xs text-slate-400">自然语言建模、改荷载、问结果</p>
          </div>
          <button
            type="button"
            disabled={!canUndo}
            onClick={handleUndoClick}
            className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
          >
            撤销上一步
          </button>
        </div>
      )}

      {variant === 'sidebar' ? (
        <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/70 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
              {modelSummary.structureLabel}
            </span>
            <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
              {modelSummary.loadCount} 个荷载
            </span>
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              {modelSummary.supportSummary}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-300">{modelSummary.geometrySummary}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">{statusText}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickPrompts.map(prompt => (
              <button
                key={prompt}
                type="button"
                onClick={() => void handleSend(prompt)}
                className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-sky-200 transition-colors hover:border-sky-500/40 hover:bg-slate-700"
              >
                <Sparkles size={9} className="shrink-0 text-amber-400/70" />
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {variant === 'sidebar' && !showHistory ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
          {latestAssistantMessage?.content ?? '等待输入后自动解析。高风险操作才会要求确认。'}
        </div>
      ) : (
        <div className={messageClassName ?? defaultMessageClassName}>
          <AgentMessageList messages={messages} />
        </div>
      )}

      {pending ? (
        <div className="mt-2">
          {isVisionPending ? (
            <VisionResultEditor
              parsed={pending}
              onConfirm={handleVisionConfirm}
              onCancel={() => setPending(null)}
            />
          ) : (
            <AgentActionCard parsed={pending} onConfirm={handleConfirm} />
          )}
        </div>
      ) : null}

      {imagePreview && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-2">
          <img src={imagePreview} alt="预览" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-violet-200">已选择图片，点击“识别”开始分析</p>
            <p className="text-[10px] text-slate-400">可在输入框补充描述（可选）</p>
          </div>
          <button
            type="button"
            onClick={handleImageRecognize}
            disabled={imageRecognizing}
            className="shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-violet-400 disabled:opacity-50"
          >
            {imageRecognizing ? <Loader2 size={14} className="animate-spin" /> : '识别'}
          </button>
          <button type="button" onClick={handleClearImage} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <XIcon size={14} />
          </button>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
        {onParseImage && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || imageRecognizing}
            title="上传结构力学图片识别"
            className={`shrink-0 rounded-xl p-2 transition-colors disabled:opacity-40 ${
              variant === 'sidebar'
                ? 'border border-slate-700 bg-slate-900 text-violet-300 hover:bg-slate-800 hover:text-violet-200'
                : 'border border-slate-700 bg-slate-950 text-violet-300 hover:bg-slate-900'
            }`}
          >
            <ImagePlus size={18} />
          </button>
        )}
        <input
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              if (imagePreview) void handleImageRecognize();
              else void handleSend();
            }
          }}
          placeholder={imagePreview ? '补充描述（可选）...' : variant === 'sidebar' ? '输入一句话，系统会自动解析...' : '输入建模或荷载指令...'}
          className={`flex-1 rounded-xl px-3 py-2 text-sm outline-none ${
            variant === 'sidebar'
              ? 'border border-slate-700 bg-slate-900 text-slate-100 shadow-sm'
              : 'border border-slate-700 bg-slate-950 text-slate-100'
          }`}
        />
        <button
          type="button"
          onClick={() => { if (imagePreview) void handleImageRecognize(); else void handleSend(); }}
          disabled={isLoading || streamingId !== null || imageRecognizing}
          className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
            variant === 'sidebar'
              ? imagePreview ? 'bg-violet-500 text-white shadow-md hover:bg-violet-400' : 'bg-sky-500 text-slate-950 shadow-md hover:bg-sky-400'
              : imagePreview ? 'bg-violet-400 text-white' : 'bg-sky-400 text-slate-950'
          }`}
        >
          {imagePreview
            ? (imageRecognizing ? <Loader2 size={16} className="animate-spin" /> : '识别')
            : (variant === 'sidebar' ? <Send size={16} /> : '发送')}
        </button>
      </div>
    </section>
  );
};

export default AgentPanel;
