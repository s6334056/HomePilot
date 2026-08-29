import { useEffect, useState, useRef, useCallback } from 'react';
import { PageManager } from './hud/page-manager';
import { ExplorerPage } from './hud/pages/explorer-page';
import { FileViewerPage } from './hud/pages/file-viewer-page';
import { MockFileSystemService } from './services/MockFileSystemService';
import { GatewayFileSystemService } from './services/GatewayFileSystemService';
import { AgentService } from './services/AgentService';
import { SessionService } from './services/SessionService';
import { FileSystemService } from './services/FileSystemService';
import { resolveConfig } from './services/ConnectionConfig';
import { FileSystemItem, ScreenType, AgentContext } from './domain/types';
import { Navbar } from './components/Navbar';
import { FileTable } from './components/FileTable';
import { FileViewer } from './components/FileViewer';
import { AgentScreen } from './components/AgentScreen';
import { SettingsModal } from './components/SettingsModal';
import { AgentSettingsModal } from './components/AgentSettingsModal';
import { Glasses, ChevronUp, ChevronDown, MousePointer, CornerUpLeft, Bot, RefreshCw, Home } from 'lucide-react';
import './App.css';

type PaneType = 'explorer' | 'agent';
type PaneOrder = [PaneType, PaneType];

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
  const [agentService] = useState(() => new AgentService());
  const [sessionService] = useState(() => new SessionService());
  const [pageManager] = useState(() => new PageManager((status) => setG2Status(status)));

  // Explorer state
  const [explorerPath, setExplorerPath] = useState<string>(() =>
    isGatewayService(fileService) ? '' : '/home'
  );
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  // Agent context (from Explorer)
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null);

  // Screen state
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('explorer');

  // UI state
  const [_g2Status, setG2Status] = useState<string>('Initializing G2 SDK...');
  const [hudPreviewText, setHudPreviewText] = useState<string>('');
  const [showExplorerSettings, setShowExplorerSettings] = useState<boolean>(false);
  const [showAgentSettings, setShowAgentSettings] = useState<boolean>(false);

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
  const wasDesktopRef = useRef<boolean>(window.innerWidth >= 1100);

  const isInitializedRef = useRef(false);
  const explorerHistoryRef = useRef<string[]>([]);

  const getRootPath = () => {
    if (isGatewayService(fileService)) {
      return (fileService as GatewayFileSystemService).getRootPath();
    }
    return '/home';
  };

  // Compute agent display path from context
  const getAgentDisplayPath = (): string => {
    if (agentContext?.selectedFile?.path) return agentContext.selectedFile.path;
    if (agentContext?.currentPath) return agentContext.currentPath;
    return explorerPath;
  };

  // Can the user go back in explorer history?
  const canExplorerGoBack = (): boolean => {
    return explorerHistoryRef.current.length > 0;
  };

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const init = async () => {
      await pageManager.initialize();

      if (isGatewayService(fileService)) {
        await (fileService as GatewayFileSystemService).initialize();
      }

      const rootPath = getRootPath();
      setExplorerPath(rootPath);

      const explorerPage = new ExplorerPage(
        rootPath,
        fileService,
        agentService,
        (path, loadedItems, selected) => {
          setExplorerPath(path);
          setItems(loadedItems);
          setSelectedIndex(selected);
          setCurrentScreen('explorer');
          setSelectedFile(null);
          setHudPreviewText(pageManager.getLastRenderedText());
        },
        (file, content) => {
          setSelectedFile(file);
          setFileContent(content);
          setCurrentScreen('file_viewer');
          setHudPreviewText(pageManager.getLastRenderedText());
        },
        (context) => {
          setAgentContext(context);
          if (!isDesktop) {
            setCurrentScreen('agent');
          }
          setHudPreviewText(pageManager.getLastRenderedText());
        }
      );

      await pageManager.navigateTo(explorerPage);
      setHudPreviewText(pageManager.getLastRenderedText());
    };

    init();
  }, [fileService, agentService, pageManager]);

  // Sync HUD preview on any render
  const refreshHudPreview = () => {
    setHudPreviewText(pageManager.getLastRenderedText());
  };

  // Internal navigate (no history management)
  const navigateToPath = async (path: string) => {
    const page = new ExplorerPage(
      path,
      fileService,
      agentService,
      (newPath, loadedItems, selected) => {
        setExplorerPath(newPath);
        setItems(loadedItems);
        setSelectedIndex(selected);
        setCurrentScreen('explorer');
        setSelectedFile(null);
        refreshHudPreview();
      },
      (file, content) => {
        setSelectedFile(file);
        setFileContent(content);
        setCurrentScreen('file_viewer');
        setHudPreviewText(pageManager.getLastRenderedText());
      },
      (context) => {
        setAgentContext(context);
        if (!isDesktop) {
          setCurrentScreen('agent');
        }
        setHudPreviewText(pageManager.getLastRenderedText());
      }
    );
    await pageManager.navigateTo(page);
    refreshHudPreview();
  };

  const handleOpenFile = async (file: FileSystemItem) => {
    try {
      const content = await fileService.readFile(file.path);
      explorerHistoryRef.current.push(explorerPath);
      setSelectedFile(file);
      setFileContent(content);
      setCurrentScreen('file_viewer');

      const viewerPage = new FileViewerPage(
        file,
        explorerPath,
        fileService,
        agentService,
        async () => {
          // File viewer back → return to folder (no history push, this IS the back)
          const prev = explorerHistoryRef.current.pop();
          const returnPath = prev !== undefined ? prev : explorerPath;
          await navigateToPath(returnPath);
          return true;
        },
        (f, c) => {
          setSelectedFile(f);
          setFileContent(c);
          setCurrentScreen('file_viewer');
          setHudPreviewText(pageManager.getLastRenderedText());
        },
        (context) => {
          setAgentContext(context);
          if (!isDesktop) {
            setCurrentScreen('agent');
          }
          setHudPreviewText(pageManager.getLastRenderedText());
        }
      );
      await pageManager.navigateTo(viewerPage);
      refreshHudPreview();
    } catch (e: any) {
      alert(`Failed to open file: ${e.message}`);
    }
  };

  // Explorer back button = pop from history
  const handleExplorerBack = async () => {
    const prev = explorerHistoryRef.current.pop();
    if (prev !== undefined) {
      await navigateToPath(prev);
    }
  };

  const handleExplorerHome = async () => {
    explorerHistoryRef.current.push(explorerPath);
    await navigateToPath(getRootPath());
  };

  const handleExplorerReload = async () => {
    await navigateToPath(explorerPath);
  };

  // Folder click from FileTable → push history
  const handleOpenDirectory = async (path: string) => {
    explorerHistoryRef.current.push(explorerPath);
    await navigateToPath(path);
  };

  // Agent/Explorer switching
  // In 2-pane mode (desktop), both panes are always visible.
  // These handlers only update context; screen switching is CSS-driven on mobile.
  const handleOpenAgent = () => {
    const item = items[selectedIndex] || null;
    const context = agentService.open({
      path: explorerPath,
      item,
      selectedFile,
      content: fileContent || undefined,
      source: currentScreen === 'file_viewer' ? 'file_viewer' : 'explorer',
    });
    setAgentContext(context);
    if (!isDesktop) {
      setCurrentScreen('agent');
    }
  };

  const handleOpenExplorer = () => {
    if (!isDesktop) {
      setCurrentScreen('explorer');
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
      setIsDesktop(nowDesktop);
      setExplorerPaneWidth((prev) => {
        const maxExplorer = window.innerWidth - MIN_PANE_WIDTH - DIVIDER_WIDTH;
        return Math.max(MIN_PANE_WIDTH, Math.min(maxExplorer, prev));
      });
      // When crossing from Desktop to Mobile, show paneOrder[0]
      if (wasDesktopRef.current && !nowDesktop) {
        setCurrentScreen(paneOrder[0]);
      }
      wasDesktopRef.current = nowDesktop;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [paneOrder]);

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

    const explorerPage = new ExplorerPage(
      rootPath,
      newService,
      agentService,
      (path, loadedItems, selected) => {
        setExplorerPath(path);
        setItems(loadedItems);
        setSelectedIndex(selected);
        setCurrentScreen('explorer');
        setSelectedFile(null);
        setHudPreviewText(pageManager.getLastRenderedText());
      },
      (file, content) => {
        setSelectedFile(file);
        setFileContent(content);
        setCurrentScreen('file_viewer');
        setHudPreviewText(pageManager.getLastRenderedText());
      },
      (context) => {
        setAgentContext(context);
        if (!isDesktop) {
          setCurrentScreen('agent');
        }
        setHudPreviewText(pageManager.getLastRenderedText());
      }
    );
    await pageManager.navigateTo(explorerPage);
    setHudPreviewText(pageManager.getLastRenderedText());
  }, [agentService, pageManager]);

  // Keyboard Navigation for PC testing
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        await pageManager.dispatchSimulatedEvent('scroll_up');
        refreshHudPreview();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        await pageManager.dispatchSimulatedEvent('scroll_down');
        refreshHudPreview();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        await pageManager.dispatchSimulatedEvent('click');
        refreshHudPreview();
      } else if (e.key === 'Backspace' || e.key === 'Escape') {
        e.preventDefault();
        await pageManager.dispatchSimulatedEvent('double_click');
        refreshHudPreview();
      } else if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        await pageManager.dispatchSimulatedEvent('long_press');
        refreshHudPreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageManager]);

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
    <div className={`explorer-pane ${isDesktop || paneOrder[0] === 'explorer' ? '' : 'pane-hidden'}`} key="explorer-pane">
      <Navbar
        currentPath={getNavbarPath()}
        mode="explorer"
        rootPath={isGatewayService(fileService) ? getRootPath() : undefined}
        onBack={handleExplorerBack}
        canGoBack={canExplorerGoBack()}
        onReload={handleExplorerReload}
        onHome={handleExplorerHome}
        onOpenSettings={() => setShowExplorerSettings(true)}
        onOpenAgent={handleOpenAgent}
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
                const page = pageManager.getCurrentPage();
                if (page instanceof ExplorerPage) {
                  (page as any).selectedIndex = idx;
                  pageManager.renderCurrentPage();
                  refreshHudPreview();
                }
              }}
              onOpenDirectory={handleOpenDirectory}
              onOpenFile={handleOpenFile}
            />
          )}

          {currentScreen === 'file_viewer' && selectedFile && (
            <FileViewer
              file={selectedFile}
              content={fileContent}
            />
          )}
        </main>

        {/* G2 HUD Simulator & Event Trigger Panel */}
        <aside className="g2-hud-sidebar">
          <div className="g2-hud-header">
            <div className="g2-title">
              <Glasses size={18} className="icon-g2" />
              <span>G2 Display Preview</span>
            </div>
            <span className="g2-tag">576x288 HUD</span>
          </div>

          <div className="g2-hud-screen">
            <pre>{hudPreviewText || 'G2 HUD Connecting...'}</pre>
          </div>

          <div className="g2-controls-section">
            <div className="section-label">G2 Touch & Gestures Emulation</div>
            <div className="g2-btn-grid">
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('scroll_up');
                  refreshHudPreview();
                }}
                title="Scroll Up (Focus Prev)"
              >
                <ChevronUp size={14} /> Scroll Up
              </button>
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('scroll_down');
                  refreshHudPreview();
                }}
                title="Scroll Down (Focus Next)"
              >
                <ChevronDown size={14} /> Scroll Down
              </button>
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('click');
                  refreshHudPreview();
                }}
                title="Tap (Open File/Folder)"
              >
                <MousePointer size={14} /> Tap (Open)
              </button>
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('double_click');
                  refreshHudPreview();
                }}
                title="Double Tap (Parent / Back)"
              >
                <CornerUpLeft size={14} /> Double Tap
              </button>
              <button
                className="g2-btn btn-agent-trigger"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('long_press');
                  refreshHudPreview();
                }}
                title="Long Press (Launch Agent Context)"
              >
                <Bot size={14} /> Long Press (Agent)
              </button>
            </div>
          </div>

          <div className="g2-controls-section">
            <div className="section-label">G2 Context Menu</div>
            <div className="g2-btn-grid">
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('menu_click', 'refresh');
                  refreshHudPreview();
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('menu_click', 'home');
                  refreshHudPreview();
                }}
              >
                <Home size={13} /> Home
              </button>
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('menu_click', 'parent');
                  refreshHudPreview();
                }}
              >
                <CornerUpLeft size={13} /> Parent
              </button>
              <button
                className="g2-btn"
                onClick={async () => {
                  await pageManager.dispatchSimulatedEvent('menu_click', 'info');
                  refreshHudPreview();
                }}
              >
                ⓘ Info
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );

  // Build Agent pane content
  const agentPane = (
    <div className={`agent-pane ${isDesktop || paneOrder[0] === 'agent' ? '' : 'pane-hidden'}`} key="agent-pane">
      <AgentScreen
        currentPath={getAgentDisplayPath()}
        gatewayUrl={resolveConfig().gatewayUrl}
        gatewayToken={resolveConfig().gatewayToken}
        agentContext={agentContext}
        onOpenSettings={() => setShowAgentSettings(true)}
        onOpenExplorer={handleOpenExplorer}
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

      {/* Modals */}
      <SettingsModal
        isOpen={showExplorerSettings}
        onClose={() => setShowExplorerSettings(false)}
        onReconnect={handleReconnect}
      />

      <AgentSettingsModal
        isOpen={showAgentSettings}
        onClose={() => setShowAgentSettings(false)}
        sessionService={sessionService}
        gatewayUrl={resolveConfig().gatewayUrl}
        gatewayToken={resolveConfig().gatewayToken}
      />
    </div>
  );
}

export default App;
