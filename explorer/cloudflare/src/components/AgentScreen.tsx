import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Mic, Send } from 'lucide-react';
import { AgentSession } from '../domain/types';
import { SessionService } from '../services/SessionService';
import { truncatePath } from '../utils/pathUtils';
import { Navbar } from './Navbar';

interface AgentScreenProps {
  currentPath: string;
  sessionService: SessionService;
  onOpenSettings: () => void;
  onOpenExplorer: () => void;
}

export const AgentScreen: React.FC<AgentScreenProps> = ({
  currentPath,
  sessionService,
  onOpenSettings,
  onOpenExplorer,
}) => {
  const [sessions, setSessions] = useState<AgentSession[]>(() => sessionService.getSessions());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState<boolean>(true);
  const [inputValue, setInputValue] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = activeSessionId ? sessionService.getSession(activeSessionId) : undefined;

  const refreshSessions = useCallback(() => {
    setSessions(sessionService.getSessions());
  }, [sessionService]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length]);

  const handleNewSession = () => {
    const session = sessionService.createSession(currentPath);
    refreshSessions();
    setActiveSessionId(session.id);
    setShowSessionList(false);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setShowSessionList(false);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || !activeSessionId) return;

    sessionService.addMessage(activeSessionId, 'user', inputValue.trim());
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    refreshSessions();

    // Placeholder: actual agent communication will be implemented in next milestone
    setTimeout(() => {
      sessionService.addMessage(
        activeSessionId,
        'agent',
        'Agent response will be connected in the next milestone. This is a placeholder.'
      );
      refreshSessions();
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleSessionList = () => {
    if (showSessionList && activeSessionId) {
      setShowSessionList(false);
    } else if (!showSessionList) {
      setShowSessionList(true);
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const displayPath = truncatePath(currentPath);

  // Session List View
  if (showSessionList || !activeSessionId) {
    return (
      <div className="agent-screen">
        <Navbar
          currentPath={currentPath}
          mode="agent"
          onOpenSessionList={handleToggleSessionList}
          onOpenSettings={onOpenSettings}
          onOpenExplorer={onOpenExplorer}
        />
        <div className="agent-session-list-view">
          <div className="agent-session-list">
            <button className="agent-session-new" onClick={handleNewSession}>
              <Plus size={16} />
              <span>New Session</span>
            </button>
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`agent-session-item ${session.id === activeSessionId ? 'active' : ''}`}
                onClick={() => handleSelectSession(session.id)}
              >
                <span className="agent-session-title">
                  {sessionService.getSessionTitle(session)}
                </span>
                <span className="agent-session-date">
                  {new Date(session.updatedAt).toLocaleDateString('ja-JP')}
                </span>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="agent-session-empty">
                No sessions yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Chat View
  if (!activeSession) return null;

  return (
    <div className="agent-screen">
      <Navbar
        currentPath={currentPath}
        mode="agent"
        onOpenSessionList={handleToggleSessionList}
        onOpenSettings={onOpenSettings}
        onOpenExplorer={onOpenExplorer}
      />
      <div className="agent-chat-view">
        <div className="agent-messages">
          {activeSession.messages.length === 0 && (
            <div className="agent-messages-empty">
              <p>Start a conversation with the Agent.</p>
              <p className="agent-messages-hint">
                Current context: {displayPath}
              </p>
            </div>
          )}
          {activeSession.messages.map((msg) => (
            <div key={msg.id} className={`agent-message agent-message--${msg.role}`}>
              <div className="agent-message-role">
                {msg.role === 'user' ? 'USER' : 'AGENT'}
              </div>
              <div className="agent-message-content">
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="agent-input-bar">
          <textarea
            ref={inputRef}
            className="agent-input"
            placeholder="Message the Agent..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button className="btn-icon agent-mic-btn" title="Voice Input (coming soon)">
            <Mic size={18} />
          </button>
          <button
            className="btn-icon agent-send-btn"
            onClick={handleSendMessage}
            disabled={!inputValue.trim()}
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
