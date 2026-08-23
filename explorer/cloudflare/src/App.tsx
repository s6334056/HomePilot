import { useEffect, useState, useRef } from 'react';
import { PageManager } from './hud/page-manager';
import { ExplorerPage } from './hud/pages/explorer-page';
import { FileViewerPage } from './hud/pages/file-viewer-page';
import { AgentPlaceholderPage } from './hud/pages/agent-placeholder-page';
import { MockFileSystemService } from './services/MockFileSystemService';
import { GatewayFileSystemService } from './services/GatewayFileSystemService';
import { AgentService } from './services/AgentService';
import { FileSystemService } from './services/FileSystemService';
import { FileSystemItem, ScreenType, AgentContext } from './domain/types';
import { Navbar } from './components/Navbar';
import { FileTable } from './components/FileTable';
import { FileViewer } from './components/FileViewer';
import { AgentPanel } from './components/AgentPanel';
import { Glasses, ChevronUp, ChevronDown, MousePointer, CornerUpLeft, Bot, RefreshCw, Home } from 'lucide-react';
import './App.css';

function createFileService(): FileSystemService {
  const mode = import.meta.env.VITE_FILE_SERVICE_MODE || 'mock';
  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:51887';
  const token = import.meta.env.VITE_GATEWAY_TOKEN || '';

  if (mode === 'gateway' && token) {
    return new GatewayFileSystemService(gatewayUrl, token);
  }
  return new MockFileSystemService();
}

function isGatewayService(s: FileSystemService): s is GatewayFileSystemService {
  return s instanceof GatewayFileSystemService;
}

export function App() {
  const [fileService] = useState<FileSystemService>(() => createFileService());
  const [agentService] = useState(() => new AgentService());
  const [pageManager] = useState(() => new PageManager((status) => setG2Status(status)));

  const [currentPath, setCurrentPath] = useState<string>(() =>
    isGatewayService(fileService) ? '' : '/home'
  );
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('explorer');
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null);
  const [g2Status, setG2Status] = useState<string>('Initializing G2 SDK...');
  const [hudPreviewText, setHudPreviewText] = useState<string>('');

  const isInitializedRef = useRef(false);

  const getRootPath = () => {
    if (isGatewayService(fileService)) {
      return (fileService as GatewayFileSystemService).getRootPath();
    }
    return '/home';
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
      setCurrentPath(rootPath);

      const explorerPage = new ExplorerPage(
        rootPath,
        fileService,
        agentService,
        (path, loadedItems, selected) => {
          setCurrentPath(path);
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
          setCurrentScreen('agent_placeholder');
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

  // Web UI Actions
  const handleNavigate = async (path: string) => {
    const page = new ExplorerPage(
      path,
      fileService,
      agentService,
      (newPath, loadedItems, selected) => {
        setCurrentPath(newPath);
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
        setCurrentScreen('agent_placeholder');
        setHudPreviewText(pageManager.getLastRenderedText());
      }
    );
    await pageManager.navigateTo(page);
    refreshHudPreview();
  };

  const handleOpenFile = async (file: FileSystemItem) => {
    try {
      const content = await fileService.readFile(file.path);
      setSelectedFile(file);
      setFileContent(content);
      setCurrentScreen('file_viewer');

      const viewerPage = new FileViewerPage(
        file,
        currentPath,
        fileService,
        agentService,
        async () => {
          await handleNavigate(currentPath);
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
          setCurrentScreen('agent_placeholder');
          setHudPreviewText(pageManager.getLastRenderedText());
        }
      );
      await pageManager.navigateTo(viewerPage);
      refreshHudPreview();
    } catch (e: any) {
      alert(`Failed to open file: ${e.message}`);
    }
  };

  const handleOpenAgent = () => {
    const item = items[selectedIndex] || null;
    const context = agentService.open({
      path: currentPath,
      item,
      selectedFile,
      content: fileContent || undefined,
      source: currentScreen,
    });
    setAgentContext(context);
    setCurrentScreen('agent_placeholder');

    const agentPage = new AgentPlaceholderPage(context, async () => {
      if (selectedFile) {
        setCurrentScreen('file_viewer');
        await handleOpenFile(selectedFile);
      } else {
        await handleNavigate(currentPath);
      }
      return true;
    });

    pageManager.navigateTo(agentPage);
    refreshHudPreview();
  };

  const handleReturnFromAgent = async () => {
    if (selectedFile) {
      setCurrentScreen('file_viewer');
      await handleOpenFile(selectedFile);
    } else {
      await handleNavigate(currentPath);
    }
  };

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

  return (
    <div className="app-layout">
      <Navbar
        currentPath={currentPath}
        g2Status={g2Status}
        onNavigate={handleNavigate}
        onNavigateHome={() => handleNavigate(getRootPath())}
        onNavigateParent={() => handleNavigate(fileService.getParentPath(currentPath))}
        onRefresh={() => handleNavigate(currentPath)}
        onOpenAgent={handleOpenAgent}
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
              onOpenDirectory={handleNavigate}
              onOpenFile={handleOpenFile}
            />
          )}

          {currentScreen === 'file_viewer' && selectedFile && (
            <FileViewer
              file={selectedFile}
              content={fileContent}
              onBack={() => handleNavigate(currentPath)}
              onOpenAgent={handleOpenAgent}
            />
          )}

          {currentScreen === 'agent_placeholder' && (
            <AgentPanel context={agentContext} onReturn={handleReturnFromAgent} />
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
}

export default App;
