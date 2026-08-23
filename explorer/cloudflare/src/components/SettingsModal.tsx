import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Wifi,
  WifiOff,
  Camera,
  Copy,
  Clipboard,
  Check,
  AlertCircle,
  Home,
  ArrowUp,
  RefreshCw,
  Bot,
  Trash2,
} from 'lucide-react';
import {
  loadConnectionConfig,
  saveConnectionConfig,
  clearConnectionConfig,
  ConnectionConfig,
} from '../services/ConnectionConfig';
import { QRScanner } from './QRScanner';
import { CameraTest } from './CameraTest';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReconnect: () => void;
  onOpenAgent: () => void;
  onNavigateHome: () => void;
  onNavigateParent: () => void;
  onRefresh: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onReconnect,
  onOpenAgent,
  onNavigateHome,
  onNavigateParent,
  onRefresh,
}) => {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [showQRScanner, setShowQRScanner] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const [showCameraTest, setShowCameraTest] = useState<boolean>(false);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = loadConnectionConfig();
      setConfig(saved);
      setConnected(saved !== null);
      setError('');
      setPasteText('');
      setCopied(false);
      setShowQRScanner(false);
      setShowCameraTest(false);
    }
  }, [isOpen]);

  const handleQRScan = useCallback((data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type !== 'homepilot-connection') {
        setError('HomePilotの接続情報ではありません。');
        return;
      }
      if (parsed.version !== 1) {
        setError('対応していない接続情報バージョンです。');
        return;
      }
      if (!parsed.url || !parsed.token) {
        setError('接続情報の形式が正しくありません。');
        return;
      }

      const newConfig: ConnectionConfig = {
        type: 'homepilot-connection',
        version: 1,
        url: parsed.url,
        token: parsed.token,
      };
      saveConnectionConfig(newConfig);
      setConfig(newConfig);
      setConnected(true);
      setShowQRScanner(false);
      setError('');
      onReconnect();
    } catch {
      setError('QRコードを読み取れませんでした。');
    }
  }, [onReconnect]);

  const handlePaste = useCallback(() => {
    try {
      const parsed = JSON.parse(pasteText);
      if (parsed.type !== 'homepilot-connection') {
        setError('HomePilotの接続情報ではありません。');
        return;
      }
      if (parsed.version !== 1) {
        setError('対応していない接続情報バージョンです。');
        return;
      }
      if (!parsed.url || !parsed.token) {
        setError('接続情報の形式が正しくありません。');
        return;
      }

      const newConfig: ConnectionConfig = {
        type: 'homepilot-connection',
        version: 1,
        url: parsed.url,
        token: parsed.token,
      };
      saveConnectionConfig(newConfig);
      setConfig(newConfig);
      setConnected(true);
      setPasteText('');
      setError('');
      onReconnect();
    } catch {
      setError('接続情報の形式が正しくありません。');
    }
  }, [pasteText, onReconnect]);

  const handleCopyConnectionInfo = useCallback(async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(config));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('コピーに失敗しました。');
    }
  }, [config]);

  const handleClearConnection = useCallback(() => {
    clearConnectionConfig();
    setConfig(null);
    setConnected(false);
    onReconnect();
  }, [onReconnect]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>HomePilot Settings</h2>
          <button className="settings-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body">
          {/* Connection Status */}
          <section className="settings-section">
            <h3>Connection</h3>
            <div className="connection-status">
              {connected ? (
                <span className="status-connected">
                  <Wifi size={14} />
                  Connected
                </span>
              ) : (
                <span className="status-disconnected">
                  <WifiOff size={14} />
                  Not Connected
                </span>
              )}
            </div>

            {config && (
              <div className="connection-info">
                <div className="info-row">
                  <span className="info-label">Tunnel URL</span>
                  <span className="info-value">{config.url}</span>
                </div>
              </div>
            )}

            <div className="settings-actions">
              <button
                className="btn btn-primary"
                onClick={() => setShowQRScanner(true)}
              >
                <Camera size={14} />
                QRコードを読み取る
              </button>
              <button
                className="btn"
                onClick={() => setShowCameraTest(true)}
              >
                <Camera size={14} />
                カメラテスト
              </button>
              {config && (
                <button className="btn btn-danger" onClick={handleClearConnection}>
                  <Trash2 size={14} />
                  接続を解除
                </button>
              )}
            </div>
          </section>

          {/* QR Scanner */}
          {showQRScanner && (
            <section className="settings-section">
              <h3>QR Scanner</h3>
              <QRScanner
                onScan={handleQRScan}
                onError={(err) => setError(err)}
                onClose={() => setShowQRScanner(false)}
              />
            </section>
          )}

          {/* Camera Test (Debug) */}
          {showCameraTest && (
            <section className="settings-section">
              <h3>カメラテスト (デバッグ)</h3>
              <CameraTest onClose={() => setShowCameraTest(false)} />
            </section>
          )}

          {/* Error Display */}
          {error && (
            <div className="settings-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* G2 Connection */}
          <section className="settings-section">
            <h3>G2接続</h3>
            <p className="settings-description">
              EvenHub内PWAで使用する接続情報
            </p>

            {config && (
              <div className="g2-connection-box">
                <pre className="g2-connection-data">
                  {JSON.stringify(config)}
                </pre>
                <button
                  className="btn btn-copy"
                  onClick={handleCopyConnectionInfo}
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      コピー
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="paste-section">
              <p className="settings-description">
                接続情報を貼り付け
              </p>
              <textarea
                ref={pasteInputRef}
                className="paste-input"
                placeholder='{"type":"homepilot-connection",...}'
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={3}
              />
              <button
                className="btn btn-primary"
                onClick={handlePaste}
                disabled={!pasteText.trim()}
              >
                <Clipboard size={14} />
                適用
              </button>
            </div>
          </section>

          {/* Quick Actions */}
          <section className="settings-section">
            <h3>Quick Actions</h3>
            <div className="quick-actions">
              <button className="btn btn-sm" onClick={() => { onNavigateHome(); onClose(); }}>
                <Home size={14} />
                Home
              </button>
              <button className="btn btn-sm" onClick={() => { onNavigateParent(); onClose(); }}>
                <ArrowUp size={14} />
                Parent
              </button>
              <button className="btn btn-sm" onClick={() => { onRefresh(); onClose(); }}>
                <RefreshCw size={14} />
                Refresh
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => { onOpenAgent(); onClose(); }}>
                <Bot size={14} />
                Agent
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
