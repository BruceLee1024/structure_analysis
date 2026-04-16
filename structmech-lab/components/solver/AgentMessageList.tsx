import React from 'react';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const AgentMessageList: React.FC<{ messages: AgentMessage[] }> = ({ messages }) => (
  <div className="space-y-4 overflow-y-auto px-1 py-1">
    {messages.map(message => (
      <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex max-w-[92%] items-end gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              message.role === 'user'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-slate-800 text-sky-300 shadow-sm border border-slate-700'
            }`}
          >
            {message.role === 'user' ? '你' : '助'}
          </div>
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
              message.role === 'user'
                ? 'rounded-br-md bg-sky-500 text-white'
                : 'rounded-bl-md border border-slate-700 bg-slate-800 text-slate-100'
            }`}
          >
            {message.content || (message.streaming ? '\u00a0' : '')}
            {message.streaming && (
              <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-sky-400" />
            )}
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default AgentMessageList;
