import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeMessageWithParts } from "../message-mapper";

const CHAT_MAX_LINES = 9;
const CHAT_MAX_WIDTH = 56;

export class AgentChatPage extends BasePage {
  private sessionID: string;
  private controller: G2AgentController;
  private onReturnToList: () => Promise<void>;
  private onReturnToExplorer: () => Promise<void>;
  private messages: OpenCodeMessageWithParts[] = [];
  private selectedIndex: number = 0;

  constructor(
    sessionID: string,
    controller: G2AgentController,
    onReturnToList: () => Promise<void>,
    onReturnToExplorer: () => Promise<void>,
  ) {
    super();
    this.pageType = "AgentChatPage";
    this.sessionID = sessionID;
    this.controller = controller;
    this.onReturnToList = onReturnToList;
    this.onReturnToExplorer = onReturnToExplorer;
  }

  public async afterRender(): Promise<void> {
    const state = this.controller.getState();
    this.messages = state.messages;

    if (this.messages.length > 0) {
      this.selectedIndex = this.messages.length - 1;
    }

    await this.renderPage();
  }

  private getSessionTitle(): string {
    const state = this.controller.getState();
    const session = state.sessions.find((s) => s.id === this.sessionID);
    return session?.title || "Chat";
  }

  public render(): PageRenderResult {
    const title = this.getSessionTitle();
    const total = this.messages.length;
    const pageIndicator = total > 0 ? `[${this.selectedIndex + 1}/${total}]` : "[0/0]";
    const headerContent = this.buildHeaderLine(title, pageIndicator, CHAT_MAX_WIDTH);

    let bodyText = "";

    if (total === 0) {
      bodyText = "  (No messages yet)";
    } else {
      const selected = Math.max(0, Math.min(this.selectedIndex, total - 1));
      const halfWindow = Math.floor(CHAT_MAX_LINES / 2);
      let start = Math.max(0, selected - halfWindow);
      let end = start + CHAT_MAX_LINES;

      if (end > total) {
        end = total;
        start = Math.max(0, end - CHAT_MAX_LINES);
      }

      const visible = this.messages.slice(start, end);
      const lines = visible.map((msg, idx) => {
        const actualIdx = start + idx;
        const isFocused = actualIdx === selected;
        const pointer = isFocused ? "> " : "  ";
        const role = msg.role === "user" ? "U" : "A";
        const text = msg.contentText || "(empty)";
        const truncated = this.truncateName(text, CHAT_MAX_WIDTH - this.getStringWidth(pointer) - 4);
        return `${pointer}[${role}] ${truncated}`;
      });

      bodyText = lines.join("\n");
    }

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "chat_header",
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
      containerName: "chat_body",
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
          { id: "back_list", title: "Back to List" },
          { id: "back_explorer", title: "Back to Explorer" },
          { id: "refresh", title: "Refresh" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.messages.length === 0) return;
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = this.messages.length - 1;
    }
    await this.renderPage();
  }

  public async onScrollDown() {
    if (this.messages.length === 0) return;
    if (this.selectedIndex < this.messages.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    await this.renderPage();
  }

  public async onClick() {
    // Future: message selection
  }

  public async onDoubleClick() {
    await this.onReturnToList();
  }

  public async onLongPress() {
    // Future: Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "back_list":
        await this.onReturnToList();
        break;
      case "back_explorer":
        await this.onReturnToExplorer();
        break;
      case "refresh":
        await this.controller.refreshMessages();
        const state = this.controller.getState();
        this.messages = state.messages;
        await this.renderPage();
        break;
    }
  }
}
