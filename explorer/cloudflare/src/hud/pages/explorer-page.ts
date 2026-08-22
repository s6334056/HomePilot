import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { FileSystemItem, AgentContext } from "../../domain/types";
import { FileSystemService } from "../../services/FileSystemService";
import { AgentService } from "../../services/AgentService";
import { FileViewerPage } from "./file-viewer-page";
import { AgentPlaceholderPage } from "./agent-placeholder-page";

export const G2_MAX_LIST_LINES = 6;
export const G2_MAX_LINE_WIDTH = 26;

export class ExplorerPage extends BasePage {
  private currentPath: string;
  private items: FileSystemItem[] = [];
  private selectedIndex: number = 0;
  private fileService: FileSystemService;
  private agentService: AgentService;
  private onStateChange?: (path: string, items: FileSystemItem[], selectedIndex: number) => void;
  private onFileViewerStateChange?: (file: FileSystemItem, content: string) => void;
  private onAgentStateChange?: (context: AgentContext) => void;

  constructor(
    currentPath: string,
    fileService: FileSystemService,
    agentService: AgentService,
    onStateChange?: (path: string, items: FileSystemItem[], selectedIndex: number) => void,
    onFileViewerStateChange?: (file: FileSystemItem, content: string) => void,
    onAgentStateChange?: (context: AgentContext) => void
  ) {
    super();
    this.pageType = "ExplorerPage";
    this.currentPath = currentPath;
    this.fileService = fileService;
    this.agentService = agentService;
    this.onStateChange = onStateChange;
    this.onFileViewerStateChange = onFileViewerStateChange;
    this.onAgentStateChange = onAgentStateChange;
  }

  public async afterRender(): Promise<void> {
    if (this.items.length === 0) {
      await this.loadDirectory(this.currentPath);
    } else {
      this.notifyState();
    }
  }

  public async loadDirectory(path: string) {
    try {
      this.notifyStatus(`Loading ${path}...`);
      this.currentPath = path;
      this.items = await this.fileService.getDirectory(path);
      this.selectedIndex = 0;
      this.notifyStatus(`Loaded ${this.items.length} items`);
      // Push updated content to G2 glasses immediately after data is ready
      if (this.renderPage) {
        await this.renderPage();
      }
      this.notifyState();
    } catch (e: any) {
      this.notifyStatus(`Error: ${e.message}`);
    }
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange(this.currentPath, this.items, this.selectedIndex);
    }
  }

  public render(): PageRenderResult {
    const total = this.items.length;
    const headerPath = this.truncateName(this.currentPath, 20);
    const pageIndicator = total > 0 ? `[${this.selectedIndex + 1}/${total}]` : "[0/0]";

    let bodyText = "";

    if (total === 0) {
      bodyText = "  (Empty directory)\n  Double-tap: Back";
    } else {
      const selected = Math.max(0, Math.min(this.selectedIndex, total - 1));
      const halfWindow = Math.floor(G2_MAX_LIST_LINES / 2);
      let start = Math.max(0, selected - halfWindow);
      let end = start + G2_MAX_LIST_LINES;

      if (end > total) {
        end = total;
        start = Math.max(0, end - G2_MAX_LIST_LINES);
      }

      const visible = this.items.slice(start, end);
      const lines = visible.map((item, idx) => {
        const actualIdx = start + idx;
        const isFocused = actualIdx === selected;
        const pointer = isFocused ? "> " : "  ";
        const icon = item.type === "directory" ? "DIR " : "DOC ";
        const name = this.truncateName(item.name, G2_MAX_LINE_WIDTH - 8);
        return `${pointer}${icon}${name}`;
      });

      bodyText = lines.join("\n");
    }

    const fullContent = `${headerPath} ${pageIndicator}\n────────────────────────\n${bodyText}`;

    const textProp = new TextContainerProperty({
      containerID: 1,
      containerName: "explorer_body",
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
          { id: "refresh", title: "Refresh" },
          { id: "home", title: "Home" },
          { id: "parent", title: "Parent Dir" },
          { id: "info", title: "File Info" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      await this.renderPage();
      this.notifyState();
    }
  }

  public async onScrollDown() {
    if (this.selectedIndex < this.items.length - 1) {
      this.selectedIndex++;
      await this.renderPage();
      this.notifyState();
    }
  }

  public async onClick() {
    const item = this.items[this.selectedIndex];
    if (!item) return;

    if (item.type === "directory") {
      await this.loadDirectory(item.path);
      await this.navigate(this);
    } else {
      // Navigate to File Viewer
      const viewerPage = new FileViewerPage(
        item,
        this.currentPath,
        this.fileService,
        this.agentService,
        () => this.navigate(this),
        this.onFileViewerStateChange,
        this.onAgentStateChange
      );
      await this.navigate(viewerPage);
    }
  }

  public async onDoubleClick() {
    // Double tap = Go to parent directory
    const parentPath = this.fileService.getParentPath(this.currentPath);
    if (parentPath !== this.currentPath) {
      await this.loadDirectory(parentPath);
      await this.navigate(this);
    }
  }

  public async onLongPress() {
    // Long press = Launch Agent with current context
    const selectedItem = this.items[this.selectedIndex] || null;
    const context = this.agentService.open({
      path: this.currentPath,
      item: selectedItem,
      source: "explorer",
    });

    const agentPage = new AgentPlaceholderPage(context, () => this.navigate(this));
    await this.navigate(agentPage);
    if (this.onAgentStateChange) {
      this.onAgentStateChange(context);
    }
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "refresh":
        await this.loadDirectory(this.currentPath);
        await this.navigate(this);
        break;
      case "home":
        await this.loadDirectory(this.fileService.getRootPath());
        await this.navigate(this);
        break;
      case "parent":
        await this.onDoubleClick();
        break;
      case "info": {
        const item = this.items[this.selectedIndex];
        const info = item
          ? `${item.name} (${item.type === "directory" ? "Folder" : "File"})\nSize: ${item.size ?? "N/A"}`
          : `Dir: ${this.currentPath}`;
        this.notifyStatus(info);
        break;
      }
    }
  }
}
