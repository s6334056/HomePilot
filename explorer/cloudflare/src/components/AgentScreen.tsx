import React, { useState, useRef, useEffect } from 'react';
import { Plus, Mic, Send, Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';
import { OpenCodeSessionInfo } from '../domain/types';
import { useOpenCode, OpenCodeMessageWithParts } from '../hooks/useOpenCode';
import { Navbar } from './Navbar';

interface AgentScreenProps {
  currentPath: string;
  openCodeUrl: string;
  onOpenSettings: () => void;
  onOpenExplorer: () => void;
}

export const AgentScreen: React.FC<AgentScreenProps> = ({
  currentPath,
  openCodeUrl,
  onOpenSettings,
  onOpenExplorer,
}) => {
  const [state, actions] = useOpenCode();
  const [showSessionList, setShowSessionList] = useState<boolean>(true);
  const [inputValue, setInputValue] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    connectionStatus,
    sessions,
    selectedSessionID,
    selectedSession,
    messages,
    sessionStatus,
    pendingPermissions,
    isLoadingSessions,
    isLoadingMessages,
    error,
  } = state;

  const activeSession = selectedSession;

  useEffect(() => {
    if (openCodeUrl && !connected) {
      actions.connect(openCodeUrl);
      setConnected(true);
    }
  }, [openCodeUrl, connected, actions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleNewSession = async () => {
    const sessionID = await actions.createSession();
    if (sessionID) {
      await actions.selectSession(sessionID);
      setShowSessionList(false);
    }
  };

  const handleSelectSession = async (id: string) => {
    await actions.selectSession(id);
    setShowSessionList(false);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedSessionID) return;
    const content = inputValue.trim();
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await actions.sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleSessionList = () => {
    if (showSessionList && selectedSessionID) {
      setShowSessionList(false);
    } else if (!showSessionList) {
      setShowSessionList(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const handleReconnect = () => {
    setConnected(false);
    actions.disconnect();
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi size={14} className="oc-status-connected" />;
      case 'connecting':
        return <Loader2 size={14} className="oc-status-connecting" />;
      case 'error':
        return <AlertCircle size={14} className="oc-status-error" />;
      default:
        return <WifiOff size={14} className="oc-status-disconnected" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  const formatSessionTitle = (session: OpenCodeSessionInfo): string => {
    if (session.title && session.title.trim()) {
      return session.title.length > 40
        ? session.title.slice(0, 37) + '...'
        : session.title;
    }
    if (session.slug) return session.slug;
    return session.id.slice(0, 12) + '...';
  };

  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderPermissionDialog = () => {
    if (pendingPermissions.length === 0) return null;
    const perm = pendingPermissions[0];
    return (
      <div className="oc-dialog-overlay">
        <div className="oc-dialog">
          <div className="oc-dialog-header">
            <AlertCircle size={18} />
            <span>Permission Required</span>
          </div>
          <div className="oc-dialog-body">
            <div className="oc-dialog-permission-type">{perm.permission}</div>
            {perm.patterns && perm.patterns.length > 0 && (
              <div className="oc-dialog-patterns">
                {perm.patterns.map((p, i) => (
                  <code key={i}>{p}</code>
                ))}
              </div>
            )}
            {perm.metadata && (
              <div className="oc-dialog-metadata">
                {Object.entries(perm.metadata).map(([key, value]) => (
                  <div key={key} className="oc-dialog-metadata-item">
                    <span className="oc-dialog-metadata-key">{key}:</span>
                    <span className="oc-dialog-metadata-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="oc-dialog-actions">
            <button
              className="oc-btn oc-btn-deny"
              onClick={() => actions.respondPermission(perm.id, 'deny')}
            >
              Deny
            </button>
            <button
              className="oc-btn oc-btn-grant"
              onClick={() => actions.respondPermission(perm.id, 'grant')}
            >
              Allow
            </button>
            {perm.always && perm.always.length > 0 && (
              <button
                className="oc-btn oc-btn-always"
                onClick={() => actions.respondPermission(perm.id, 'always')}
              >
                Always Allow
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMessageContent = (msg: OpenCodeMessageWithParts) => {
    if (msg.contentText) {
      return <div className="oc-message-content">{msg.contentText}</div>;
    }

    if (msg.parts.length > 0) {
      return (
        <div className="oc-message-parts">
          {msg.parts.map((part) => {
            if (part.type === 'text' && part.text) {
              return (
                <div key={part.id} className="oc-message-part oc-message-part--text">
                  {part.text}
                </div>
              );
            }
            if (part.type === 'reasoning') {
              return (
                <div key={part.id} className="oc-message-part oc-message-part--reasoning">
                  <span className="oc-part-label">Thinking...</span>
                  {part.text && <div className="oc-reasoning-text">{part.text}</div>}
                </div>
              );
            }
            if (part.type === 'tool') {
              const toolState = part.state?.status || 'unknown';
              return (
                <div key={part.id} className="oc-message-part oc-message-part--tool">
                  <span className="oc-tool-name">{part.tool}</span>
                  <span className={`oc-tool-status oc-tool-status--${toolState}`}>
                    {toolState}
                  </span>
                  {part.state?.input && (
                    <pre className="oc-tool-input">
                      {JSON.stringify(part.state.input, null, 2)}
                    </pre>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }

    if (msg.role === 'assistant') {
      return (
        <div className="oc-message-content oc-message-streaming">
          <Loader2 size={14} className="oc-spinning" />
          <span>Processing...</span>
        </div>
      );
    }

    return null;
  };

  if (connectionStatus === 'disconnected' || connectionStatus === 'connecting') {
    return (
      <div className="agent-screen">
        <Navbar
          currentPath={currentPath}
          mode="agent"
          onOpenSessionList={handleToggleSessionList}
          onOpenSettings={onOpenSettings}
          onOpenExplorer={onOpenExplorer}
        />
        <div className="oc-connecting-screen">
          <div className="oc-connecting-content">
            {connectionStatus === 'connecting' ? (
              <>
                <Loader2 size={32} className="oc-spinning" />
                <p>Connecting to OpenCode Server...</p>
                <p className="oc-connecting-url">{openCodeUrl}</p>
              </>
            ) : (
              <>
                <WifiOff size={32} />
                <p>Not connected to OpenCode Server</p>
                <p className="oc-connecting-url">{openCodeUrl}</p>
                <button className="oc-btn oc-btn-connect" onClick={handleReconnect}>
                  Connect
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="agent-screen">
        <Navbar
          currentPath={currentPath}
          mode="agent"
          onOpenSessionList={handleToggleSessionList}
          onOpenSettings={onOpenSettings}
          onOpenExplorer={onOpenExplorer}
        />
        <div className="oc-connecting-screen">
          <div className="oc-connecting-content">
            <AlertCircle size={32} className="oc-status-error" />
            <p>Failed to connect to OpenCode Server</p>
            <p className="oc-connecting-url">{openCodeUrl}</p>
            <button className="oc-btn oc-btn-connect" onClick={handleReconnect}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSessionList || !selectedSessionID) {
    return (
      <div className="agent-screen">
        <Navbar
          currentPath={currentPath}
          mode="agent"
          onOpenSessionList={handleToggleSessionList}
          onOpenSettings={onOpenSettings}
          onOpenExplorer={onOpenExplorer}
        />
        <div className="oc-session-header">
          <div className="oc-connection-status">
            {getConnectionStatusIcon()}
            <span>{getConnectionStatusText()}</span>
          </div>
        </div>
        {error && (
          <div className="oc-error-banner">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
        <div className="agent-session-list-view">
          <div className="agent-session-list">
            <button className="agent-session-new" onClick={handleNewSession} disabled={isLoadingSessions}>
              <Plus size={16} />
              <span>New Session</span>
            </button>
            {isLoadingSessions && sessions.length === 0 && (
              <div className="oc-loading">Loading sessions...</div>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`agent-session-item ${session.id === selectedSessionID ? 'active' : ''}`}
                onClick={() => handleSelectSession(session.id)}
              >
                <span className="agent-session-title">
                  {formatSessionTitle(session)}
                </span>
                <span className="agent-session-date">
                  {formatTime(session.time?.updated)}
                </span>
              </button>
            ))}
            {sessions.length === 0 && !isLoadingSessions && (
              <div className="agent-session-empty">
                No sessions yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
      <div className="oc-session-header">
        <div className="oc-connection-status">
          {getConnectionStatusIcon()}
          <span>{getConnectionStatusText()}</span>
        </div>
        {sessionStatus && (
          <div className={`oc-session-status oc-session-status--${sessionStatus.type}`}>
            {sessionStatus.type}
          </div>
        )}
      </div>
      {error && (
        <div className="oc-error-banner">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      <div className="agent-chat-view">
        <div className="agent-messages">
          {messages.length === 0 && !isLoadingMessages && (
            <div className="agent-messages-empty">
              <p>Start a conversation with OpenCode.</p>
              <p className="agent-messages-hint">
                Session: {activeSession.title || activeSession.slug || activeSession.id}
              </p>
            </div>
          )}
          {isLoadingMessages && messages.length === 0 && (
            <div className="oc-loading">Loading messages...</div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`agent-message agent-message--${msg.role}`}>
              <div className="agent-message-role">
                {msg.role === 'user' ? 'USER' : 'ASSISTANT'}
                {msg.agent && <span className="oc-msg-agent"> ({msg.agent})</span>}
              </div>
              <div className="agent-message-content">
                {renderMessageContent(msg)}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="agent-input-bar">
          <textarea
            ref={inputRef}
            className="agent-input"
            placeholder="Message OpenCode..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={!selectedSessionID}
          />
          <button className="btn-icon agent-mic-btn" title="Voice Input (coming soon)">
            <Mic size={18} />
          </button>
          <button
            className="btn-icon agent-send-btn"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || !selectedSessionID}
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {renderPermissionDialog()}
    </div>
  );
};
