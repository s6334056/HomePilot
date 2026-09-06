import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeMessageWithParts } from "../message-mapper";
import { AgentContext } from "../../../domain/types";
import { ExplorerPage } from "../../pages/explorer-page";
import { FileViewerPage } from "../../pages/file-viewer-page";

const CHAT_MAX_LINES = 9;
const CHAT_MAX_WIDTH = 56;
const SCROLL_STEP = 8;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateTime(ts?: number): string {
  if (!ts) return "??:??";
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayName = DAY_NAMES[d.getDay()];
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day}(${dayName})${h}:${m}`;
}

function formatTimeOnly(ts?: number): string {
  if (!ts) return "??:??";
  const d = new Date(ts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (remM > 0 && rem > 0) return `${h}h${remM}m${rem}s`;
  if (remM > 0) return `${h}h${remM}m`;
  if (rem > 0) return `${h}h${rem}s`;
  return `${h}h`;
}

function stripHomePilotContext(text: string): string {
  return text.replace(/\[HomePilot Context\][\s\S]*?\[\/HomePilot Context\]\n\n?/g, "").trimEnd();
}

export class AgentChatPage extends BasePage {
  private controller: G2AgentController;
  private onReturnToList: () => Promise<void>;
  private onReturnToExplorer: () => Promise<void>;
  private currentPath: string;
  private returnPage: BasePage | null;
  private messages: OpenCodeMessageWithParts[] = [];
  private chatText: string = "";
  private wrappedLines: string[] = [];
  private scrollLine: number = 0;
  private modelName: string = "Agent";
  private stateUnsubscribe: (() => void) | null = null;
  private scrollInverted: boolean = false;
  private scrollToBottomAfterSend: boolean = false;

  constructor(
    controller: G2AgentController,
    onReturnToList: () => Promise<void>,
    onReturnToExplorer: () => Promise<void>,
    currentPath: string = "",
    returnPage: BasePage | null = null,
  ) {
    super();
    this.pageType = "AgentChatPage";
    this.controller = controller;
    this.onReturnToList = onReturnToList;
    this.onReturnToExplorer = onReturnToExplorer;
    this.currentPath = currentPath;
    this.returnPage = returnPage;
  }

  public async afterRender(): Promise<void> {
    const state = this.controller.getState();
    this.messages = state.messages;
    this.modelName = await this.resolveModelName();
    this.buildChatText();
    this.buildWrappedLines();
    this.scrollLine = Math.max(0, this.wrappedLines.length - CHAT_MAX_LINES);

    this.stateUnsubscribe = this.controller.subscribe((state) => {
      if (this.isActive) {
        this.messages = state.messages;
        this.buildChatText();
        this.buildWrappedLines();
        if (this.scrollToBottomAfterSend) {
          this.scrollToBottomAfterSend = false;
          this.scrollLine = Math.max(0, this.wrappedLines.length - CHAT_MAX_LINES);
        }
        this.renderPage();
      }
    });

    await this.renderPage();
  }

  public onDeactivate() {
    super.onDeactivate();
    if (this.stateUnsubscribe) {
      this.stateUnsubscribe();
      this.stateUnsubscribe = null;
    }
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
      const created = formatDateTime(msg.time?.created);

      if (msg.role === "user") {
        const displayText = stripHomePilotContext(msg.contentText || "(empty)");
        blocks.push(`[User] ${created}\n${displayText}`);
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
            `[Agent] ${created} → ${formatTimeOnly(completed)} (${duration})\n${msg.contentText || "(empty)"}`,
          );
        } else if (completed != null) {
          blocks.push(
            `[Agent] ${created} → ${formatTimeOnly(completed)}\n${msg.contentText || "(empty)"}`,
          );
        } else if (msg.finish === "error") {
          blocks.push(`[Agent] ${created} → 処理に失敗しました`);
        } else {
          blocks.push(`[Agent] ${created} → 処理中...`);
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
        `[Agent] ${formatDateTime(lastMsg.time?.created)} → 処理中...`,
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
    const voiceState = this.controller.getState().voiceState;

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "chat_header",
      content: voiceState !== 'idle'
        ? "[Voice Input]"
        : this.buildHeaderLine(
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

    if (voiceState === 'ready') {
      bodyContent = "VOICE INPUT\n\nListening...";
    } else if (voiceState === 'transcribing') {
      bodyContent = "VOICE INPUT\n\nTranscribing...";
    } else if (voiceState === 'confirmation') {
      const transcript = this.controller.getState().transcript;
      const wrappedTranscript = this.wrapLine(transcript, CHAT_MAX_WIDTH).join("\n");
      bodyContent = `VOICE INPUT\n\n${wrappedTranscript}\n\nTap: Send\nDouble: Cancel`;
    } else {
      const totalLines = this.wrappedLines.length;
      const viewStart = totalLines > 0 ? this.scrollLine + 1 : 0;
      const viewEnd = Math.min(this.scrollLine + CHAT_MAX_LINES, totalLines);
      const scrollMode = this.scrollInverted ? 'k' : 's';
      const pageIndicator =
        totalLines > 0 ? `[${viewStart}-${viewEnd}/${totalLines}]${scrollMode}` : `[0/0]${scrollMode}`;
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
          { id: "explorer", title: "エクスプローラ画面へ" },
          { id: "refresh", title: "更新" },
          { id: "top", title: "先頭へ" },
          { id: "bottom", title: "末尾へ" },
          { id: "scrollInvert", title: "スクロール操作反転" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.scrollInverted) {
      if (this.scrollLine > 0) {
        this.scrollLine = Math.max(this.scrollLine - SCROLL_STEP, 0);
        await this.renderPage();
      }
    } else {
      if (this.scrollLine < this.wrappedLines.length - CHAT_MAX_LINES) {
        this.scrollLine = Math.min(this.scrollLine + SCROLL_STEP, this.wrappedLines.length - CHAT_MAX_LINES);
        await this.renderPage();
      }
    }
  }

  public async onScrollDown() {
    if (this.scrollInverted) {
      if (this.scrollLine < this.wrappedLines.length - CHAT_MAX_LINES) {
        this.scrollLine = Math.min(this.scrollLine + SCROLL_STEP, this.wrappedLines.length - CHAT_MAX_LINES);
        await this.renderPage();
      }
    } else {
      if (this.scrollLine > 0) {
        this.scrollLine = Math.max(this.scrollLine - SCROLL_STEP, 0);
        await this.renderPage();
      }
    }
  }

  private buildLiveContext(): AgentContext {
    const returnPage = this.returnPage;
    if (!returnPage) {
      return {
        currentPath: this.currentPath,
        selectedItem: null,
        selectedFile: null,
        sourceScreen: 'agent',
        timestamp: new Date().toISOString(),
      };
    }

    if (returnPage.pageType === 'ExplorerPage') {
      const explorer = returnPage as ExplorerPage;
      return {
        currentPath: explorer.getCurrentPath(),
        selectedItem: explorer.getSelectedItem(),
        selectedFile: null,
        sourceScreen: 'explorer',
        timestamp: new Date().toISOString(),
      };
    }

    if (returnPage.pageType === 'FileViewerPage') {
      const viewer = returnPage as FileViewerPage;
      return {
        currentPath: viewer.getCurrentPath(),
        selectedItem: viewer.getFile(),
        selectedFile: viewer.getFile(),
        content: viewer.getContent(),
        sourceScreen: 'file_viewer',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      currentPath: this.currentPath,
      selectedItem: null,
      selectedFile: null,
      sourceScreen: 'agent',
      timestamp: new Date().toISOString(),
    };
  }

  public async onClick() {
    const voiceState = this.controller.getState().voiceState;
    if (voiceState === 'confirmation') {
      const transcript = this.controller.getState().transcript;
      if (transcript) {
        const context = this.buildLiveContext();
        this.controller.setVoiceState('idle');
        this.scrollToBottomAfterSend = true;
        await this.controller.sendMessage(transcript, context);
      }
    }
  }

  public async onDoubleClick() {
    const voiceState = this.controller.getState().voiceState;
    if (voiceState === 'transcribing' || voiceState === 'confirmation') {
      this.controller.cancelVoiceInput();
      return;
    }
    if (voiceState === 'idle') {
      await this.onReturnToList();
    }
  }

  public async onLongPress() {
    await this.controller.startVoiceInput();
  }

  public async onLongPressRelease() {
    await this.controller.stopVoiceInput();
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "explorer":
        await this.onReturnToExplorer();
        break;
      case "refresh":
        await this.controller.refreshMessages();
        const state = this.controller.getState();
        this.messages = state.messages;
        this.buildChatText();
        this.buildWrappedLines();
        this.scrollLine = Math.max(0, this.wrappedLines.length - CHAT_MAX_LINES);
        await this.renderPage();
        break;
      case "top":
        this.scrollLine = 0;
        await this.renderPage();
        break;
      case "bottom":
        this.scrollLine = Math.max(0, this.wrappedLines.length - CHAT_MAX_LINES);
        await this.renderPage();
        break;
      case "scrollInvert":
        this.scrollInverted = !this.scrollInverted;
        await this.renderPage();
        break;
    }
  }
}
