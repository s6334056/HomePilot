import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeMessageWithParts } from "../message-mapper";
import { AgentContext, OpenCodeQuestionRequest } from "../../../domain/types";
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
  private agentCreatedCache: Map<string, number> = new Map();
  private questionSelectedIndex: number = 0;
  private questionMultipleSelected: Set<string> = new Set();
  private customSources: Set<string> = new Set();

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
    this.questionSelectedIndex = 0;

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
    let prevCompleted: number | undefined;

    for (let i = 0; i < visible.length; i++) {
      const msg = visible[i];
      const created = formatDateTime(msg.time?.created);

      if (msg.role === "user") {
        const displayText = stripHomePilotContext(msg.contentText || "").trim();
        if (!displayText) continue;
        blocks.push(`[User] ${created}\n${displayText}`);
        prevCompleted = undefined;
      } else {
        const displayText = (msg.contentText || "").trim();
        const completed = msg.time?.completed;

        // Cache the first created time so Thinking updates don't shift the start time
        if (!this.agentCreatedCache.has(msg.id) && msg.time?.created != null) {
          this.agentCreatedCache.set(msg.id, msg.time.created);
        }
        const fixedCreated = this.agentCreatedCache.get(msg.id) ?? msg.time?.created;
        const fixedCreatedStr = formatDateTime(fixedCreated);

        if (completed != null) {
          this.agentCreatedCache.delete(msg.id);
          if (!displayText) continue;
          const startTime = prevCompleted ?? fixedCreated;
          if (startTime != null) {
            const duration = formatDuration(completed - startTime);
            blocks.push(
              `[Agent] ${fixedCreatedStr} → ${formatTimeOnly(completed)} (${duration})\n${displayText}`,
            );
          } else {
            blocks.push(
              `[Agent] ${fixedCreatedStr} → ${formatTimeOnly(completed)}\n${displayText}`,
            );
          }
          prevCompleted = completed;
        } else if (msg.finish === "error") {
          this.agentCreatedCache.delete(msg.id);
          blocks.push(`[Agent] ${fixedCreatedStr} → 処理に失敗しました`);
          prevCompleted = undefined;
        } else {
          blocks.push(`[Agent] ${fixedCreatedStr} → 処理中...`);
          prevCompleted = undefined;
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

  private truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    if (maxChars <= 3) return text.substring(0, maxChars);
    return text.substring(0, maxChars - 3) + "...";
  }

  private buildQuestionBody(q: OpenCodeQuestionRequest): string {
    const MAX_LINES = CHAT_MAX_LINES;
    const GUIDE_LINES = 1;
    const OPTION_LINES = 1;
    const DESC_LINES = 2;
    const isMultiple = q.multiple === true;
    const OPTION_COUNT = q.options?.length ?? 0;
    const CUSTOM_COUNT = this.questionMultipleSelected.size;
    const ALL_ITEM_COUNT = OPTION_COUNT + CUSTOM_COUNT;
    const TOTAL_ITEMS = isMultiple ? ALL_ITEM_COUNT + 1 : ALL_ITEM_COUNT;

    const guideAndGap = GUIDE_LINES + 1;
    const optionsTotal = TOTAL_ITEMS * OPTION_LINES;
    const descBudget = Math.max(0, MAX_LINES - guideAndGap - optionsTotal);
    const headerLines = q.header ? 1 : 0;
    const gapAfterHeader = q.header ? 1 : 0;
    const questionBudget = Math.max(1, MAX_LINES - guideAndGap - optionsTotal - headerLines - gapAfterHeader - 1);

    const lines: string[] = [];
    let lineCount = 0;

    if (q.header) {
      const maxW = CHAT_MAX_WIDTH - 2;
      lines.push(`[${this.truncateText(q.header, maxW)}]`);
      lines.push("");
      lineCount += 2;
    }

    if (q.question) {
      const qLines = this.wrapLine(q.question, CHAT_MAX_WIDTH);
      const take = Math.min(qLines.length, questionBudget);
      for (let i = 0; i < take; i++) {
        if (i === take - 1 && qLines.length > questionBudget) {
          lines.push(this.truncateText(qLines[i], CHAT_MAX_WIDTH - 3) + "...");
        } else {
          lines.push(qLines[i]);
        }
        lineCount++;
      }
      lines.push("");
      lineCount++;
    }

    if (q.options && q.options.length > 0) {
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const isFocused = i === this.questionSelectedIndex;

        if (isMultiple) {
          const checked = this.questionMultipleSelected.has(opt.label);
          const checkMark = checked ? '☑' : '☐';
          const focusMark = isFocused ? '>' : ' ';
          const prefix = `${focusMark}${checkMark} `;
          const labelMax = CHAT_MAX_WIDTH - prefix.length;
          lines.push(`${prefix}${this.truncateText(opt.label, labelMax)}`);
        } else {
          const prefix = isFocused ? "> " : "  ";
          const labelMax = CHAT_MAX_WIDTH - prefix.length;
          lines.push(`${prefix}${this.truncateText(opt.label, labelMax)}`);
        }
        lineCount++;

        if (isFocused && opt.description && descBudget > 0) {
          const dLines = this.wrapLine(opt.description, CHAT_MAX_WIDTH - 2);
          const dTake = Math.min(dLines.length, Math.min(DESC_LINES, descBudget));
          for (let d = 0; d < dTake; d++) {
            if (d === dTake - 1 && dLines.length > dTake) {
              lines.push(`  ${this.truncateText(dLines[d], CHAT_MAX_WIDTH - 5)}...`);
            } else {
              lines.push(`  ${dLines[d]}`);
            }
            lineCount++;
          }
        }
      }
    }

    if (isMultiple) {
      for (const customText of this.questionMultipleSelected) {
        if (this.customSources.has(customText)) {
          const isFocused = this.questionSelectedIndex === OPTION_COUNT + [...this.questionMultipleSelected].indexOf(customText);
          const checked = true;
          const checkMark = checked ? '☑' : '☐';
          const focusMark = isFocused ? '>' : ' ';
          const prefix = `${focusMark}${checkMark} `;
          const labelMax = CHAT_MAX_WIDTH - prefix.length;
          lines.push(`${prefix}${this.truncateText(customText, labelMax)}`);
          lineCount++;
        }
      }

      const confirmIndex = ALL_ITEM_COUNT;
      const isConfirmFocused = this.questionSelectedIndex === confirmIndex;
      const confirmPrefix = isConfirmFocused ? "> " : "  ";
      lines.push(`${confirmPrefix}[回答する]`);
      lineCount++;
    }

    while (lineCount < MAX_LINES - GUIDE_LINES) {
      lines.push("");
      lineCount++;
    }

    lines.push("Tap: Select  Double: Skip");

    return lines.join("\n");
  }

  public render(): PageRenderResult {
    const state = this.controller.getState();
    const voiceState = state.voiceState;
    const pendingQuestions = state.pendingQuestions;
    const qvConfirm = state.questionVoiceConfirm;
    const isQuestionMode = pendingQuestions.length > 0 && voiceState === 'idle';
    const isQuestionVoice = pendingQuestions.length > 0 && qvConfirm && voiceState !== 'idle';

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "chat_header",
      content: (isQuestionMode || isQuestionVoice)
        ? this.buildHeaderLine(
            this.currentPath || "Chat",
            "",
            CHAT_MAX_WIDTH,
            "[Question]",
          )
        : voiceState !== 'idle'
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

    if (isQuestionMode) {
      bodyContent = this.buildQuestionBody(pendingQuestions[0]);
    } else if (isQuestionVoice && voiceState === 'ready') {
      bodyContent = "VOICE INPUT\n\nListening...";
    } else if (isQuestionVoice && voiceState === 'transcribing') {
      bodyContent = "VOICE INPUT\n\nTranscribing...";
    } else if (isQuestionVoice && voiceState === 'confirmation') {
      const transcript = this.controller.getState().transcript;
      const wrappedTranscript = this.wrapLine(transcript, CHAT_MAX_WIDTH).join("\n");
      bodyContent = `回答内容を確認\n\n${wrappedTranscript}\n\nTap: Send\nDouble: Cancel`;
    } else if (voiceState === 'ready') {
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

  private isQuestionMode(): boolean {
    const state = this.controller.getState();
    return state.pendingQuestions.length > 0 && state.voiceState === 'idle';
  }

  private isQuestionVoiceActive(): boolean {
    const state = this.controller.getState();
    return state.pendingQuestions.length > 0 && state.questionVoiceConfirm && state.voiceState !== 'idle';
  }

  private isMultipleQuestion(): boolean {
    const q = this.controller.getState().pendingQuestions[0];
    return !!q && q.multiple === true;
  }

  public async onScrollUp() {
    if (this.isQuestionVoiceActive()) return;
    if (this.isQuestionMode()) {
      const q = this.controller.getState().pendingQuestions[0];
      const optionCount = q.options?.length ?? 0;
      if (optionCount > 0 && this.questionSelectedIndex > 0) {
        this.questionSelectedIndex--;
        await this.renderPage();
      }
      return;
    }
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
    if (this.isQuestionVoiceActive()) return;
    if (this.isQuestionMode()) {
      const q = this.controller.getState().pendingQuestions[0];
      const optionCount = q.options?.length ?? 0;
      const maxIndex = q.multiple
        ? optionCount + this.questionMultipleSelected.size
        : optionCount - 1;
      if (optionCount > 0 && this.questionSelectedIndex < maxIndex) {
        this.questionSelectedIndex++;
        await this.renderPage();
      }
      return;
    }
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

  private async answerQuestion(answer: string | string[]): Promise<void> {
    const pendingQuestions = this.controller.getState().pendingQuestions;
    if (pendingQuestions.length === 0) return;
    const q = pendingQuestions[0];
    this.questionSelectedIndex = 0;
    this.questionMultipleSelected = new Set();
    this.customSources = new Set();
    await this.controller.respondQuestion(q.id, answer);
  }

  private buildMultipleAnswer(): string[] {
    const q = this.controller.getState().pendingQuestions[0];
    if (!q) return [];
    const optionLabels = (q.options ?? []).map((o) => o.label);
    const selectedOptions = [...this.questionMultipleSelected].filter((t) => !this.customSources.has(t));
    const customTexts = [...this.questionMultipleSelected].filter((t) => this.customSources.has(t));
    const answer: string[] = [];
    for (const item of selectedOptions) {
      if (optionLabels.includes(item)) answer.push(item);
    }
    for (const item of customTexts) {
      answer.push(item);
    }
    return answer;
  }

  public async onClick() {
    if (this.isQuestionVoiceActive()) {
      const state = this.controller.getState();
      if (state.voiceState === 'confirmation') {
        const transcript = await this.controller.confirmQuestionVoice();
        if (transcript) {
          this.questionMultipleSelected.add(transcript);
          this.customSources.add(transcript);
          await this.renderPage();
        }
      }
      return;
    }

    if (this.isQuestionMode()) {
      const q = this.controller.getState().pendingQuestions[0];
      const optionCount = q.options?.length ?? 0;

      if (q.multiple) {
        const allItems = optionCount + this.questionMultipleSelected.size;
        const confirmIndex = allItems;

        if (this.questionSelectedIndex === confirmIndex) {
          const answer = this.buildMultipleAnswer();
          await this.answerQuestion(answer);
        } else if (this.questionSelectedIndex < optionCount) {
          const label = q.options![this.questionSelectedIndex].label;
          const next = new Set(this.questionMultipleSelected);
          if (next.has(label)) {
            next.delete(label);
          } else {
            next.add(label);
          }
          this.questionMultipleSelected = next;
          await this.renderPage();
        } else {
          const customList = [...this.questionMultipleSelected].filter((t) => this.customSources.has(t));
          const customIdx = this.questionSelectedIndex - optionCount;
          const text = customList[customIdx];
          if (text) {
            const next = new Set(this.questionMultipleSelected);
            if (next.has(text)) {
              next.delete(text);
              this.customSources.delete(text);
            } else {
              next.add(text);
            }
            this.questionMultipleSelected = next;
            await this.renderPage();
          }
        }
      } else {
        if (q.options && q.options.length > 0) {
          const selected = q.options[this.questionSelectedIndex];
          if (selected) {
            await this.answerQuestion(selected.label);
          }
        }
      }
      return;
    }

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
    if (this.isQuestionVoiceActive()) {
      this.controller.cancelVoiceInput();
      return;
    }

    if (this.isQuestionMode()) {
      await this.answerQuestion('');
      return;
    }

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
    const state = this.controller.getState();
    if (state.pendingQuestions.length > 0 && state.voiceState === 'idle') {
      const q = state.pendingQuestions[0];
      if (q.custom !== false) {
        await this.controller.startQuestionVoiceInput();
        return;
      }
    }
    await this.controller.startVoiceInput();
  }

  public async onLongPressRelease() {
    const state = this.controller.getState();
    if (state.questionVoiceConfirm && state.voiceState === 'ready') {
      await this.controller.stopQuestionVoiceInput();
      return;
    }
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
