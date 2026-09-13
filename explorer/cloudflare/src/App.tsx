import { useEffect, useState, useRef, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { MockFileSystemService } from './services/MockFileSystemService';
import { GatewayFileSystemService } from './services/GatewayFileSystemService';
import { FileSystemService } from './services/FileSystemService';
import { resolveConfig } from './services/ConnectionConfig';
import { FileSystemItem, ScreenType, AgentContext } from './domain/types';
import { Navbar } from './components/Navbar';
import { FileTable } from './components/FileTable';
import { FileViewer } from './components/FileViewer';
import { HistoryPage } from './components/HistoryPage';
import { AgentScreen } from './components/AgentScreen';
import { SettingsModal } from './components/SettingsModal';
import { RenameDialog } from './components/RenameDialog';
import { CreateFolderDialog } from './components/CreateFolderDialog';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { UploadDialog } from './components/UploadDialog';
import { ContextActionMenu, ContextActionMenuItem } from './components/ContextActionMenu';
import { Toast } from './components/Toast';
import { G2RuntimeManager, G2RuntimeState } from './hud/g2-runtime';
import { addToHistory } from './services/ViewerHistoryStore';
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
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  // Return highlight (temporary highlight when navigating back)
  const [highlightPath, setHighlightPath] = useState<string | null>(null);

  // Action menu state
  const [showActionMenu, setShowActionMenu] = useState<boolean>(false);
  const [actionMenuTriggerRect, setActionMenuTriggerRect] = useState<DOMRect | null>(null);
  const [historyActionMenuHandler, setHistoryActionMenuHandler] = useState<((event: ReactMouseEvent) => void) | null>(null);

  // Rename dialog state
  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);
  const [renameTarget, setRenameTarget] = useState<FileSystemItem | null>(null);
  const [renameError, setRenameError] = useState<string>('');

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Create folder dialog state
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState<boolean>(false);
  const [createFolderError, setCreateFolderError] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);

  // Upload dialog state
  const [showUploadDialog, setShowUploadDialog] = useState<boolean>(false);

  // Explorer Ready state
  const [isExplorerReady, setIsExplorerReady] = useState<boolean>(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; detail?: string } | null>(null);

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

  const previousScreenRef = useRef<ScreenType>('explorer');
  const historyReturnScreenRef = useRef<ScreenType>('explorer');
  const historyReturnPageRef = useRef<ScreenType>('explorer');
  const prevIsDesktopRef = useRef<boolean>(window.innerWidth >= 1100);
  const [returnPage, setReturnPage] = useState<ScreenType>('explorer');

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
    const firstPath = selectedPaths.values().next().value;
    const item = firstPath ? items.find((i) => i.path === firstPath) || null : null;
    return {
      currentPath: explorerPath,
      selectedItem: item,
      selectedFile: selectedFile,
      content: fileContent || undefined,
      sourceScreen: currentScreen === 'file_viewer' ? 'file_viewer' : 'explorer',
      timestamp: new Date().toISOString(),
    };
  };

  // Can the user go back?
  const canExplorerGoBack = (): boolean => {
    if (currentScreen === 'file_viewer') {
      return !!returnPage;
    }
    if (currentScreen === 'history') {
      return true;
    }
    // Explorer: can go back if not at root
    const parentPath = fileService.getParentPath(explorerPath);
    return parentPath !== explorerPath;
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

      // Load root directory for Gateway service
      if (isGatewayService(fileService)) {
        try {
          const loadedItems = await (fileService as GatewayFileSystemService).getDirectory(rootPath);
          setItems(loadedItems);
          setIsExplorerReady(true);
        } catch {
          setItems([]);
          setIsExplorerReady(false);
        }
      }
    };

    init();
  }, [fileService, g2Runtime]);

  // ── Return Highlight Scroll ─────────────────────────────
  useEffect(() => {
    if (!highlightPath || currentScreen !== 'explorer') return;

    const frame = requestAnimationFrame(() => {
      const row = document.querySelector(`.file-row[data-path="${CSS.escape(highlightPath)}"]`);
      if (row) {
        row.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [highlightPath, currentScreen, items]);

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

  // ── PWA Navigation (independent of G2) ────────────────────

  // Internal navigate (no history management)
  const navigateToPath = async (path: string) => {
    const newService = fileService;
    const rootPath = isGatewayService(newService)
      ? (newService as GatewayFileSystemService).getRootPath()
      : '/home';
    const resolvedPath = path || rootPath;

    setExplorerPath(resolvedPath);
    setCurrentScreen('explorer');
    setSelectedFile(null);
    setSelectedPaths(new Set());

    // Load directory for PWA display
    try {
      const loadedItems = await newService.getDirectory(resolvedPath);
      setItems(loadedItems);
    } catch (e) {
      console.error('[App] Failed to load directory:', e);
      setItems([]);
    }
  };

  const handleOpenFile = async (file: FileSystemItem, _index: number, source?: ScreenType) => {
    try {
      const content = await fileService.readFile(file.path);
      setSelectedFile(file);
      setFileContent(content);
      setReturnPage(source || 'explorer');
      setCurrentScreen('file_viewer');
      // Add to history
      if (isGatewayService(fileService)) {
        addToHistory(fileService as GatewayFileSystemService, file.path);
      }
    } catch (e: any) {
      alert(`Failed to open file: ${e.message}`);
    }
  };

  // Back button: return to previous screen based on current absolute path
  const handleExplorerBack = async () => {
    if (currentScreen === 'file_viewer') {
      if (returnPage === 'history') {
        // FileViewer opened from History → go back to History
        setCurrentScreen('history');
      } else if (selectedFile) {
        // FileViewer opened from Explorer → navigate to parent
        const parentPath = fileService.getParentPath(selectedFile.path);
        setHighlightPath(selectedFile.path);
        await navigateToPath(parentPath);
      }
    } else if (currentScreen === 'history') {
      setReturnPage(historyReturnPageRef.current);
      setCurrentScreen(historyReturnScreenRef.current);
    } else {
      // Explorer: navigate to parent
      const parentPath = fileService.getParentPath(explorerPath);
      if (parentPath !== explorerPath) {
        setHighlightPath(explorerPath);
        await navigateToPath(parentPath);
      }
    }
  };

  const handleExplorerReload = async () => {
    setHighlightPath(null);
    await navigateToPath(explorerPath);
  };

  // ── Multi-select handlers ────────────────────────────────

  const handleToggleSelect = useCallback((path: string) => {
    setHighlightPath(null);
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // ── Action Menu ──────────────────────────────────────────

  const handleOpenActionMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setHighlightPath(null);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setActionMenuTriggerRect(rect);
    setShowActionMenu(true);
  }, []);

  const handleCloseActionMenu = useCallback(() => {
    setShowActionMenu(false);
    setActionMenuTriggerRect(null);
  }, []);

  const handleHistoryActionMenuReady = useCallback((handler: (event: ReactMouseEvent) => void) => {
    setHistoryActionMenuHandler(() => handler);
  }, []);

  const selectedCount = selectedPaths.size;
  const selectedItems = items.filter((i) => selectedPaths.has(i.path));
  const hasSelectedFolders = selectedItems.some((i) => i.type === 'directory');

  const actionMenuItems: ContextActionMenuItem[] = [
    {
      label: 'フォルダを作成',
      disabled: !isExplorerReady,
      onClick: () => {
        setCreateFolderError('');
        setIsCreatingFolder(false);
        setShowCreateFolderDialog(true);
      },
    },
    {
      label: 'アップロード',
      disabled: !isExplorerReady,
      onClick: () => {
        setShowUploadDialog(true);
      },
    },
    {
      label: 'ダウンロード',
      disabled: !isExplorerReady || selectedCount === 0,
      onClick: () => {
        handleDownload();
      },
    },
    {
      label: '名前を変更',
      disabled: !isExplorerReady || selectedCount !== 1,
      onClick: () => {
        const target = selectedItems[0];
        if (target) {
          setRenameTarget(target);
          setRenameError('');
          setShowRenameDialog(true);
        }
      },
    },
    {
      label: '削除',
      disabled: !isExplorerReady || selectedCount === 0,
      onClick: () => {
        setShowDeleteDialog(true);
      },
    },
  ];

  // ── Rename ───────────────────────────────────────────────

  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!renameTarget) return;
    try {
      await fileService.renameItem(renameTarget.path, newName);
      setShowRenameDialog(false);
      setRenameTarget(null);
      setSelectedPaths(new Set());
      setHighlightPath(null);
      await navigateToPath(explorerPath);
    } catch (e: any) {
      setRenameError(e.message || '名前の変更に失敗しました。');
    }
  }, [renameTarget, fileService, explorerPath]);

  const handleRenameCancel = useCallback(() => {
    setShowRenameDialog(false);
    setRenameTarget(null);
    setRenameError('');
  }, []);

  // ── Create Folder ──────────────────────────────────────

  const handleCreateFolderConfirm = useCallback(async (name: string) => {
    setIsCreatingFolder(true);
    setCreateFolderError('');
    try {
      await fileService.createFolder(explorerPath, name);
      setShowCreateFolderDialog(false);
      setCreateFolderError('');
      setSelectedPaths(new Set());
      setHighlightPath(null);
      await navigateToPath(explorerPath);
    } catch (e: any) {
      setCreateFolderError(e.message || 'フォルダの作成に失敗しました。');
    } finally {
      setIsCreatingFolder(false);
    }
  }, [fileService, explorerPath]);

  const handleCreateFolderCancel = useCallback(() => {
    if (!isCreatingFolder) {
      setShowCreateFolderDialog(false);
      setCreateFolderError('');
    }
  }, [isCreatingFolder]);

  // ── Delete ───────────────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;
    setIsDeleting(true);
    try {
      await fileService.deleteItems(paths);
      setShowDeleteDialog(false);
      setSelectedPaths(new Set());
      setHighlightPath(null);
      await navigateToPath(explorerPath);
    } catch (e: any) {
      alert(`削除に失敗しました: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedPaths, fileService, explorerPath]);

  const handleDeleteCancel = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteDialog(false);
    }
  }, [isDeleting]);

  // ── Upload ───────────────────────────────────────────────

  const handleUploadComplete = useCallback(async () => {
    setShowUploadDialog(false);
    setToast({ message: 'アップロードを完了しました' });
    await navigateToPath(explorerPath);
  }, [explorerPath]);

  // ── Download ──────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;

    const hasDirectory = selectedItems.some((i) => i.type === 'directory');

    let downloadFilename: string;
    if (paths.length === 1 && !hasDirectory) {
      downloadFilename = selectedItems[0]?.name || 'file';
    } else if (paths.length === 1 && hasDirectory) {
      downloadFilename = (selectedItems[0]?.name || 'folder') + '.zip';
    } else {
      downloadFilename = 'download.zip';
    }

    try {
      const result = await fileService.downloadItems(paths, hasDirectory);

      if (result.url) {
        const a = document.createElement('a');
        a.href = result.url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      setToast({ message: 'ダウンロードを開始しました', detail: downloadFilename });
    } catch (e: any) {
      alert(`ダウンロードに失敗しました: ${e.message}`);
    }
  }, [selectedPaths, selectedItems, fileService]);

  // Folder click from FileTable
  const handleOpenDirectory = async (path: string, _index: number) => {
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
    setSelectedPaths(new Set());

    // Load initial directory for PWA display
    try {
      const loadedItems = await newService.getDirectory(rootPath);
      setItems(loadedItems);
      setIsExplorerReady(isGatewayService(newService));
    } catch (e) {
      console.error('[App] Failed to load directory after reconnect:', e);
      setItems([]);
      setIsExplorerReady(false);
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
    if (currentScreen === 'history') {
      return '履歴';
    }
    return explorerPath;
  };

  // Determine which pane is first/last for swap button placement
  const isFirstExplorer = paneOrder[0] === 'explorer';

  // Build Explorer pane content
  const explorerPane = (
    <div className={`explorer-pane ${isDesktop || currentScreen === 'explorer' || currentScreen === 'file_viewer' || currentScreen === 'history' ? '' : 'pane-hidden'}`} key="explorer-pane">
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
        onPathBarClick={() => {
          historyReturnScreenRef.current = currentScreen;
          historyReturnPageRef.current = returnPage;
          setCurrentScreen('history');
        }}
        onOpenActionMenu={currentScreen === 'explorer'
          ? handleOpenActionMenu
          : currentScreen === 'history'
            ? historyActionMenuHandler || undefined
            : undefined}
      />

      <div className="main-content-container">
        <main className="content-view">
          {currentScreen === 'explorer' && (
            <FileTable
              items={items}
              selectedPaths={selectedPaths}
              highlightPath={highlightPath}
              onSelectItem={() => {
                // No-op: selection is now via toggle; item click opens/navigates
              }}
              onOpenDirectory={handleOpenDirectory}
              onOpenFile={handleOpenFile}
              onToggleSelect={handleToggleSelect}
            />
          )}

          {currentScreen === 'file_viewer' && selectedFile && (
            <FileViewer
              content={fileContent}
              filePath={selectedFile.path}
              gatewayService={isGatewayService(fileService) ? fileService as GatewayFileSystemService : null}
            />
          )}

          {currentScreen === 'history' && isGatewayService(fileService) && (
            <HistoryPage
              gatewayService={fileService as GatewayFileSystemService}
              onActionMenuReady={handleHistoryActionMenuReady}
              onSelectFile={(path) => {
                // Open file from history with source='history'
                const fileName = path.split(/[\/\\]/).pop() || path;
                const fileItem: FileSystemItem = {
                  id: path,
                  name: fileName,
                  type: 'file',
                  path,
                };
                handleOpenFile(fileItem, 0, 'history');
              }}
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

      {/* Context Action Menu */}
      <ContextActionMenu
        isOpen={showActionMenu}
        items={actionMenuItems}
        onClose={handleCloseActionMenu}
        triggerRect={actionMenuTriggerRect}
      />

      {/* Rename Dialog */}
      <RenameDialog
        isOpen={showRenameDialog}
        currentName={renameTarget?.name || ''}
        onConfirm={handleRenameConfirm}
        onCancel={handleRenameCancel}
        error={renameError}
      />

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        isOpen={showCreateFolderDialog}
        currentPath={explorerPath}
        onConfirm={handleCreateFolderConfirm}
        onCancel={handleCreateFolderCancel}
        error={createFolderError}
        isCreating={isCreatingFolder}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        count={selectedCount}
        hasFolders={hasSelectedFolders}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={isDeleting}
      />

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={showUploadDialog}
        fileService={fileService}
        currentPath={explorerPath}
        onComplete={handleUploadComplete}
        onCancel={() => setShowUploadDialog(false)}
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
              style={{display: 'flex',justifyContent: 'center'}}
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

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          detail={toast.detail}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
