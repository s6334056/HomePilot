import { describe, it, expect, vi, beforeEach } from 'vitest';
import { G2RuntimeManager } from '../g2-runtime';
import type { BasePage } from '../page-manager';

function makeRuntime() {
  const mgr = new G2RuntimeManager();
  const navigated: BasePage[] = [];
  let currentPage: BasePage | null = null;

  const fakePageManager = {
    getCurrentPage: () => currentPage,
    navigateTo: vi.fn(async (page: BasePage) => {
      navigated.push(page);
      currentPage = page;
      return true;
    }),
  };
  const fakeGateway = { getRootPath: () => '/root' };

  (mgr as any).pageManager = fakePageManager;
  (mgr as any).gatewayService = fakeGateway;

  return {
    mgr,
    navigated,
    setCurrentPage: (page: BasePage | null) => {
      currentPage = page;
    },
    internal: mgr as unknown as Record<string, any>,
  };
}

describe('History navigation (G2RuntimeManager)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('startup History (no current page) keeps historyReturnPage null → double-tap goes to root Explorer', async () => {
    const { mgr, navigated, setCurrentPage, internal } = makeRuntime();
    setCurrentPage(null);
    // Stale value from a previous run must not win
    internal.historyReturnPage = { pageType: 'FileViewerPage' };

    // Startup sequence: enter History as the first page (startG2Runtime)
    internal.historyReturnPage = null;
    await mgr.navigateToHistory();
    expect(internal.historyReturnPage).toBeNull();
    expect(navigated[navigated.length - 1].pageType).toBe('HistoryPage');

    // Double-tap on HistoryPage → navigateFromHistoryToExplorer
    await mgr.navigateFromHistoryToExplorer();

    const target = navigated[navigated.length - 1];
    expect(target.pageType).toBe('ExplorerPage');
    expect((target as any).getCurrentPath()).toBe('/root');
  });

  it('normal History entry from a viewer still returns to the origin page on double-tap', async () => {
    const { mgr, navigated, setCurrentPage, internal } = makeRuntime();
    const origin = { pageType: 'FileViewerPage' } as unknown as BasePage;
    setCurrentPage(origin);

    await mgr.navigateToHistory();
    expect(internal.historyReturnPage).toBe(origin);

    await mgr.navigateFromHistoryToExplorer();
    expect(navigated[navigated.length - 1]).toBe(origin);
    expect(internal.historyReturnPage).toBeNull();
  });

  it('History context menu entries are wired independently of the double-tap origin', async () => {
    const { mgr, internal } = makeRuntime();
    internal.historyReturnPage = null;
    await mgr.navigateToHistory();

    const historyPage = internal.historyPage;
    expect(historyPage).toBeTruthy();

    const toExplorer = vi.spyOn(mgr as any, 'navigateToRootExplorer').mockResolvedValue(undefined);
    const toAgent = vi.spyOn(mgr as any, 'navigateToSessionList').mockResolvedValue(undefined);

    await historyPage.onMenuItemClick('explorer');
    expect(toExplorer).toHaveBeenCalledTimes(1);

    await historyPage.onMenuItemClick('agent');
    expect(toAgent).toHaveBeenCalledTimes(1);
  });
});
