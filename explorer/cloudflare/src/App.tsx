import { useEffect, useState, useRef, useCallback } from 'react';
import { MockFileSystemService } from './services/MockFileSystemService';
import { GatewayFileSystemService } from './services/GatewayFileSystemService';
import { FileSystemService } from './services/FileSystemService';
import { resolveConfig } from './services/ConnectionConfig';
import { runDiagSSETest } from './services/DiagSSETest';
import { FileSystemItem, ScreenType, AgentContext } from './domain/types';
import { Navbar } from './components/Navbar';
import { FileTable } from './components/FileTable';
import { FileViewer } from './components/FileViewer';
import { AgentScreen } from './components/AgentScreen';
import { SettingsModal } from './components/SettingsModal';
import { G2RuntimeManager, G2RuntimeState } from './hud/g2-runtime';
import './App.css';

type PaneType = 'explorer' | 'agent';
type PaneOrder = [PaneType, PaneType];

interface ExplorerHistoryEntry {
  path: string;
  selectedIndex: number;
}

function createFileService(): FileSystemService {
  const config = resolveConfig();
  if (config.mode === 'gateway' && config.gatewayToken) {
    return new GatewayFileSystemService(config.gatewayUrl, config.gatewayToken);
  }
  return new MockFileSystemService();
}

function isGatewayService(s: FileSystemService): s is GatewayFileSystemService {
  return s instanceof GatewayFileSystemService;
}

export function App() {
  const [fileService, setFileService] = useState<FileSystemService>(() => createFileService());

  // G2 Runtime Manager (created once, manages lifecycle of all G2 resources)
  const [g2Runtime] = useState(() => new G2RuntimeManager(
    (status) => setG2Status(status),
    (state) => setG2RuntimeState(state),
  ));

  // Explorer state
  const [explorerPath, setExplorerPath] = useState<string>(() =>
    isGatewayService(fileService) ? '' : '/home'
  );
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  // Screen state
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('explorer');

  // UI state
  const [_g2Status, setG2Status] = useState<string>('Ready');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // G2 Runtime state
  const [g2RuntimeState, setG2RuntimeState] = useState<G2RuntimeState>('inactive');
  const [isBridgeAvailable, setIsBridgeAvailable] = useState<boolean>(false);

  // 2-Pane layout state
  const [paneOrder, setPaneOrder] = useState<PaneOrder>(['explorer', 'agent']);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => window.innerWidth >= 1100);
  const MIN_PANE_WIDTH = 300;
  const DIVIDER_WIDTH = 4;
  const [explorerPaneWidth, setExplorerPaneWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const half = Math.floor(window.innerWidth / 2);
      const minExplorer = MIN_PANE_WIDTH;
      const maxExplorer = window.innerWidth - MIN_PANE_WIDTH - DIVIDER_WIDTH;
      return Math.max(minExplorer, Math.min(maxExplorer, half));
    }
    return 600;
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(0);

  const isInitializedRef = useRef(false);
  const explorerHistoryRef = useRef<ExplorerHistoryEntry[]>([]);
  const previousScreenRef = useRef<ScreenType>('explorer');
  const prevIsDesktopRef = useRef<boolean>(window.innerWidth >= 1100);

  const getRootPath = () => {
    if (isGatewayService(fileService)) {
      return (fileService as GatewayFileSystemService).getRootPath();
    }
    return '/home';
  };

  // Compute agent display path from live Explorer state (not from agentContext snapshot)
  const getAgentDisplayPath = (): string => {
    if (selectedFile?.path) return selectedFile.path;
    return explorerPath;
  };

  // Build Live Context from current Explorer state (PWA only — called at message send time)
  const buildLiveContext = (): AgentContext => {
    const item = items[selectedIndex] || null;
    return {
      currentPath: explorerPath,
      selectedItem: item,
      selectedFile: selectedFile,
      content: fileContent || undefined,
      sourceScreen: currentScreen === 'file_viewer' ? 'file_viewer' : 'explorer',
      timestamp: new Date().toISOString(),
    };
  };

  // Can the user go back in explorer history?
  const canExplorerGoBack = (): boolean => {
    return explorerHistoryRef.current.length > 0;
  };

  // ── PWA Initialization ────────────────────────────────────
  // Probe for G2 bridge on startup (does NOT start G2 Runtime)
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const init = async () => {
      // Probe for bridge availability (G2-capable environment detection)
      const hasBridge = await g2Runtime.probeBridge();
      setIsBridgeAvailable(hasBridge);

      // Initialize PWA file service (independent of G2)
      if (isGatewayService(fileService)) {
        await (fileService as GatewayFileSystemService).initialize();
      }

      const rootPath = getRootPath();
      setExplorerPath(rootPath);
    };

    init();
  }, [fileService, g2Runtime]);

  // ── G2 Runtime ────────────────────────────────────────────

  const handleStartG2Runtime = useCallback(async () => {
    await g2Runtime.startG2Runtime();
  }, [g2Runtime]);

  const handleStopG2Runtime = useCallback(async () => {
    await g2Runtime.shutdownG2Runtime();
  }, [g2Runtime]);

  // Cleanup G2RuntimeManager on unmount
  useEffect(() => {
    return () => {
      g2Runtime.destroy();
    };
  }, [g2Runtime]);

  // DIAG-SSE-TEST: handler for diagnostic button
  const handleDiagSSE = useCallback(() => {
    runDiagSSETest();
  }, []);

  // ── PWA Navigation (independent of G2) ────────────────────

  // Internal navigate (no history management)
  const navigateToPath = async (path: string, restoreIndex?: number) => {
    const newService = fileService;
    const rootPath = isGatewayService(newService)
      ? (newService as GatewayFileSystemService).getRootPath()
      : '/home';
    const resolvedPath = path || rootPath;

    setExplorerPath(resolvedPath);
    setCurrentScreen('explorer');
    setSelectedFile(null);

    // Load directory for PWA display
    try {
      const loadedItems = await newService.getDirectory(resolvedPath);
      setItems(loadedItems);
      setSelectedIndex(restoreIndex != null
        ? Math.max(0, Math.min(restoreIndex, loadedItems.length - 1))
        : 0);
    } catch (e) {
      console.error('[App] Failed to load directory:', e);
      setItems([]);
      setSelectedIndex(0);
    }
  };

  const handleOpenFile = async (file: FileSystemItem, index: number) => {
    try {
      const content = await fileService.readFile(file.path);
      explorerHistoryRef.current.push({ path: explorerPath, selectedIndex: index });
      setSelectedFile(file);
      setFileContent(content);
      setCurrentScreen('file_viewer');
    } catch (e: any) {
      alert(`Failed to open file: ${e.message}`);
    }
  };

  // Explorer back button = pop from history
  const handleExplorerBack = async () => {
    const prev = explorerHistoryRef.current.pop();
    if (prev !== undefined) {
      await navigateToPath(prev.path, prev.selectedIndex);
    }
  };

  const handleExplorerReload = async () => {
    await navigateToPath(explorerPath);
  };

  // Folder click from FileTable → push history
  const handleOpenDirectory = async (path: string, index: number) => {
    explorerHistoryRef.current.push({ path: explorerPath, selectedIndex: index });
    await navigateToPath(path);
  };

  // Agent/Explorer switching
  const handleOpenAgent = () => {
    if (!isDesktop) {
      previousScreenRef.current = currentScreen;
      setCurrentScreen('agent');
    }
  };

  const handleOpenExplorer = () => {
    if (!isDesktop) {
      setCurrentScreen(previousScreenRef.current);
    }
  };

  const handleSwapPanes = () => {
    setPaneOrder((prev) => [prev[1], prev[0]]);
  };

  // Divider drag handlers (Pointer Events)
  const clampExplorerWidth = (width: number): number => {
    const maxExplorer = window.innerWidth - MIN_PANE_WIDTH - DIVIDER_WIDTH;
    return Math.max(MIN_PANE_WIDTH, Math.min(maxExplorer, width));
  };

  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = explorerPaneWidth;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDividerPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStartX.current;
    const newWidth = clampExplorerWidth(dragStartWidth.current + delta);
    setExplorerPaneWidth(newWidth);
  };

  const handleDividerPointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Responsive: track isDesktop state and clamp pane width on window resize
  useEffect(() => {
    const handleResize = () => {
      const nowDesktop = window.innerWidth >= 1100;
      const wasDesktop = prevIsDesktopRef.current;
      setIsDesktop(nowDesktop);
      setExplorerPaneWidth((prev) => {
        const maxExplorer = window.innerWidth - MIN_PANE_WIDTH - DIVIDER_WIDTH;
        return Math.max(MIN_PANE_WIDTH, Math.min(maxExplorer, prev));
      });

      // Wide → Narrow: preserve Left Pane as currentScreen
      if (wasDesktop && !nowDesktop) {
        setPaneOrder((order) => {
          const leftPane = order[0];
          if (leftPane === 'explorer') {
            setCurrentScreen((prev) => prev === 'file_viewer' ? 'file_viewer' : 'explorer');
          } else {
            setCurrentScreen('agent');
          }
          return order;
        });
      }

      // Narrow → Wide: set Left Pane to the screen user was viewing
      if (!wasDesktop && nowDesktop) {
        setCurrentScreen((prevScreen) => {
          setPaneOrder((order) => {
            const currentLeft = order[0];
            const effectiveScreen = prevScreen === 'file_viewer' ? 'explorer' : prevScreen;
            if (currentLeft === effectiveScreen) return order;
            return [order[1], order[0]];
          });
          return prevScreen;
        });
      }

      prevIsDesktopRef.current = nowDesktop;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleReconnect = useCallback(async () => {
    const newService = createFileService();
    setFileService(newService);

    if (isGatewayService(newService)) {
      await (newService as GatewayFileSystemService).initialize();
    }

    const rootPath = isGatewayService(newService)
      ? (newService as GatewayFileSystemService).getRootPath()
      : '/home';
    setExplorerPath(rootPath);
    setCurrentScreen('explorer');
    setSelectedFile(null);
    explorerHistoryRef.current = [];

    // Load initial directory for PWA display
    try {
      const loadedItems = await newService.getDirectory(rootPath);
      setItems(loadedItems);
      setSelectedIndex(0);
    } catch (e) {
      console.error('[App] Failed to load directory after reconnect:', e);
      setItems([]);
      setSelectedIndex(0);
    }
  }, []);

  // Determine the path to display in navbar
  const getNavbarPath = (): string => {
    if (currentScreen === 'agent') {
      return getAgentDisplayPath();
    }
    if (currentScreen === 'file_viewer' && selectedFile) {
      return selectedFile.path;
    }
    return explorerPath;
  };

  // Determine which pane is first/last for swap button placement
  const isFirstExplorer = paneOrder[0] === 'explorer';

  // Build Explorer pane content
  const explorerPane = (
    <div className={`explorer-pane ${isDesktop || currentScreen === 'explorer' || currentScreen === 'file_viewer' ? '' : 'pane-hidden'}`} key="explorer-pane">
      <Navbar
        currentPath={getNavbarPath()}
        mode="explorer"
        rootPath={isGatewayService(fileService) ? getRootPath() : undefined}
        title={currentScreen === 'file_viewer' && selectedFile ? selectedFile.name : undefined}
        onBack={handleExplorerBack}
        canGoBack={canExplorerGoBack()}
        onReload={handleExplorerReload}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAgent={handleOpenAgent}
        showSettingsButton={isDesktop && !isFirstExplorer}
        showSwapButton={isDesktop && !isFirstExplorer}
        onSwapPanes={handleSwapPanes}
      />

      <div className="main-content-container">
        <main className="content-view">
          {currentScreen === 'explorer' && (
            <FileTable
              items={items}
              selectedIndex={selectedIndex}
              onSelectItem={(idx) => {
                setSelectedIndex(idx);
              }}
              onOpenDirectory={handleOpenDirectory}
              onOpenFile={handleOpenFile}
            />
          )}

          {currentScreen === 'file_viewer' && selectedFile && (
            <FileViewer
              content={fileContent}
            />
          )}
        </main>
      </div>
    </div>
  );

  // Build Agent pane content
  const agentPane = (
    <div className={`agent-pane ${isDesktop || currentScreen === 'agent' ? '' : 'pane-hidden'}`} key="agent-pane">
      <AgentScreen
        currentPath={getAgentDisplayPath()}
        gatewayUrl={resolveConfig().gatewayUrl}
        gatewayToken={resolveConfig().gatewayToken}
        buildLiveContext={buildLiveContext}
        onOpenSettings={() => setShowSettings(true)}
        onOpenExplorer={handleOpenExplorer}
        showSettingsButton={isDesktop && isFirstExplorer}
        showSwapButton={isDesktop && isFirstExplorer}
        onSwapPanes={handleSwapPanes}
      />
    </div>
  );

  // Build divider (only in desktop 2-pane mode)
  const divider = isDesktop ? (
    <div
      key="pane-divider"
      className={`pane-divider ${isDragging ? 'dragging' : ''}`}
      onPointerDown={handleDividerPointerDown}
      onPointerMove={handleDividerPointerMove}
      onPointerUp={handleDividerPointerUp}
    />
  ) : null;

  return (
    <div
      className="app-layout"
      style={isDesktop ? { gridTemplateColumns: `${explorerPaneWidth}px 4px 1fr` } : undefined}
    >
      {isFirstExplorer ? (
        <>{explorerPane}{divider}{agentPane}</>
      ) : (
        <>{agentPane}{divider}{explorerPane}</>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onReconnect={handleReconnect}
        isBridgeAvailable={isBridgeAvailable}
        g2RuntimeState={g2RuntimeState}
        onStartG2Runtime={handleStartG2Runtime}
        onStopG2Runtime={handleStopG2Runtime}
      />

      {/* G2 Runtime Active Modal */}
      {g2RuntimeState === 'active' && (
        <div className="g2-active-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="g2-active-modal">
            <div className="g2-active-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <h3>G2 グラス起動中</h3>
            <p className="g2-active-description">
              G2 Runtime が動作中です。<br/>
              グラス側でアプリが表示されています。
            </p>
            <button
              className="btn btn-danger g2-close-btn"
              onClick={handleStopG2Runtime}
            >
              グラスを閉じる
            </button>
          </div>
        </div>
      )}

      {/* G2 Starting Overlay */}
      {g2RuntimeState === 'starting' && (
        <div className="g2-active-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="g2-active-modal">
            <div className="g2-active-icon g2-starting">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="spin">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            </div>
            <h3>G2 Runtime 起動中...</h3>
            <p className="g2-active-description">
              {_g2Status}
            </p>
          </div>
        </div>
      )}

      {/* G2 Stopping Overlay */}
      {g2RuntimeState === 'stopping' && (
        <div className="g2-active-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="g2-active-modal">
            <div className="g2-active-icon g2-stopping">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="spin">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            </div>
            <h3>G2 Runtime 終了中...</h3>
            <p className="g2-active-description">
              リソースを解放しています...
            </p>
          </div>
        </div>
      )}

      {/* DIAG-SSE-TEST: Temporary diagnostic button */}
      <button
        onClick={handleDiagSSE}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 9999,
          padding: '6px 10px',
          fontSize: 11,
          background: '#333',
          color: '#fff',
          border: '1px solid #555',
          borderRadius: 4,
          cursor: 'pointer',
          opacity: 0.7,
        }}
        title="DIAG-SSE-TEST: Run pure SSE diagnostic"
      >
        Diag SSE
      </button>
    </div>
  );
}

export default App;
