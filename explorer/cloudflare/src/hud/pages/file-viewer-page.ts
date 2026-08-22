import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { FileSystemItem } from "../../domain/types";
import { FileSystemService } from "../../services/FileSystemService";
import { AgentService } from "../../services/AgentService";
import { AgentPlaceholderPage } from "./agent-placeholder-page";

export const G2_VIEWER_LINES = 6;
export const G2_VIEWER_MAX_WIDTH = 26;

export class FileViewerPage extends BasePage {
  private file: FileSystemItem;
  private parentPath: string;
  private fileService: FileSystemService;
  private agentService: AgentService;
  private onBackToExplorer: () => Promise<boolean>;
  private onStateChange?: (file: FileSystemItem, content: string) => void;
  private content: string = "";
  private lines: string[] = [];
  private scrollLine: number = 0;

  constructor(
    file: FileSystemItem,
    parentPath: string,
    fileService: FileSystemService,
    agentService: AgentService,
    onBackToExplorer: () => Promise<boolean>,
    onStateChange?: (file: FileSystemItem, content: string) => void
  ) {
    super();
    this.pageType = "FileViewerPage";
    this.file = file;
    this.parentPath = parentPath;
    this.fileService = fileService;
    this.agentService = agentService;
    this.onBackToExplorer = onBackToExplorer;
    this.onStateChange = onStateChange;
  }

  public async afterRender(): Promise<void> {
    if (this.lines.length === 0) {
      await this.loadFileContent();
    }
  }

  private async loadFileContent() {
    try {
      this.notifyStatus(`Reading ${this.file.name}...`);
      this.content = await this.fileService.readFile(this.file.path);
      this.lines = this.content.split("\n");
      this.scrollLine = 0;
      this.notifyStatus(`Loaded ${this.lines.length} lines`);
      // Push updated content to G2 glasses immediately after data is ready
      if (this.renderPage) {
        await this.renderPage();
      }
      this.notifyState();
    } catch (e: any) {
      this.content = `Error reading file: ${e.message}`;
      this.lines = [this.content];
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

  public render(): PageRenderResult {
    const totalLines = this.lines.length;
    const headerTitle = this.truncateName(this.file.name, 18);
    const pageIndicator = `[L${this.scrollLine + 1}-${Math.min(this.scrollLine + G2_VIEWER_LINES, totalLines)}/${totalLines}]`;

    const visibleLines = this.lines.slice(this.scrollLine, this.scrollLine + G2_VIEWER_LINES);
    const formattedLines = visibleLines.map((line, idx) => {
      const lineNum = String(this.scrollLine + idx + 1).padStart(2, " ");
      const text = this.truncateName(line || " ", G2_VIEWER_MAX_WIDTH - 4);
      return `${lineNum}| ${text}`;
    });

    const bodyText = formattedLines.join("\n");
    const fullContent = `${headerTitle} ${pageIndicator}\n────────────────────────\n${bodyText}`;

    const textProp = new TextContainerProperty({
      containerID: 1,
      containerName: "file_viewer_body",
      content: fullContent,
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      isEventCapture: 1,
    });

    return {
      containerTotalNum: 1,
      textObject: [textProp],
      menuObject: {
        menuList: [
          { id: "back", title: "Back to Explorer" },
          { id: "agent", title: "Ask Agent" },
          { id: "top", title: "Scroll to Top" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.scrollLine > 0) {
      this.scrollLine = Math.max(0, this.scrollLine - 2);
      if (this.renderPage) await this.renderPage();
    }
  }

  public async onScrollDown() {
    if (this.scrollLine < this.lines.length - 1) {
      this.scrollLine = Math.min(this.lines.length - 1, this.scrollLine + 2);
      if (this.renderPage) await this.renderPage();
    }
  }

  public async onDoubleClick() {
    // Double tap = Return to Explorer
    await this.onBackToExplorer();
  }

  public async onLongPress() {
    // Long press = Launch Agent with file context
    const context = this.agentService.open({
      path: this.parentPath,
      selectedFile: this.file,
      content: this.content,
      source: "file_viewer",
    });

    const agentPage = new AgentPlaceholderPage(context, () => this.navigate(this));
    await this.navigate(agentPage);
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "back":
        await this.onDoubleClick();
        break;
      case "agent":
        await this.onLongPress();
        break;
      case "top":
        this.scrollLine = 0;
        if (this.renderPage) await this.renderPage();
        break;
    }
  }
}
