import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AiChatPanelProps {
  onClose: () => void;
}

export function AiChatPanel({ onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I am the campus assistant. I can help you with information about the school premises like buildings, parking, and emergency buttons. How can I help you today?' }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputVal.trim() || isLoading) return;
    
    const userMessage = inputVal.trim();
    setInputVal('');
    
    // Add user message, and an empty assistant message to stream into
    setMessages(prev => [
      ...prev, 
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' } // Place-holder for streaming
    ]);
    setIsLoading(true);

    try {
      const BASE_URL = typeof window !== "undefined"
         ? (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api")
         : "http://localhost:8000/api";

      const response = await fetch(`${BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) throw new Error('Failed to chat');
      if (!response.body) throw new Error('No readable stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamedResponse = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          streamedResponse += chunk;
          
          setMessages(prev => {
            const newMessages = [...prev];
            // Update the very last message (the assistant's current stream)
            newMessages[newMessages.length - 1] = { role: 'assistant', content: streamedResponse };
            return newMessages;
          });
        }
      }
    } catch (err) {
      setMessages(prev => {
         const copy = [...prev];
         copy[copy.length - 1] = { role: 'assistant', content: 'Sorry, I am having trouble connecting to the network right now.' };
         return copy;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="absolute inset-0 md:inset-auto md:top-0 md:right-0 w-full md:w-[400px] max-w-full bg-white h-full flex flex-col shadow-2xl z-[2000] border-l md:border-r border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 p-5 border-b border-gray-100 bg-purple-50">
        <button onClick={onClose} className="text-purple-600 hover:text-purple-800 transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Ask AI
          </h2>
          <p className="text-xs text-purple-700 opacity-90 font-medium">Campus Information Assistant</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-yellow-50 px-4 py-2 text-xs text-yellow-700 font-medium border-b border-yellow-100 flex items-start gap-2">
        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>I can only answer questions related to the school premises. I do not have general knowledge.</p>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user' 
                ? 'bg-blue-500 text-white rounded-tr-sm' 
                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm markdown-body overflow-hidden break-words'
            }`}>
              {m.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    ul: ({node, ...props}) => <ul className="list-disc ml-4 my-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal ml-4 my-1" {...props} />,
                    li: ({node, ...props}) => <li className="my-0.5" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold text-gray-950" {...props} />,
                    a: ({node, ...props}) => <a className="text-blue-600 hover:underline" {...props} />
                }}>
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1.5 items-center">
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full p-1.5 focus-within:ring-2 focus-within:ring-purple-100 focus-within:border-purple-300 transition-all">
          <input 
            type="text" 
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask about parking, buildings..."
            className="flex-1 bg-transparent px-3 py-1.5 text-sm outline-none text-gray-800 placeholder-gray-400"
          />
          <button 
            onClick={handleSend}
            disabled={!inputVal.trim() || isLoading}
            className="w-8 h-8 flex items-center justify-center bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white rounded-full transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
