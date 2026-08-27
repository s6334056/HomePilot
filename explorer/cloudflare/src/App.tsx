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
          setCurrentScreen('agent');
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
        setCurrentScreen('agent');
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
          setCurrentScreen('agent');
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
    setCurrentScreen('agent');
  };

  const handleOpenExplorer = () => {
    setCurrentScreen('explorer');
  };

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
        setCurrentScreen('agent');
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

  return (
    <div className="app-layout">
      {/* Explorer Navbar */}
      {currentScreen !== 'agent' && (
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
        />
      )}

      {/* Main Content - Full screen switching */}
      {currentScreen !== 'agent' && (
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
      )}

      {/* Agent Screen - Full screen */}
      {currentScreen === 'agent' && (
        <AgentScreen
          currentPath={getAgentDisplayPath()}
          openCodeUrl={import.meta.env.VITE_OPENCODE_URL || 'http://localhost:4096'}
          onOpenSettings={() => setShowAgentSettings(true)}
          onOpenExplorer={handleOpenExplorer}
        />
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
      />
    </div>
  );
}

export default App;
