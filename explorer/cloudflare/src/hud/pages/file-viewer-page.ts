import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { FileSystemItem } from "../../domain/types";
import { FileSystemService } from "../../services/FileSystemService";

export const G2_VIEWER_LINES = 9;
export const G2_VIEWER_MAX_WIDTH = 56;

interface WrappedLine {
  text: string;
  logicalLineIndex: number;
  isFirstOfLogical: boolean;
}

export class FileViewerPage extends BasePage {
  private file: FileSystemItem;
  private fileService: FileSystemService;
  private onBackToExplorer: () => Promise<boolean>;
  private onStateChange?: (file: FileSystemItem, content: string) => void;
  private onAgentSessionList?: () => Promise<void>;
  private content: string = "";
  private lines: string[] = [];
  private wrappedLines: WrappedLine[] = [];
  private scrollPosition: number = 0;

  constructor(
    file: FileSystemItem,
    fileService: FileSystemService,
    onBackToExplorer: () => Promise<boolean>,
    onStateChange?: (file: FileSystemItem, content: string) => void,
    onAgentSessionList?: () => Promise<void>,
  ) {
    super();
    this.pageType = "FileViewerPage";
    this.file = file;
    this.fileService = fileService;
    this.onBackToExplorer = onBackToExplorer;
    this.onStateChange = onStateChange;
    this.onAgentSessionList = onAgentSessionList;
  }

  public getCurrentPath(): string {
    return this.file.path;
  }

  public async afterRender(): Promise<void> {
    if (this.lines.length === 0) {
      await this.loadFileContent();
    } else {
      this.notifyState();
    }
  }

  private async loadFileContent() {
    try {
      this.notifyStatus(`Reading ${this.file.name}...`);
      this.content = await this.fileService.readFile(this.file.path);
      this.lines = this.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      this.scrollPosition = 0;
      this.buildWrappedLines();
      this.notifyStatus(`Loaded ${this.lines.length} lines`);
      if (this.renderPage) {
        await this.renderPage();
      }
      this.notifyState();
    } catch (e: any) {
      this.content = `Error reading file: ${e.message}`;
      this.lines = [this.content];
      this.scrollPosition = 0;
      this.buildWrappedLines();
      if (this.renderPage) {
        await this.renderPage();
      }
      this.notifyState();
    }
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange(this.file, this.content);
    }
  }

  /**
   * Wrap a single text line to fit within maxWidth using getCharWidth() for
   * proportional character width calculation. Tries to break at word boundaries
   * (half-width alphanumeric/symbol sequences) to avoid splitting words.
   */
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

  /**
   * Convert logical lines to visual lines with wrapping.
   * Each WrappedLine knows which logical line it belongs to and whether it is
   * the first visual line of that logical line (for line number display).
   */
  private buildWrappedLines(): void {
    this.wrappedLines = [];
    for (let i = 0; i < this.lines.length; i++) {
      const visualParts = this.wrapLine(this.lines[i] || " ", G2_VIEWER_MAX_WIDTH);
      for (let j = 0; j < visualParts.length; j++) {
        this.wrappedLines.push({
          text: visualParts[j],
          logicalLineIndex: i,
          isFirstOfLogical: j === 0,
        });
      }
    }
  }

  /**
   * Get the range of logical line numbers visible on the current screen.
   * Returns 1-indexed values for display.
   */
  private getVisibleLogicalRange(): { min: number; max: number; total: number } {
    const end = Math.min(this.scrollPosition + G2_VIEWER_LINES, this.wrappedLines.length);
    const minLogical = this.wrappedLines.length > 0
      ? this.wrappedLines[this.scrollPosition].logicalLineIndex + 1
      : 1;
    const maxLogical = this.wrappedLines.length > 0
      ? this.wrappedLines[end - 1].logicalLineIndex + 1
      : 1;
    return { min: minLogical, max: maxLogical, total: this.lines.length };
  }

  public render(): PageRenderResult {
    const range = this.getVisibleLogicalRange();
    const pageIndicator = `[L${range.min}-${range.max}/${range.total}]`;
    const headerContent = this.buildHeaderLine(this.file.name, pageIndicator, G2_VIEWER_MAX_WIDTH);

    const end = Math.min(this.scrollPosition + G2_VIEWER_LINES, this.wrappedLines.length);
    const visibleLines = this.wrappedLines.slice(this.scrollPosition, end);
    const bodyText = visibleLines.map((wl) => wl.text).join("\n");

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
          { id: "back", title: "戻る" },
          { id: "agent", title: "エージェント画面へ" },
          { id: "top", title: "先頭へ" },
          { id: "bottom", title: "末尾へ" },
        ],
      },
    };
  }

  /**
   * Scroll up by one visual line.
   */
  public async onScrollUp() {
    if (this.scrollPosition > 0) {
      this.scrollPosition--;
      if (this.renderPage) await this.renderPage();
    }
  }

  /**
   * Scroll down by one visual line.
   */
  public async onScrollDown() {
    if (this.scrollPosition < this.wrappedLines.length - G2_VIEWER_LINES) {
      this.scrollPosition++;
      if (this.renderPage) await this.renderPage();
    }
  }

  public async onDoubleClick() {
    await this.onBackToExplorer();
  }

  public async onLongPress() {
    // G2-2: Long Press is reserved for future Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "back":
        await this.onDoubleClick();
        break;
      case "agent":
        if (this.onAgentSessionList) {
          await this.onAgentSessionList();
        }
        break;
      case "top":
        this.scrollPosition = 0;
        if (this.renderPage) await this.renderPage();
        break;
      case "bottom":
        this.scrollPosition = Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES);
        if (this.renderPage) await this.renderPage();
        break;
    }
  }
}
