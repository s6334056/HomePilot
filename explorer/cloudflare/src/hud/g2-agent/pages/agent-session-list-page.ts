import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeSessionInfo } from "../../../domain/types";

const LIST_MAX_LINES = 9;
const LIST_MAX_WIDTH = 56;
const NEW_SESSION_LABEL = "+ New Session";

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
  private onModelSelect: () => Promise<void>;
  private onReturnToExplorer: () => Promise<void>;
  private currentPath: string;
  private sessions: OpenCodeSessionInfo[] = [];
  private selectedIndex: number = 0;
  private returnSessionID: string | null = null;

  constructor(
    controller: G2AgentController,
    onSelect: (sessionID: string) => Promise<void>,
    onModelSelect: () => Promise<void>,
    onReturnToExplorer: () => Promise<void>,
    currentPath: string = "",
  ) {
    super();
    this.pageType = "AgentSessionListPage";
    this.controller = controller;
    this.onSelect = onSelect;
    this.onModelSelect = onModelSelect;
    this.onReturnToExplorer = onReturnToExplorer;
    this.currentPath = currentPath;
  }

  public setReturnSessionID(id: string | null): void {
    this.returnSessionID = id;
  }

  public async afterRender(): Promise<void> {
    try {
      await this.controller.refreshSessions();
      this.sessions = this.controller.getState().sessions;

      if (this.returnSessionID) {
        const foundIdx = this.sessions.findIndex((s) => s.id === this.returnSessionID);
        this.selectedIndex = foundIdx >= 0 ? foundIdx + 1 : 0;
        this.returnSessionID = null;
      } else {
        this.selectedIndex = 0;
      }

      await this.renderPage();
    } catch (e) {
      console.error('[AgentSessionListPage] afterRender error:', e);
    }
  }

  public render(): PageRenderResult {
    const total = this.sessions.length;
    const pageIndicator = `[${this.selectedIndex}/${total}]`;
    const headerContent = this.buildHeaderLine(this.currentPath || "Sessions", pageIndicator, LIST_MAX_WIDTH, "[Sessions]");

    const totalItems = total + 1;
    const selected = Math.max(0, Math.min(this.selectedIndex, totalItems - 1));
    const halfWindow = Math.floor(LIST_MAX_LINES / 2);
    let start = Math.max(0, selected - halfWindow);
    let end = start + LIST_MAX_LINES;

    if (end > totalItems) {
      end = totalItems;
      start = Math.max(0, end - LIST_MAX_LINES);
    }

    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      const isFocused = i === selected;
      const pointer = isFocused ? "> " : "  ";
      if (i === 0) {
        lines.push(`${pointer}${NEW_SESSION_LABEL}`);
      } else {
        const session = this.sessions[i - 1];
        const title = this.truncateName(session.title || "Untitled", LIST_MAX_WIDTH - this.getStringWidth(pointer) - 8);
        const date = formatTimestamp(session.time?.updated);
        const datePart = this.truncateName(date, 8);
        lines.push(`${pointer}${title} ${datePart}`);
      }
    }

    const bodyText = lines.join("\n");

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "agent_header",
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
      containerName: "agent_body",
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
    const totalItems = this.sessions.length + 1;
    if (totalItems <= 1) return;
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = totalItems - 1;
    }
    await this.renderPage();
  }

  public async onScrollDown() {
    const totalItems = this.sessions.length + 1;
    if (totalItems <= 1) return;
    if (this.selectedIndex < totalItems - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    await this.renderPage();
  }

  public async onClick() {
    if (this.selectedIndex === 0) {
      await this.onModelSelect();
    } else {
      const session = this.sessions[this.selectedIndex - 1];
      if (!session) return;
      await this.onSelect(session.id);
    }
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
        this.selectedIndex = 0;
        await this.renderPage();
        break;
    }
  }
}
