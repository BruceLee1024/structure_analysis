import React, { useState, useRef, useEffect } from 'react';
import { ArrowUpRight, Send, RefreshCw, Lightbulb, LoaderCircle, MessageSquare } from 'lucide-react';
import { sendChatCompletion } from '../utils/aiClient';
import { getAIModel } from '../utils/aiModels';

interface Message {
  role: 'assistant' | 'user';
  content: string;
  reasoning_content?: string;
  reasoning_model?: string;
  kind?: 'welcome';
}

interface AITutorProps {
  context: string;
  moduleTitle: string;
  suggestedQuestions?: string[];
}

const AITutor: React.FC<AITutorProps> = ({ context, moduleTitle, suggestedQuestions = [] }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll only the conversation; a collapsed assistant must not move the workspace.
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  // 初始化欢迎消息
  useEffect(() => {
    const welcomeMessage = getWelcomeMessage(moduleTitle);
    setMessages([{ role: 'assistant', content: welcomeMessage, kind: 'welcome' }]);
  }, [moduleTitle]);

  const getWelcomeMessage = (title: string): string => {
    const welcomes: Record<string, string> = {
      '几何组成分析': '从约束与自由度入手，判断体系是否稳定。W = 0 是必要条件，还需要检查约束的布置。',
      '静定梁': '调整荷载位置，观察支座反力、剪力和弯矩的变化。可以从整体平衡开始推导。',
      '静定刚架': '沿梁柱连接梳理传力路径，再用整体平衡与截面平衡解释内力分布。',
      '静定桁架': '铰接杆件主要承受轴力。结合节点法与截面法，判断各杆件的拉压状态。',
      '静定拱': '观察水平推力如何改变内力分布，理解合理拱轴线与荷载的关系。',
      '组合结构': '先识别基本部分与附属部分，再按传力顺序分析各部分的受力。',
      '静力法作影响线': '沿梁移动单位荷载，用平衡方程观察反力和截面内力如何变化。',
      '机动法作影响线': '解除相应约束，借助虚位移和虚功原理理解影响线的形状。',
      '内力包络图': '观察移动荷载的不同位置，找到各截面的控制内力与最不利位置。',
      '影响线应用': '将荷载与影响线纵标对应起来，分析集中力、均布荷载和荷载组的作用。',
    };
    return welcomes[title] || '结合当前图表与计算结果，逐步理解受力关系。可以选择一个问题开始，或直接描述你的疑问。';
  };

  const callAIAPI = async (userMessage: string): Promise<Message> => {
    const systemPrompt = `你是一位经验丰富的结构力学教师，名叫"结构力学助教"。你的教学风格是：
1. 启发式教学：不直接给答案，而是通过提问引导学生思考
2. 循序渐进：从简单概念开始，逐步深入
3. 联系实际：用工程实例帮助理解抽象概念
4. 鼓励探索：表扬学生的思考，即使答案不完全正确

当前学生正在学习：${moduleTitle}
当前页面的参数和状态：${context}

回答要求：
- 简洁明了，每次回复不超过150字
- 多用提问引导思考
- 适当使用emoji增加亲和力
- 如果学生问的问题与当前模块相关，结合页面上的具体数值来解释`;

    try {
      const model = getAIModel();
      let reasoning: string | undefined;
      const response = await sendChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content,
            ...(m.reasoning_model === model.model && m.reasoning_content ? { reasoning_content: m.reasoning_content } : {}),
          })),
          { role: 'user', content: userMessage },
        ],
        { maxTokens: 300, temperature: 0.7, onReasoning: value => { reasoning = value; } },
      );
      setIsConnected(true);
      setHasError(false);
      return { role: 'assistant', content: response, reasoning_content: reasoning, reasoning_model: model.model };
    } catch (error) {
      console.error('AI API error:', error);
      setIsConnected(false);
      setHasError(true);
      if (error instanceof Error && error.message === '未配置 API Key') {
        return { role: 'assistant', content: '尚未配置模型。请打开顶部「AI 模型设置」，填写 API Key 后再提问。' };
      }
      return { role: 'assistant', content: '暂时未能获取回复。请检查网络和模型配置后重试。' };
    }
  };

  const handleSend = async (messageToSend?: string) => {
    const message = messageToSend || input.trim();
    if (!message || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);
    setHasError(false);

    const response = await callAIAPI(message);
    setMessages(prev => [...prev, response]);
    setIsLoading(false);
  };

  const handleSuggestedQuestion = (question: string) => {
    handleSend(question);
  };

  const handleReset = () => {
    const welcomeMessage = getWelcomeMessage(moduleTitle);
    setMessages([{ role: 'assistant', content: welcomeMessage, kind: 'welcome' }]);
    setInput('');
    setHasError(false);
  };

  const connectionLabel = isLoading ? '回复中' : hasError ? '连接失败' : isConnected ? '已连接' : '待提问';
  const showSuggestions = messages.length === 1 && messages[0].kind === 'welcome';

  return (
    <section className="ai-tutor" aria-label={`${moduleTitle} AI 助教`}>
      <header className="ai-tutor-header">
        <div className="ai-tutor-heading"><h3>AI 助教</h3><span>{moduleTitle} · 学习辅助</span></div>
        <div className="ai-tutor-tools">
          <span className={`ai-tutor-connection ${hasError ? 'is-error' : isConnected ? 'is-connected' : ''}`} role="status"><i aria-hidden="true" />{connectionLabel}</span>
          <button type="button" onClick={handleReset} disabled={isLoading} className="ai-tutor-reset" title="重新开始对话" aria-label="重新开始对话"><RefreshCw size={14} aria-hidden="true" /></button>
        </div>
      </header>

      <div ref={messagesContainerRef} role="log" aria-label="AI 助教对话" className="ai-tutor-conversation" aria-busy={isLoading}>
        {messages.map((msg, idx) => msg.kind === 'welcome' ? (
          <div key={idx} className="ai-tutor-start">
            <div className="ai-tutor-intro"><span className="ai-tutor-intro-label"><MessageSquare size={13} aria-hidden="true" />学习提示</span><p>{msg.content}</p></div>
            {showSuggestions && suggestedQuestions.length > 0 && <div className="ai-tutor-suggestions">
              <div className="ai-tutor-suggestion-label"><Lightbulb size={13} aria-hidden="true" />从这些问题开始</div>
              {suggestedQuestions.map(question => <button key={question} type="button" onClick={() => handleSuggestedQuestion(question)} disabled={isLoading}><span>{question}</span><ArrowUpRight size={13} aria-hidden="true" /></button>)}
            </div>}
          </div>
        ) : (
          <article key={idx} className={`ai-tutor-message ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}>
            <span className="ai-tutor-message-label">{msg.role === 'user' ? '你' : 'AI 助教'}</span><div>{msg.content}</div>
          </article>
        ))}
        {isLoading && <div className="ai-tutor-thinking" role="status"><LoaderCircle size={14} aria-hidden="true" />正在结合当前结构分析…</div>}
      </div>

      <form className="ai-tutor-composer" onSubmit={e => { e.preventDefault(); void handleSend(); }}>
        <div className="ai-tutor-input-box">
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={3} aria-label="向 AI 助教提问" placeholder="输入你的问题..." disabled={isLoading}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void handleSend(); } }} />
          <div className="ai-tutor-input-actions"><span>Enter 发送 · Shift + Enter 换行</span><button type="submit" aria-label="发送消息" disabled={isLoading || !input.trim()}>{isLoading ? <LoaderCircle size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}</button></div>
        </div>
        <p className="ai-tutor-footnote">可以询问受力、公式和求解步骤。</p>
      </form>
    </section>
  );
};

export default AITutor;
