import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeMessageWithParts } from "../message-mapper";

const CHAT_MAX_LINES = 9;
const CHAT_MAX_WIDTH = 56;
const SCROLL_STEP = 8;

function formatTime(ts?: number): string {
  if (!ts) return "??:??";
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function stripHomePilotContext(text: string): string {
  return text.replace(/\[HomePilot Context\][\s\S]*?\[\/HomePilot Context\]\n\n?/g, "").trimEnd();
}

export class AgentChatPage extends BasePage {
  private controller: G2AgentController;
  private onReturnToList: () => Promise<void>;
  private onReturnToExplorer: () => Promise<void>;
  private currentPath: string;
  private messages: OpenCodeMessageWithParts[] = [];
  private chatText: string = "";
  private wrappedLines: string[] = [];
  private scrollLine: number = 0;
  private modelName: string = "Agent";
  private voiceTestMode: "none" | "long_press" | "released" = "none";

  constructor(
    controller: G2AgentController,
    onReturnToList: () => Promise<void>,
    onReturnToExplorer: () => Promise<void>,
    currentPath: string = "",
  ) {
    super();
    this.pageType = "AgentChatPage";
    this.controller = controller;
    this.onReturnToList = onReturnToList;
    this.onReturnToExplorer = onReturnToExplorer;
    this.currentPath = currentPath;
  }

  public async afterRender(): Promise<void> {
    const state = this.controller.getState();
    this.messages = state.messages;
    this.modelName = await this.resolveModelName();
    this.buildChatText();
    this.buildWrappedLines();
    this.scrollLine = Math.max(0, this.wrappedLines.length - CHAT_MAX_LINES);
    await this.renderPage();
  }

  private async resolveModelName(): Promise<string> {
    const state = this.controller.getState();
    const sessionID = this.messages[0]?.sessionID || state.selectedSessionID;
    if (sessionID) {
      return this.controller.getModelDisplayName(sessionID);
    }
    return "Agent";
  }

  private buildChatText(): void {
    const allMessages = this.messages;
    if (allMessages.length === 0) {
      this.chatText = "";
      return;
    }

    const visible: OpenCodeMessageWithParts[] = [];
    for (const msg of allMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        visible.push(msg);
      }
    }

    if (visible.length === 0) {
      this.chatText = "";
      return;
    }

    const blocks: string[] = [];

    for (let i = 0; i < visible.length; i++) {
      const msg = visible[i];
      const created = formatTime(msg.time?.created);

      if (msg.role === "user") {
        const displayText = stripHomePilotContext(msg.contentText || "(empty)");
        blocks.push(`[U] ${created}\n${displayText}`);
      } else {
        let startTime: number | undefined;
        if (i > 0) {
          startTime = visible[i - 1].time?.created;
        }
        if (startTime == null && msg.time?.created != null) {
          startTime = msg.time.created;
        }

        const completed = msg.time?.completed;
        if (completed != null && startTime != null) {
          const duration = formatDuration(completed - startTime);
          blocks.push(
            `[A] ${created} → ${formatTime(completed)} (${duration})\n${msg.contentText || "(empty)"}`,
          );
        } else if (completed != null) {
          blocks.push(
            `[A] ${created} → ${formatTime(completed)}\n${msg.contentText || "(empty)"}`,
          );
        } else if (msg.finish === "error") {
          blocks.push(`[A] ${created} → 処理に失敗しました`);
        } else {
          blocks.push(`[A] ${created} → 処理中...`);
        }
      }
    }

    const lastMsg = allMessages[allMessages.length - 1];
    const lastVisible = visible[visible.length - 1];
    if (
      lastMsg &&
      lastMsg.role === "user" &&
      lastMsg.id !== lastVisible?.id
    ) {
      blocks.push(
        `[A] ${formatTime(lastMsg.time?.created)} → 処理中...`,
      );
    }

    this.chatText = blocks.join("\n\n");
  }

  private wrapLine(text: string, maxWidth: number): string[] {
    if (!text) return [""];
    const result: string[] = [];
    let currentLine = "";
    let currentWidth = 0;

    const isHalfWidthAlphaSym = (char: string) => {
      return char >= "\u0021" && char <= "\u007e";
    };

    for (const char of text) {
      const w = this.getCharWidth(char);
      if (currentWidth + w > maxWidth + 0.01) {
        let splitPos = currentLine.length;

        if (
          currentLine.length > 0 &&
          isHalfWidthAlphaSym(currentLine[currentLine.length - 1]) &&
          isHalfWidthAlphaSym(char)
        ) {
          for (let j = currentLine.length - 1; j >= 0; j--) {
            if (!isHalfWidthAlphaSym(currentLine[j])) {
              splitPos = j + 1;
              break;
            }
          }
        }

        if (splitPos > 0 && splitPos < currentLine.length) {
          const finishedLine = currentLine.substring(0, splitPos);
          const remaining = currentLine.substring(splitPos);
          result.push(finishedLine.replace(/ +$/, ""));
          currentLine = remaining + char;
          currentWidth = 0;
          for (const c of currentLine) {
            currentWidth += this.getCharWidth(c);
          }
        } else {
          result.push(currentLine.replace(/ +$/, ""));
          if (char === " ") {
            currentLine = "";
            currentWidth = 0;
          } else {
            currentLine = char;
            currentWidth = w;
          }
        }
      } else {
        currentLine += char;
        currentWidth += w;
      }
    }

    if (currentLine) {
      const finalLine = currentLine.replace(/ +$/, "");
      if (finalLine) {
        result.push(finalLine);
      }
    }
    return result.length > 0 ? result : [""];
  }

  private buildWrappedLines(): void {
    const lines = this.chatText.split("\n");
    this.wrappedLines = [];
    for (const line of lines) {
      const visualParts = this.wrapLine(line || " ", CHAT_MAX_WIDTH);
      this.wrappedLines.push(...visualParts);
    }
  }

  public render(): PageRenderResult {
    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "chat_header",
      content: this.buildHeaderLine(
        this.currentPath || "Chat",
        "",
        CHAT_MAX_WIDTH,
        `[${this.modelName}]`,
      ),
      xPosition: 4,
      yPosition: 2,
      width: 572,
      height: 28,
      borderWidth: 0,
      isEventCapture: 0,
    });

    let bodyContent: string;
    if (this.voiceTestMode === "long_press") {
      bodyContent = "VOICE TEST\n\n>>> LONG PRESS <<<\n\nHold...";
    } else if (this.voiceTestMode === "released") {
      bodyContent = "VOICE TEST\n\n>>> RELEASE <<<\n\nReleased!";
    } else {
      const totalLines = this.wrappedLines.length;
      const viewStart = totalLines > 0 ? this.scrollLine + 1 : 0;
      const viewEnd = Math.min(this.scrollLine + CHAT_MAX_LINES, totalLines);
      const pageIndicator =
        totalLines > 0 ? `[${viewStart}-${viewEnd}/${totalLines}]` : "[0/0]";
      headerProp.content = this.buildHeaderLine(
        this.currentPath || "Chat",
        pageIndicator,
        CHAT_MAX_WIDTH,
        `[${this.modelName}]`,
      );

      const end = Math.min(this.scrollLine + CHAT_MAX_LINES, this.wrappedLines.length);
      const visibleLines = this.wrappedLines.slice(this.scrollLine, end);
      bodyContent = visibleLines.length > 0 ? visibleLines.join("\n") : "  (No messages yet)";
    }

    const bodyProp = new TextContainerProperty({
      containerID: 2,
      containerName: "chat_body",
      content: bodyContent,
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
    if (this.scrollLine < this.wrappedLines.length - CHAT_MAX_LINES) {
      this.scrollLine = Math.min(this.scrollLine + SCROLL_STEP, this.wrappedLines.length - CHAT_MAX_LINES);
      await this.renderPage();
    }
  }

  public async onScrollDown() {
    if (this.scrollLine > 0) {
      this.scrollLine = Math.max(this.scrollLine - SCROLL_STEP, 0);
      await this.renderPage();
    }
  }

  public async onClick() {
    // Future: message selection
  }

  public async onDoubleClick() {
    await this.onReturnToList();
  }

  public async onLongPress() {
    this.voiceTestMode = "long_press";
    await this.renderPage();
  }

  public async onLongPressRelease() {
    this.voiceTestMode = "released";
    await this.renderPage();
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
        this.buildChatText();
        this.buildWrappedLines();
        this.scrollLine = Math.min(
          this.scrollLine,
          Math.max(0, this.wrappedLines.length - CHAT_MAX_LINES),
        );
        await this.renderPage();
        break;
    }
  }
}
