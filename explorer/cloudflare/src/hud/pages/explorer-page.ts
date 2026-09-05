import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { FileSystemItem } from "../../domain/types";
import { FileSystemService } from "../../services/FileSystemService";
import { FileViewerPage } from "./file-viewer-page";

export const G2_MAX_LIST_LINES = 9;
export const G2_MAX_LINE_WIDTH = 56;

export class ExplorerPage extends BasePage {
  private currentPath: string;
  private items: FileSystemItem[] = [];
  private selectedIndex: number = 0;
  private parentSelectedIndex?: number;
  private fileService: FileSystemService;
  private onStateChange?: (path: string, items: FileSystemItem[], selectedIndex: number) => void;
  private onFileViewerStateChange?: (file: FileSystemItem, content: string) => void;
  private onAgentSessionList?: () => Promise<void>;
  private initialRestoreIndex?: number;

  constructor(
    currentPath: string,
    fileService: FileSystemService,
    onStateChange?: (path: string, items: FileSystemItem[], selectedIndex: number) => void,
    onFileViewerStateChange?: (file: FileSystemItem, content: string) => void,
    initialRestoreIndex?: number,
    onAgentSessionList?: () => Promise<void>,
  ) {
    super();
    this.pageType = "ExplorerPage";
    this.currentPath = currentPath;
    this.fileService = fileService;
    this.onStateChange = onStateChange;
    this.onFileViewerStateChange = onFileViewerStateChange;
    this.initialRestoreIndex = initialRestoreIndex;
    this.onAgentSessionList = onAgentSessionList;
  }

  public getCurrentPath(): string {
    return this.currentPath;
  }

  public async afterRender(): Promise<void> {
    if (this.items.length === 0) {
      await this.loadDirectory(this.currentPath, this.initialRestoreIndex);
      this.initialRestoreIndex = undefined;
    } else {
      this.notifyState();
    }
  }

  public async loadDirectory(path: string, restoreIndex?: number) {
    try {
      this.notifyStatus(`Loading ${path}...`);
      this.currentPath = path;
      this.items = await this.fileService.getDirectory(path);
      this.selectedIndex = restoreIndex != null
        ? Math.max(0, Math.min(restoreIndex, this.items.length - 1))
        : 0;
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
    const pageIndicator = total > 0 ? `[${this.selectedIndex + 1}/${total}]` : "[0/0]";
    const headerContent = this.buildHeaderLine(this.currentPath, pageIndicator, G2_MAX_LINE_WIDTH, "[Explorer]");

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
        const icon = item.type === "directory" ? "[D] " : "[F] ";
        const overhead = this.getStringWidth(pointer) + this.getStringWidth(icon);
        const name = this.truncateName(item.name, G2_MAX_LINE_WIDTH - overhead);
        return `${pointer}${icon}${name}`;
      });

      bodyText = lines.join("\n");
    }

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "explorer_header",
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
      containerName: "explorer_body",
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
          { id: "refresh", title: "更新" },
          { id: "home", title: "ホーム" },
          { id: "parent", title: "親フォルダ" },
          { id: "info", title: "ファイル情報" },
          { id: "agent", title: "エージェント画面へ" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.items.length === 0) return;
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = this.items.length - 1;
    }
    await this.renderPage();
    this.notifyState();
  }

  public async onScrollDown() {
    if (this.items.length === 0) return;
    if (this.selectedIndex < this.items.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    await this.renderPage();
    this.notifyState();
  }

  public async onClick() {
    const item = this.items[this.selectedIndex];
    if (!item) return;

    if (item.type === "directory") {
      this.parentSelectedIndex = this.selectedIndex;
      await this.loadDirectory(item.path);
      await this.navigate(this);
    } else {
      // Navigate to File Viewer
      const viewerPage = new FileViewerPage(
        item,
        this.fileService,
        () => this.navigate(this),
        this.onFileViewerStateChange,
        this.onAgentSessionList,
      );
      await this.navigate(viewerPage);
    }
  }

  public async onDoubleClick() {
    const parentPath = this.fileService.getParentPath(this.currentPath);
    if (parentPath !== this.currentPath) {
      // Non-root: go to parent directory
      const restoreIndex = this.parentSelectedIndex;
      this.parentSelectedIndex = undefined;
      await this.loadDirectory(parentPath, restoreIndex);
      await this.navigate(this);
    } else if (this.onAgentSessionList) {
      // Root: navigate to Agent Session List
      await this.onAgentSessionList();
    }
  }

  public async onLongPress() {
    // G2-2: Long Press is reserved for future Voice Input
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
      case "agent":
        if (this.onAgentSessionList) {
          await this.onAgentSessionList();
        }
        break;
    }
  }
}
