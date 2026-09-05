import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeSessionInfo } from "../../../domain/types";

/**
 * DIAGNOSTIC MODE: Controls AgentSessionListPage PageContainer configuration.
 * Change this constant to switch between test modes on real G2 device.
 *
 * "A" = TextObject 1個 only (minimal)
 * "B" = TextObject 2個 (header + body, no menu)
 * "C" = TextObject 2個 + MenuObject (header + body + menu)
 * "D" = Normal AgentSessionListPage (production config)
 * "E" = Test-C + body isEventCapture:1 only (isolate isEventCapture effect)
 */
const AGENT_PAGE_DIAG_MODE: 'A' | 'B' | 'C' | 'D' | 'E' = 'D';

const LIST_MAX_LINES = 9;
const LIST_MAX_WIDTH = 56;

function formatTimestamp(updated?: number): string {
  if (!updated) return "";
  const d = new Date(updated);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day}`;
}

export class AgentSessionListPage extends BasePage {
  private controller: G2AgentController;
  private onSelect: (sessionID: string) => Promise<void>;
  private onReturnToExplorer: () => Promise<void>;
  private sessions: OpenCodeSessionInfo[] = [];
  private selectedIndex: number = 0;
  /** Diagnostic: counts render() calls during Loading→Agent flow */
  private diagRenderCount: number = 0;

  constructor(
    controller: G2AgentController,
    onSelect: (sessionID: string) => Promise<void>,
    onReturnToExplorer: () => Promise<void>,
  ) {
    super();
    this.pageType = "AgentSessionListPage";
    this.controller = controller;
    this.onSelect = onSelect;
    this.onReturnToExplorer = onReturnToExplorer;
  }

  public async afterRender(): Promise<void> {
    console.log('[AgentSessionListPage] afterRender START');

    if (AGENT_PAGE_DIAG_MODE !== 'D' && this.diagRenderCount === 0) {
      // Loading page was rendered by render() call #1.
      // PageManager already called rebuildPageContainer + 200ms settle wait.
      // Now advance to the real Test-C page.
      this.diagRenderCount = 1;
      console.log('[DIAG Loading] advancing to Test-C Agent PageContainer');
      console.log('[AgentSessionListPage] afterRender END (diag: will render Test-C on next renderCurrentPage)');
      return;
    }

    try {
      console.log('[AgentSessionListPage] refreshSessions START');
      await this.controller.refreshSessions();
      console.log('[AgentSessionListPage] refreshSessions END');
      this.sessions = this.controller.getState().sessions;
      console.log(`[AgentSessionListPage] sessions loaded: ${this.sessions.length}`);
      console.log('[AgentSessionListPage] renderPage START');
      await this.renderPage();
      console.log('[AgentSessionListPage] renderPage END');
    } catch (e) {
      console.error('[AgentSessionListPage] afterRender ERROR:', e);
    }
    console.log('[AgentSessionListPage] afterRender END');
  }

  public render(): PageRenderResult {
    console.log(`[AgentSessionListPage] DIAG MODE=${AGENT_PAGE_DIAG_MODE} diagRenderCount=${this.diagRenderCount}`);

    if (AGENT_PAGE_DIAG_MODE !== 'D' && this.diagRenderCount === 0) {
      // Test: Loading PageContainer — minimal, no data, no menu
      console.log('[DIAG Loading] render: returning Loading PageContainer');
      const loadingProp = new TextContainerProperty({
        containerID: 1,
        containerName: "diag_loading",
        content: "Loading...",
        xPosition: 4,
        yPosition: 2,
        width: 572,
        height: 28,
        borderWidth: 0,
        isEventCapture: 0,
      });
      return {
        containerTotalNum: 1,
        textObject: [loadingProp],
      };
    }

    if (AGENT_PAGE_DIAG_MODE === 'A') {
      // Test A: TextObject 1個 only — minimal
      console.log('[PageManager] AgentPage DIAG TEST=A');
      const textProp = new TextContainerProperty({
        containerID: 1,
        containerName: "diag_test",
        content: "Agent Test",
        xPosition: 4,
        yPosition: 2,
        width: 572,
        height: 28,
        borderWidth: 0,
        isEventCapture: 0,
      });
      return {
        containerTotalNum: 1,
        textObject: [textProp],
      };
    }

    if (AGENT_PAGE_DIAG_MODE === 'B') {
      // Test B: TextObject 2個 — header + body, no menu
      console.log('[PageManager] AgentPage DIAG TEST=B');
      const headerProp = new TextContainerProperty({
        containerID: 1,
        containerName: "diag_header",
        content: "Agent Test Header",
        xPosition: 4,
        yPosition: 2,
        width: 572,
        height: 28,
        borderWidth: 0,
        isEventCapture: 0,
      });
      const bodyProp = new TextContainerProperty({
        containerID: 2,
        containerName: "diag_body",
        content: "Agent Test Body",
        xPosition: 4,
        yPosition: 30,
        width: 572,
        height: 256,
        borderWidth: 0,
        isEventCapture: 0,
      });
      return {
        containerTotalNum: 2,
        textObject: [headerProp, bodyProp],
      };
    }

    if (AGENT_PAGE_DIAG_MODE === 'C') {
      // Test C: TextObject 2個 + MenuObject
      console.log('[PageManager] AgentPage DIAG TEST=C');
      const headerProp = new TextContainerProperty({
        containerID: 1,
        containerName: "diag_header",
        content: "Agent Test Header",
        xPosition: 4,
        yPosition: 2,
        width: 572,
        height: 28,
        borderWidth: 0,
        isEventCapture: 0,
      });
      const bodyProp = new TextContainerProperty({
        containerID: 2,
        containerName: "diag_body",
        content: "Agent Test Body",
        xPosition: 4,
        yPosition: 30,
        width: 572,
        height: 256,
        borderWidth: 0,
        isEventCapture: 0,
      });
      return {
        containerTotalNum: 2,
        textObject: [headerProp, bodyProp],
        menuObject: {
          menuList: [
            { id: "back", title: "Back" },
            { id: "refresh", title: "Refresh" },
          ],
        },
      };
    }

    if (AGENT_PAGE_DIAG_MODE === 'E') {
      // Test E: Test-C + body isEventCapture:1 only
      console.log('[PageManager] AgentPage DIAG TEST=E (Test-C + isEventCapture:1)');
      const headerProp = new TextContainerProperty({
        containerID: 1,
        containerName: "diag_header",
        content: "Agent Test Header",
        xPosition: 4,
        yPosition: 2,
        width: 572,
        height: 28,
        borderWidth: 0,
        isEventCapture: 0,
      });
      const bodyProp = new TextContainerProperty({
        containerID: 2,
        containerName: "diag_body",
        content: "Agent Test Body",
        xPosition: 4,
        yPosition: 30,
        width: 572,
        height: 256,
        borderWidth: 0,
        isEventCapture: 1,
      });
      return {
        containerTotalNum: 2,
        textObject: [headerProp, bodyProp],
        menuObject: {
          menuList: [
            { id: "back", title: "Back" },
            { id: "refresh", title: "Refresh" },
          ],
        },
      };
    }

    // Test D: Normal AgentSessionListPage (production)
    console.log('[PageManager] AgentPage DIAG TEST=D (normal)');
    const total = this.sessions.length;
    const pageIndicator = total > 0 ? `[${this.selectedIndex + 1}/${total}]` : "[0/0]";
    const headerContent = this.buildHeaderLine("Sessions", pageIndicator, LIST_MAX_WIDTH);

    let bodyText = "";

    if (total === 0) {
      bodyText = "";
    } else {
      const selected = Math.max(0, Math.min(this.selectedIndex, total - 1));
      const halfWindow = Math.floor(LIST_MAX_LINES / 2);
      let start = Math.max(0, selected - halfWindow);
      let end = start + LIST_MAX_LINES;

      if (end > total) {
        end = total;
        start = Math.max(0, end - LIST_MAX_LINES);
      }

      const visible = this.sessions.slice(start, end);
      const lines = visible.map((session, idx) => {
        const actualIdx = start + idx;
        const isFocused = actualIdx === selected;
        const pointer = isFocused ? "> " : "  ";
        const title = this.truncateName(session.title || "Untitled", LIST_MAX_WIDTH - this.getStringWidth(pointer) - 8);
        const date = formatTimestamp(session.time?.updated);
        const datePart = this.truncateName(date, 8);
        return `${pointer}${title} ${datePart}`;
      });

      bodyText = lines.join("\n");
    }

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "viewer_header",
      content: headerContent,
      xPosition: 4,
      yPosition: 2,
      width: 572,
      height: 28,
      borderWidth: 0,
      isEventCapture: 0,
    });

    const bodyProp = new TextContainerProperty({
      containerID: 2,
      containerName: "viewer_body",
      content: bodyText,
      xPosition: 4,
      yPosition: 30,
      width: 572,
      height: 256,
      borderWidth: 1,
      borderColor: 0xFFFFFFFF,
      borderRadius: 8,
      paddingLength: 2,
      isEventCapture: 1,
    });

    return {
      containerTotalNum: 2,
      textObject: [headerProp, bodyProp],
      menuObject: {
        menuList: [
          { id: "back", title: "Back" },
          { id: "refresh", title: "Refresh" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.sessions.length === 0) return;
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = this.sessions.length - 1;
    }
    await this.renderPage();
  }

  public async onScrollDown() {
    if (this.sessions.length === 0) return;
    if (this.selectedIndex < this.sessions.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    await this.renderPage();
  }

  public async onClick() {
    const session = this.sessions[this.selectedIndex];
    if (!session) return;
    await this.onSelect(session.id);
  }

  public async onDoubleClick() {
    await this.onReturnToExplorer();
  }

  public async onLongPress() {
    // Future: Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "back":
        await this.onReturnToExplorer();
        break;
      case "refresh":
        await this.controller.refreshSessions();
        this.sessions = this.controller.getState().sessions;
        await this.renderPage();
        break;
    }
  }
}
