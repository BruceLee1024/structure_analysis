import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, RefreshCw, Lightbulb } from 'lucide-react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初始化欢迎消息
  useEffect(() => {
    const welcomeMessage = getWelcomeMessage(moduleTitle);
    setMessages([{ role: 'assistant', content: welcomeMessage }]);
  }, [moduleTitle]);

  const getWelcomeMessage = (title: string): string => {
    const welcomes: Record<string, string> = {
      '几何组成分析': '👋 欢迎来到几何组成分析模块！\n\n这是结构力学的基础。我们需要先判断一个结构是否能够承受荷载。\n\n🤔 思考题：为什么自由度 W=0 是结构稳定的必要条件，但不是充分条件？',
      '静定梁': '👋 欢迎学习静定梁！\n\n梁是最基本的结构构件。试着调整荷载位置，观察反力和弯矩的变化。\n\n🤔 关键问题：简支梁上集中力作用点的弯矩最大，为什么？',
      '静定刚架': '👋 欢迎来到静定刚架模块！\n\n刚架与梁的区别在于节点是刚性连接的。\n\n🤔 思考：三铰刚架顶部铰处弯矩为零，这个条件如何帮助我们求解？',
      '静定桁架': '👋 欢迎学习静定桁架！\n\n桁架的特点是所有杆件只承受轴力。\n\n🤔 问题：为什么桁架杆件没有弯矩？这与节点的连接方式有什么关系？',
      '静定拱': '👋 欢迎来到静定拱模块！\n\n拱是一种非常高效的结构形式。观察水平推力如何减小弯矩。\n\n🤔 思考：为什么说"拱的合理轴线"能使弯矩为零？',
      '组合结构': '👋 欢迎学习组合结构！\n\n组合结构由不同类型的结构组合而成。\n\n🤔 关键：分析组合结构时，应该按什么顺序进行？',
    };
    return welcomes[title] || `👋 欢迎来到${title}模块！有什么问题可以问我。`;
  };

  // AI 模型配置
  const AI_MODELS = [
    { id: 'deepseek', name: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    { id: 'qwen', name: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo' },
    { id: 'zhipu', name: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
    { id: 'moonshot', name: 'Moonshot', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
    { id: 'doubao', name: '豆包', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-lite-4k' },
  ];

  const callAIAPI = async (userMessage: string): Promise<string> => {
    const apiKey = localStorage.getItem('ai_api_key');
    const modelId = localStorage.getItem('ai_model') || 'deepseek';
    const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0];
    
    if (!apiKey) {
      return '⚠️ 未配置 API Key。请点击左侧"设置"按钮配置 AI 模型和 API Key。';
    }

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
      setIsConnected(true);
      const response = await fetch(model.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '抱歉，我没有理解你的问题。';
    } catch (error) {
      console.error('AI API error:', error);
      setIsConnected(false);
      return '⚠️ 连接失败，请检查网络或API配置。';
    }
  };

  const handleSend = async (messageToSend?: string) => {
    const message = messageToSend || input.trim();
    if (!message || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);

    const response = await callAIAPI(message);
    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    setIsLoading(false);
  };

  const handleSuggestedQuestion = (question: string) => {
    handleSend(question);
  };

  const handleReset = () => {
    const welcomeMessage = getWelcomeMessage(moduleTitle);
    setMessages([{ role: 'assistant', content: welcomeMessage }]);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md">
            <Bot size={20} />
          </div>
          <span className="font-bold text-base text-slate-800">AI 助教</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${isConnected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {isConnected ? '已连接' : '待连接'}
          </span>
          <button onClick={handleReset} className="p-2 hover:bg-white/60 rounded-lg transition-colors" title="重置对话">
            <RefreshCw size={16} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-md' 
                : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && messages.length <= 2 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={14} className="text-amber-500" />
            <span className="text-xs text-slate-500 font-medium">试试问这些：</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestedQuestion(q)}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors font-medium"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入你的问题..."
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AITutor;
