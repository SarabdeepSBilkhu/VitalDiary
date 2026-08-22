import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../utils/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AiAssistantProps {
  showToast: (message: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ showToast }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am your VitalDiary AI health companion. I can analyze your health logs, check your medication schedules, summarize medical reports, or provide general wellness insights.\n\nHow can I help you today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestionPrompts = [
    "Analyze my blood pressure trend",
    "Review my medication schedules",
    "Summarize my recent report findings",
    "How can I improve my blood oxygen?"
  ];

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setApiKeyError(null);

    try {
      // Create request payload with existing messages
      const conversationHistory = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const res = await api.sendAiMessage(conversationHistory);
      
      if (res && res.reply) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.reply.content
        }]);
      } else {
        throw new Error('Invalid response format received.');
      }
    } catch (err) {
      console.error(err);
      const errorMsg = err instanceof Error ? err.message : '';
      
      // Check if it's the specific API key error
      if (errorMsg.includes('Groq API Key is not configured')) {
        setApiKeyError('Groq API Key is missing on the server. Please define the GROQ_API_KEY environment variable.');
        showToast('Groq API Key is not configured on the server.', 'danger');
      } else {
        showToast('Failed to get response from AI Assistant.', 'danger');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "I'm sorry, I encountered an issue communicating with the AI server. Please make sure the Groq API Key is set up correctly in the server's environment configuration."
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Chat history cleared. How can I help you with your health logs or vitals today?"
      }
    ]);
    setApiKeyError(null);
    showToast('Chat history cleared.', 'info');
  };


  return (
    <div className="ai-assistant-container">
      
      {/* Header Banner */}
      <div className="ai-chat-header">
        <div className="d-flex align-center gap-2">
          <div className="ai-avatar bot">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="m-0 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>VitalDiary AI Companion</h3>
            <span className="text-xs text-muted">Powered by Groq Llama 3.3</span>
          </div>
        </div>
        
        <button className="btn btn-outline btn-sm d-flex align-center gap-1" style={{ minHeight: '32px' }} onClick={handleResetChat}>
          <RefreshCw size={12} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Warning banner for missing API key */}
      {apiKeyError && (
        <div className="ai-warning-banner">
          <AlertTriangle className="text-danger flex-shrink-0" size={18} />
          <div>
            <h4 className="ai-warning-title">Server Configuration Required</h4>
            <p className="ai-warning-desc">
              {apiKeyError} Add <code>GROQ_API_KEY=your_api_key</code> to the server's <code>.env</code> file, then restart the backend server.
            </p>
          </div>
        </div>
      )}

      {/* Chat Messages Panel */}
      <div className="ai-chat-messages">
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`ai-message-row ${msg.role === 'user' ? 'user' : 'bot'}`}
          >
            {/* Avatar */}
            <div className={`ai-avatar ${msg.role === 'user' ? 'user' : 'bot'}`}>
              {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
            </div>

            {/* Bubble */}
            <div className="ai-bubble">
              {msg.role === 'user' ? (
                <p className="m-0" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              ) : (
                <div className="ai-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* Loading Indicator Bubble */}
        {loading && (
          <div className="ai-message-row bot">
            <div className="ai-avatar bot">
              <Bot size={15} />
            </div>
            <div className="ai-bubble">
              <div className="ai-thinking-bubble">
                <span className="ai-dot"></span>
                <span className="ai-dot"></span>
                <span className="ai-dot"></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      {messages.length === 1 && !loading && (
        <div className="ai-suggestions">
          <span className="ai-suggestions-title font-medium">
            <HelpCircle size={12} /> Suggested Questions:
          </span>
          <div className="ai-suggestions-list">
            {suggestionPrompts.map((prompt, index) => (
              <button 
                key={index} 
                className="ai-suggestion-btn"
                onClick={() => handleSend(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input panel */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="ai-input-form"
      >
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your blood pressure, medications, reports..."
          className="ai-input-field"
          disabled={loading}
        />
        <button 
          type="submit" 
          className="ai-send-btn"
          disabled={loading || !input.trim()}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
