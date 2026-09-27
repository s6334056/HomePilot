import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { G2RuntimeManager } from '../g2-runtime';
import { HomePage } from '../pages/home-page';
import { FileViewerPage } from '../pages/file-viewer-page';
import { G2_MENU_HOME_ID, type BasePage } from '../page-manager';

type AnyRecord = Record<string, any>;

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function makeRuntime(gateway?: AnyRecord) {
  const mgr = new G2RuntimeManager();
  const navigated: BasePage[] = [];
  let currentPage: BasePage | null = null;
  const bridgeStub = {
    shutDownPageContainer: vi.fn(async () => true),
  };

  // 実際の PageManager と同じく navigateTo でページを init する
  // （notifyStatus / renderPage / bridge が使える状態にするため）
  const fakePageManager = {
    getCurrentPage: () => currentPage,
    navigateTo: vi.fn(async (page: BasePage) => {
      if (currentPage) currentPage.onDeactivate();
      currentPage = page;
      navigated.push(page);
      page.init(
        (nextPage) => fakePageManager.navigateTo(nextPage),
        async () => {},
        bridgeStub as any,
        () => {},
        () => {},
      );
      return true;
    }),
  };

  const fakeGateway = {
    isAvailable: true,
    getRootPath: () => '/root',
    getParentPath: (path: string) => path,
    initialize: vi.fn(async () => undefined),
    ...(gateway ?? {}),
  };

  (mgr as any).pageManager = fakePageManager;
  (mgr as any).gatewayService = fakeGateway;

  return {
    mgr,
    navigated,
    bridgeStub,
    internal: mgr as unknown as AnyRecord,
    last: () => navigated[navigated.length - 1],
    setCurrentPage: (page: BasePage | null) => {
      currentPage = page;
    },
  };
}

function menuIds(page: BasePage): string[] {
  const result = page.render();
  return (result.menuObject?.menuList ?? []).map((item) => item.id);
}

function fakeAgentController() {
  return {
    getState: () => ({
      sessions: [],
      processingSessionIDs: [],
      unreadSessionIDs: [],
      selectedSessionID: null,
      messages: [],
      voiceState: 'idle',
      questionVoiceConfirm: false,
      pendingQuestions: [],
      pendingPermissions: [],
    }),
    refreshSessions: vi.fn(async () => {}),
    selectSession: vi.fn(async () => {}),
  };
}

describe('G2 Home navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  });

  it('Home is shown without touching any file system', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();

    expect(last().pageType).toBe('HomePage');
    expect(last()).toBeInstanceOf(HomePage);
    // Home 到達時点では接続先を決めない（既定は gateway = 従来のまま）
    expect(mgr.getConnectionMode()).toBe('gateway');
    expect(internal.historyReturnPage).toBeNull();
    expect(internal.agentReturnPage).toBeNull();
  });

  it('Home Double Tap → exit confirmation', async () => {
    const { mgr, last, bridgeStub } = makeRuntime();

    await mgr.navigateToHome();

    await last().onDoubleClick();

    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledTimes(1);
    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledWith(1);
  });

  it('Home → アプリ → Local Explorer → root Double Tap → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await (internal as AnyRecord).handleHomeSelection('local');

    expect(mgr.getConnectionMode()).toBe('local');
    const explorer = last();
    expect(explorer.pageType).toBe('ExplorerPage');
    expect((explorer as AnyRecord).getCurrentPath()).toBe('/');

    await explorer.onDoubleClick();

    expect(last().pageType).toBe('HomePage');
  });

  it('Home → 自宅PC → Gateway Explorer → root Double Tap → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await (internal as AnyRecord).handleHomeSelection('gateway');

    expect(mgr.getConnectionMode()).toBe('gateway');
    const explorer = last();
    expect(explorer.pageType).toBe('ExplorerPage');
    expect((explorer as AnyRecord).getCurrentPath()).toBe('/root');

    await explorer.onDoubleClick();

    expect(last().pageType).toBe('HomePage');
  });

  it('Explorer の root 以外 Double Tap は従来通り親フォルダへ戻る', async () => {
    const { last, internal } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('local');
    const explorer = last() as AnyRecord;

    // Local ファイルシステムに /docs を用意
    await explorer.fileService.createFolder('/', 'docs');
    await explorer.loadDirectory('/docs');
    expect(explorer.getCurrentPath()).toBe('/docs');

    await explorer.onDoubleClick();

    // root ではないので Home へは戻らず、親フォルダへ
    expect(last()).toBe(explorer);
    expect(explorer.getCurrentPath()).toBe('/');
  });

  it('Home → アプリ → Local History → root Double Tap → Home', async () => {
    const { mgr, last, internal, setCurrentPage } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('local');
    setCurrentPage(null);
    internal.historyReturnPage = null;

    await mgr.navigateToHistory();
    expect(last().pageType).toBe('HistoryPage');

    await last().onDoubleClick();

    expect(last().pageType).toBe('HomePage');
  });

  it('Home → 自宅PC → Gateway History → root Double Tap → Home', async () => {
    const { mgr, last, internal, setCurrentPage } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('gateway');
    setCurrentPage(null);
    internal.historyReturnPage = null;

    await mgr.navigateToHistory();
    expect(last().pageType).toBe('HistoryPage');

    await last().onDoubleClick();

    expect(last().pageType).toBe('HomePage');
  });

  it('History に入口ページがある場合は従来通りそのページへ戻る', async () => {
    const { mgr, last, internal, setCurrentPage } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('gateway');
    const origin = last();
    setCurrentPage(origin);

    await mgr.navigateToHistory();
    expect(internal.historyReturnPage).toBe(origin);

    await last().onDoubleClick();

    expect(last()).toBe(origin);
  });

  it('Home → 自宅PC → Agent → Session List root → Double Tap → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('gateway');
    internal.g2AgentController = {} as AnyRecord;

    await mgr.navigateToSessionList();
    const sessionList = last();
    expect(sessionList.pageType).toBe('AgentSessionListPage');

    await sessionList.onDoubleClick();

    expect(last().pageType).toBe('HomePage');
  });
});

describe('Agent は自宅PC側専用', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  });

  it('ローカル接続の Explorer / History は Agent メニューを出さない', async () => {
    const { mgr, last, internal } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('local');
    expect(menuIds(last())).not.toContain('agent');

    await mgr.navigateToHistory();
    expect(menuIds(last())).not.toContain('agent');
  });

  it('自宅PC接続の Explorer / History は従来通り Agent メニューを出す', async () => {
    const { mgr, last, internal } = makeRuntime();

    await (internal as AnyRecord).handleHomeSelection('gateway');
    expect(menuIds(last())).toContain('agent');

    await mgr.navigateToHistory();
    expect(menuIds(last())).toContain('agent');
  });
});

describe('History の Local / Gateway 切り替え', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  });

  it('ローカル接続の History は PWA 共有の Local History を読む', async () => {
    const { mgr, last, internal, setCurrentPage } = makeRuntime();

    const { addToHistory } = await import('../../services/LocalHistoryStore');
    addToHistory('/notes/local.txt');

    await (internal as AnyRecord).handleHomeSelection('local');
    setCurrentPage(null);
    internal.historyReturnPage = null;
    await mgr.navigateToHistory();

    const access = (internal.historyPage as AnyRecord).historyAccess;
    const entries = await access.getHistory();

    expect(last().pageType).toBe('HistoryPage');
    expect(entries.map((entry: AnyRecord) => entry.path)).toContain('/notes/local.txt');
  });

  it('自宅PC接続の History は Gateway の viewer state を読む', async () => {
    const getViewerState = vi.fn().mockResolvedValue({
      history: [{ path: '/pc/a.txt', lastViewedAt: 123 }],
      positions: {},
    });
    const { mgr, internal, setCurrentPage } = makeRuntime({
      getRootPath: () => '/root',
      getParentPath: (path: string) => path,
      getViewerState,
    });

    await (internal as AnyRecord).handleHomeSelection('gateway');
    setCurrentPage(null);
    internal.historyReturnPage = null;
    await mgr.navigateToHistory();

    const access = (internal.historyPage as AnyRecord).historyAccess;
    const entries = await access.getHistory();

    expect(getViewerState).toHaveBeenCalledTimes(1);
    expect(entries.map((entry: AnyRecord) => entry.path)).toEqual(['/pc/a.txt']);
  });
});

describe('Home → 自宅PC 接続の結果フィードバック', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function homeBody(page: BasePage): string {
    const body = (page.render().textObject as AnyRecord[]).find(
      (container) => container.containerName === 'home_body',
    );
    return String(body?.content ?? '');
  }

  it('Gateway接続成功 → Gateway Explorer へ遷移する', async () => {
    const { mgr, last, internal } = makeRuntime();
    await mgr.navigateToHome();

    await internal.handleHomeSelection('gateway');

    expect(mgr.getConnectionMode()).toBe('gateway');
    expect(last().pageType).toBe('ExplorerPage');
    expect((last() as AnyRecord).getCurrentPath()).toBe('/root');
    expect(homeBody(last())).not.toContain('接続できませんでした');
  });

  it('Gateway接続失敗 → Home に留まり、Home 画面上にエラーを表示する', async () => {
    const { mgr, last, internal } = makeRuntime({
      isAvailable: false,
      getRootPath: () => '',
    });
    await mgr.navigateToHome();

    await internal.handleHomeSelection('gateway');

    expect(last().pageType).toBe('HomePage');
    expect(homeBody(last())).toContain('自宅PC（Gateway）に接続できませんでした。');
    expect(internal.gatewayService.initialize).toHaveBeenCalled();
  });

  it('起動時に接続失敗していても、選択時に再接続できれば Explorer へ遷移する', async () => {
    const gateway: AnyRecord = {
      isAvailable: false,
      getRootPath: () => '',
      initialize: vi.fn(async function (this: AnyRecord) {
        this.isAvailable = true;
        this.getRootPath = () => '/root';
      }),
    };
    const { mgr, last, internal } = makeRuntime(gateway);
    await mgr.navigateToHome();

    await internal.handleHomeSelection('gateway');

    expect(gateway.initialize).toHaveBeenCalledTimes(1);
    expect(last().pageType).toBe('ExplorerPage');
    expect((last() as AnyRecord).getCurrentPath()).toBe('/root');
  });

  it('Gateway が未作成（接続情報なし）でもエラー表示して Home に留まる', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('gateway down'));
    vi.stubGlobal('fetch', fetchMock);
    const { mgr, last, internal } = makeRuntime();
    await mgr.navigateToHome();
    internal.gatewayService = null;

    await internal.handleHomeSelection('gateway');

    expect(last().pageType).toBe('HomePage');
    expect(homeBody(last())).toContain('自宅PC（Gateway）に接続できませんでした。');
  });

  it('接続失敗の表示は Home の描画（Home Double Tap → 終了確認）を妨げない', async () => {
    const { mgr, last, internal, bridgeStub } = makeRuntime({
      isAvailable: false,
      getRootPath: () => '',
    });
    await mgr.navigateToHome();

    await internal.handleHomeSelection('gateway');
    await last().onDoubleClick();

    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledWith(1);
  });
});

describe('FileViewer の History 記録', () => {
  it('渡された HistoryAccess へ記録する（接続先に応じて Local / Gateway が差し込まれる）', async () => {
    const addToHistory = vi.fn().mockResolvedValue(undefined);
    const file = { id: '/a.txt', name: 'a.txt', type: 'file' as const, path: '/a.txt' };
    const page = new FileViewerPage(
      file,
      { readFile: vi.fn().mockResolvedValue('hello') } as any,
      async () => true,
      undefined,
      undefined,
      undefined,
      undefined,
      { addToHistory } as any,
    );
    page.init(
      async () => true,
      async () => {},
      { shutDownPageContainer: vi.fn() } as any,
      () => {},
      () => {},
    );

    await page.afterRender();

    expect(addToHistory).toHaveBeenCalledWith('/a.txt');
  });

  it('HistoryAccess が無い場合は記録しない（既存の動作）', async () => {
    const file = { id: '/a.txt', name: 'a.txt', type: 'file' as const, path: '/a.txt' };
    const page = new FileViewerPage(
      file,
      { readFile: vi.fn().mockResolvedValue('hello') } as any,
      async () => true,
    );
    page.init(
      async () => true,
      async () => {},
      { shutDownPageContainer: vi.fn() } as any,
      () => {},
      () => {},
    );

    await expect(page.afterRender()).resolves.toBeUndefined();
    expect((page as AnyRecord).historyAccess).toBeNull();
  });
});

describe('コンテキストメニューからホーム画面へ', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  });

  /** 「ホーム画面へ」がメニューに在ることを確認して選択する。 */
  async function jumpToHomeFrom(page: BasePage): Promise<void> {
    expect(menuIds(page)).toContain(G2_MENU_HOME_ID);
    await page.onMenuItemClick(G2_MENU_HOME_ID);
  }

  it('Home には「ホーム画面へ」が無い（Home が行き先なので）＋ Double Tap は終了確認', async () => {
    const { mgr, last, bridgeStub } = makeRuntime();

    await mgr.navigateToHome();
    const home = last();

    expect(home.pageType).toBe('HomePage');
    expect(menuIds(home)).not.toContain(G2_MENU_HOME_ID);

    await home.onDoubleClick();
    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledTimes(1);
    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledWith(1);
  });

  it('Local Explorer のコンテキストメニュー → ホーム画面へ → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('local');
    const explorer = last();
    expect(explorer.pageType).toBe('ExplorerPage');
    expect((explorer as AnyRecord).getCurrentPath()).toBe('/');

    await jumpToHomeFrom(explorer);

    expect(last().pageType).toBe('HomePage');
  });

  it('Gateway Explorer のコンテキストメニュー → ホーム画面へ → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('gateway');
    const explorer = last();
    expect(explorer.pageType).toBe('ExplorerPage');
    expect((explorer as AnyRecord).getCurrentPath()).toBe('/root');

    await jumpToHomeFrom(explorer);

    expect(last().pageType).toBe('HomePage');
  });

  it('FileViewer のコンテキストメニュー → ホーム画面へ → Home（階層は無視して直帰）', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('local');
    const explorer = last() as AnyRecord;
    explorer.items = [{ id: '/a.txt', name: 'a.txt', type: 'file', path: '/a.txt' }];
    explorer.selectedIndex = 0;
    await explorer.onClick();

    const viewer = last();
    expect(viewer.pageType).toBe('FileViewerPage');

    await jumpToHomeFrom(viewer);

    expect(last().pageType).toBe('HomePage');
  });

  it('History のコンテキストメニュー → ホーム画面へ → Home（戻り先は破棄される）', async () => {
    const { mgr, last, internal } = makeRuntime();

    await internal.handleHomeSelection('gateway');
    const origin = last();
    await mgr.navigateToHistory();

    // History の入口ページは保存される（既存動作）
    expect(internal.historyReturnPage).toBe(origin);

    const history = last();
    expect(history.pageType).toBe('HistoryPage');

    await jumpToHomeFrom(history);

    expect(last().pageType).toBe('HomePage');
    // Home 到達で戻り先は従来どおり破棄（履歴スタックは作らない）
    expect(internal.historyReturnPage).toBeNull();
    expect(internal.historyPage).toBeNull();
  });

  it('Agent Session List のコンテキストメニュー → ホーム画面へ → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await internal.handleHomeSelection('gateway');
    const explorer = last();
    internal.g2AgentController = fakeAgentController();
    await mgr.navigateToSessionList();

    const sessionList = last();
    expect(sessionList.pageType).toBe('AgentSessionListPage');
    // Session List への移動で Explorer が戻り先として保存される（既存動作）
    expect(internal.agentReturnPage).toBe(explorer);

    await jumpToHomeFrom(sessionList);

    expect(last().pageType).toBe('HomePage');
    expect(internal.agentReturnPage).toBeNull();
    expect(internal.sessionListPage).toBeNull();
  });

  it('Model Select のコンテキストメニュー → ホーム画面へ → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    internal.g2AgentController = fakeAgentController();
    await mgr.navigateToModelSelect();

    const modelSelect = last();
    expect(modelSelect.pageType).toBe('AgentModelSelectPage');

    await jumpToHomeFrom(modelSelect);

    expect(last().pageType).toBe('HomePage');
  });

  it('Agent Chat のコンテキストメニュー → ホーム画面へ → Home', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    internal.g2AgentController = fakeAgentController();
    await mgr.navigateToAgentChat('s1');

    const chat = last();
    expect(chat.pageType).toBe('AgentChatPage');

    await jumpToHomeFrom(chat);

    expect(last().pageType).toBe('HomePage');
    expect(internal.agentReturnPage).toBeNull();
    expect(internal.modelSelectPage).toBeNull();
  });

  it('どの画面から Home へ来ても Double Tap はアプリ終了確認のまま', async () => {
    const { mgr, last, internal, bridgeStub } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('gateway');
    const explorer = last() as AnyRecord;
    explorer.items = [{ id: '/a.txt', name: 'a.txt', type: 'file', path: '/a.txt' }];
    await explorer.onClick();
    await jumpToHomeFrom(last());

    expect(last().pageType).toBe('HomePage');
    await last().onDoubleClick();
    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledWith(1);
  });

  it('既存の Double Tap は変更しない（非root Explorer は親フォルダへ）', async () => {
    const { last, internal } = makeRuntime();

    await internal.handleHomeSelection('local');
    const explorer = last() as AnyRecord;
    await explorer.fileService.createFolder('/', 'docs');
    await explorer.loadDirectory('/docs');

    // コンテキストメニューに「ホーム画面へ」が在っても Double Tap は親へ
    expect(menuIds(last())).toContain(G2_MENU_HOME_ID);
    await explorer.onDoubleClick();

    expect(last()).toBe(explorer);
    expect(last().pageType).toBe('ExplorerPage');
    expect(explorer.getCurrentPath()).toBe('/');
  });
});

describe('「ホーム画面へ」はメニューの先頭', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  });

  /** home を含む完全な id 並びで確認（既存項目の相対順序も固定する）。 */
  function expectMenu(page: BasePage, expected: string[]) {
    expect(menuIds(page)).toEqual(expected);
  }

  it('Home のメニューは従来どおり（「ホーム画面へ」は無い）', async () => {
    const { mgr, last } = makeRuntime();

    await mgr.navigateToHome();

    expectMenu(last(), ['refresh']);
  });

  it('Local Explorer の先頭に home、既存項目の順序は不変', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('local');

    expectMenu(last(), ['home', 'history', 'refresh', 'toggleSort']);
  });

  it('Gateway Explorer の先頭に home、既存項目の順序は不変', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('gateway');

    expectMenu(last(), ['home', 'history', 'agent', 'refresh', 'toggleSort']);
  });

  it('FileViewer の先頭に home、既存項目の順序は不変', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('local');
    const explorer = last() as AnyRecord;
    explorer.items = [{ id: '/a.txt', name: 'a.txt', type: 'file', path: '/a.txt' }];
    explorer.selectedIndex = 0;
    await explorer.onClick();

    expectMenu(last(), ['home', 'history', 'refresh', 'top', 'bottom', 'scrollInvert']);
  });

  it('History の先頭に home、既存項目の順序は不変', async () => {
    const { mgr, last, internal } = makeRuntime();

    await internal.handleHomeSelection('gateway');
    await mgr.navigateToHistory();

    expectMenu(last(), ['home', 'explorer', 'agent', 'refresh']);
  });

  it('Agent Session List の先頭に home、既存項目の順序は不変', async () => {
    const { mgr, last, internal } = makeRuntime();

    await internal.handleHomeSelection('gateway');
    internal.g2AgentController = fakeAgentController();
    await mgr.navigateToSessionList();

    expectMenu(last(), ['home', 'history', 'explorer', 'refresh']);
  });

  it('Agent Model Select の先頭に home（従来はメニュー無し）', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    internal.g2AgentController = fakeAgentController();
    await mgr.navigateToModelSelect();

    expectMenu(last(), ['home']);
  });

  it('Agent Chat の先頭に home、既存項目の順序は不変', async () => {
    const { mgr, last, internal } = makeRuntime();

    await mgr.navigateToHome();
    internal.g2AgentController = fakeAgentController();
    await mgr.navigateToAgentChat('s1');

    expectMenu(last(), ['home', 'history', 'explorer', 'refresh', 'top', 'bottom', 'scrollInvert']);
  });

  it('「ホーム画面へ」の遷移先は従来どおり navigateToHome()', async () => {
    const { mgr, last, internal } = makeRuntime();

    await internal.handleHomeSelection('local');
    const explorer = last();
    const navigateToHome = vi.spyOn(mgr, 'navigateToHome').mockResolvedValue(undefined);

    await explorer.onMenuItemClick('home');

    expect(navigateToHome).toHaveBeenCalledTimes(1);
  });

  it('Home 到達後の Double Tap は従来どおりアプリ終了確認', async () => {
    const { mgr, last, internal, bridgeStub } = makeRuntime();

    await mgr.navigateToHome();
    await internal.handleHomeSelection('local');
    await last().onMenuItemClick('home');

    expect(last().pageType).toBe('HomePage');
    await last().onDoubleClick();
    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledTimes(1);
    expect(bridgeStub.shutDownPageContainer).toHaveBeenCalledWith(1);
  });
});
