import React, { useState, useRef, useEffect } from 'react';
import { Plus, Mic, Send, Wifi, WifiOff, AlertCircle, Loader2, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { OpenCodeSessionInfo, AgentContext } from '../domain/types';
import { useOpenCode, OpenCodeMessageWithParts } from '../hooks/useOpenCode';
import { Navbar } from './Navbar';

interface AgentScreenProps {
  currentPath: string;
  gatewayUrl: string;
  gatewayToken: string;
  buildLiveContext: () => AgentContext;
  onOpenSettings: () => void;
  onOpenExplorer: () => void;
  onReload?: () => void;
  showSettingsButton?: boolean;
  showSwapButton?: boolean;
  onSwapPanes?: () => void;
}

export const AgentScreen: React.FC<AgentScreenProps> = ({
  currentPath,
  gatewayUrl,
  gatewayToken,
  buildLiveContext,
  onOpenSettings,
  onOpenExplorer,
  onReload,
  showSettingsButton,
  showSwapButton,
  onSwapPanes,
}) => {
  const [state, actions] = useOpenCode();
  const [showSessionList, setShowSessionList] = useState<boolean>(true);
  const [inputValue, setInputValue] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [hasConnected, setHasConnected] = useState<boolean>(false);
  const [showArchivedSessions, setShowArchivedSessions] = useState<boolean>(false);
  const [operatingSessionId, setOperatingSessionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    connectionStatus,
    sessions,
    archivedSessions,
    selectedSessionID,
    selectedSession,
    messages,
    sessionStatus,
    pendingPermissions,
    isLoadingSessions,
    isLoadingArchivedSessions,
    isLoadingMessages,
    isSending,
    error,
  } = state;

  const activeSession = selectedSession;

  useEffect(() => {
    if (gatewayUrl && gatewayToken && !connected) {
      actions.connect(gatewayUrl, gatewayToken);
      setConnected(true);
    }
  }, [gatewayUrl, gatewayToken, connected, actions]);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      setHasConnected(true);
    }
  }, [connectionStatus]);

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
    const liveContext = buildLiveContext();
    await actions.sendMessage(content, liveContext);
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

  const handleReload = onReload || (() => { actions.refreshMessages(); });

  const handleArchiveSession = async (sessionID: string) => {
    if (operatingSessionId) return;
    setOperatingSessionId(sessionID);
    await actions.archiveSession(sessionID);
    setOperatingSessionId(null);
  };

  const handleRestoreSession = async (sessionID: string) => {
    if (operatingSessionId) return;
    setOperatingSessionId(sessionID);
    await actions.restoreSession(sessionID);
    setOperatingSessionId(null);
  };

  const handleDeleteSession = async (sessionID: string) => {
    if (operatingSessionId) return;
    setOperatingSessionId(sessionID);
    setDeleteConfirmId(null);
    await actions.deleteSession(sessionID);
    setOperatingSessionId(null);
  };

  const handleToggleArchived = () => {
    setShowArchivedSessions((prev) => {
      const next = !prev;
      if (next) {
        actions.refreshArchivedSessions();
      }
      return next;
    });
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi size={14} className="oc-status-connected" />;
      case 'connecting':
        return <Loader2 size={14} className="oc-status-connecting" />;
      case 'reconnecting':
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
      case 'reconnecting': return 'Reconnecting...';
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
    // Handle optimistic processing placeholder
    if (msg.id.startsWith('temp-assistant-')) {
      return (
        <div className="oc-message-content oc-message-streaming">
          <Loader2 size={14} className="oc-spinning" />
          <span>Processing...</span>
        </div>
      );
    }

    // Handle real assistant messages that are still processing (no content yet)
    if (msg.role === 'assistant' && !msg.contentText && msg.parts.length === 0 && isSending) {
      return (
        <div className="oc-message-content oc-message-streaming">
          <Loader2 size={14} className="oc-spinning" />
          <span>Processing...</span>
        </div>
      );
    }

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

  if (!hasConnected && (connectionStatus === 'disconnected' || connectionStatus === 'connecting')) {
    return (
      <div className="agent-screen">
        <Navbar
          currentPath={currentPath}
          mode="agent"
          onBack={handleToggleSessionList}
          onReload={handleReload}
          onOpenSettings={onOpenSettings}
          onOpenExplorer={onOpenExplorer}
          showSettingsButton={showSettingsButton}
          showSwapButton={showSwapButton}
          onSwapPanes={onSwapPanes}
        />
        <div className="oc-connecting-screen">
          <div className="oc-connecting-content">
            {connectionStatus === 'connecting' ? (
              <>
                <Loader2 size={32} className="oc-spinning" />
                <p>Connecting to OpenCode Server...</p>
                <p className="oc-connecting-url">{gatewayUrl}</p>
              </>
            ) : (
              <>
                <WifiOff size={32} />
                <p>Not connected to OpenCode Server</p>
                <p className="oc-connecting-url">{gatewayUrl}</p>
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

  if (showSessionList || !selectedSessionID) {
    return (
      <div className="agent-screen">
        <Navbar
          currentPath={currentPath}
          mode="agent"
          onBack={handleToggleSessionList}
          onReload={handleReload}
          onOpenSettings={onOpenSettings}
          onOpenExplorer={onOpenExplorer}
          showSettingsButton={showSettingsButton}
          showSwapButton={showSwapButton}
          onSwapPanes={onSwapPanes}
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
            <div className="agent-session-list-header">
              <button className="agent-session-new" onClick={handleNewSession} disabled={isLoadingSessions}>
                <Plus size={16} />
                <span>New Session</span>
              </button>
              <button
                className={`agent-session-archive-toggle ${showArchivedSessions ? 'active' : ''}`}
                onClick={handleToggleArchived}
              >
                <Archive size={14} />
                <span>{showArchivedSessions ? 'Active' : 'Archived'}</span>
              </button>
            </div>
            {showArchivedSessions ? (
              <>
                {isLoadingArchivedSessions && archivedSessions.length === 0 && (
                  <div className="oc-loading">Loading archived sessions...</div>
                )}
                {archivedSessions.map((session) => (
                  <div key={session.id} className="agent-session-item-wrapper">
                    <button
                      className={`agent-session-item ${session.id === selectedSessionID ? 'active' : ''}`}
                      onClick={() => handleSelectSession(session.id)}
                      disabled={operatingSessionId === session.id}
                    >
                      <span className="agent-session-title">
                        {formatSessionTitle(session)}
                      </span>
                      <span className="agent-session-date">
                        {formatTime(session.time?.updated)}
                      </span>
                    </button>
                    <div className="agent-session-actions">
                      <button
                        className="agent-session-action-btn"
                        onClick={() => handleRestoreSession(session.id)}
                        disabled={operatingSessionId === session.id}
                        title="Restore from archive"
                      >
                        {operatingSessionId === session.id ? (
                          <Loader2 size={13} className="oc-spinning" />
                        ) : (
                          <ArchiveRestore size={13} />
                        )}
                      </button>
                      <button
                        className="agent-session-action-btn agent-session-action-btn--danger"
                        onClick={() => setDeleteConfirmId(session.id)}
                        disabled={operatingSessionId === session.id}
                        title="Delete session"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {archivedSessions.length === 0 && !isLoadingArchivedSessions && (
                  <div className="agent-session-empty">
                    No archived sessions.
                  </div>
                )}
              </>
            ) : (
              <>
                {isLoadingSessions && sessions.length === 0 && (
                  <div className="oc-loading">Loading sessions...</div>
                )}
                {sessions.map((session) => (
                  <div key={session.id} className="agent-session-item-wrapper">
                    <button
                      className={`agent-session-item ${session.id === selectedSessionID ? 'active' : ''}`}
                      onClick={() => handleSelectSession(session.id)}
                      disabled={operatingSessionId === session.id}
                    >
                      <span className="agent-session-title">
                        {formatSessionTitle(session)}
                      </span>
                      <span className="agent-session-date">
                        {formatTime(session.time?.updated)}
                      </span>
                    </button>
                    <div className="agent-session-actions">
                      <button
                        className="agent-session-action-btn"
                        onClick={() => handleArchiveSession(session.id)}
                        disabled={operatingSessionId === session.id}
                        title="Archive session"
                      >
                        {operatingSessionId === session.id ? (
                          <Loader2 size={13} className="oc-spinning" />
                        ) : (
                          <Archive size={13} />
                        )}
                      </button>
                      <button
                        className="agent-session-action-btn agent-session-action-btn--danger"
                        onClick={() => setDeleteConfirmId(session.id)}
                        disabled={operatingSessionId === session.id}
                        title="Delete session"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {sessions.length === 0 && !isLoadingSessions && (
                  <div className="agent-session-empty">
                    No sessions yet. Create one to get started.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {deleteConfirmId && (
          <div className="oc-dialog-overlay" onClick={() => setDeleteConfirmId(null)}>
            <div className="oc-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="oc-dialog-header">
                <AlertCircle size={18} />
                <span>Delete Session</span>
              </div>
              <div className="oc-dialog-body">
                <p>Are you sure you want to delete this session? This action cannot be undone.</p>
              </div>
              <div className="oc-dialog-actions">
                <button
                  className="oc-btn"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </button>
                <button
                  className="oc-btn oc-btn-deny"
                  onClick={() => handleDeleteSession(deleteConfirmId)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!activeSession) return null;

  return (
    <div className="agent-screen">
      <Navbar
        currentPath={currentPath}
        mode="agent"
        onBack={handleToggleSessionList}
        onReload={handleReload}
        onOpenSettings={onOpenSettings}
        onOpenExplorer={onOpenExplorer}
        showSettingsButton={showSettingsButton}
        showSwapButton={showSwapButton}
        onSwapPanes={onSwapPanes}
      />
      <div className="oc-session-header">
        <div className="oc-connection-status">
          {getConnectionStatusIcon()}
          <span>{getConnectionStatusText()}</span>
          {activeSession.model && (
            <span className="oc-session-model">{activeSession.model.id}</span>
          )}
        </div>
        <div className="oc-session-header-right">
          {sessionStatus && (
            <div className={`oc-session-status oc-session-status--${sessionStatus.type}`}>
              {sessionStatus.type}
            </div>
          )}
        </div>
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
            disabled={!inputValue.trim() || !selectedSessionID || isSending}
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
