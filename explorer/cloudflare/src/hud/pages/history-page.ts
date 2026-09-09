import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { FileViewHistoryEntry } from "../../domain/types";
import { GatewayFileSystemService } from "../../services/GatewayFileSystemService";
import { FileSystemService } from "../../services/FileSystemService";
import { FileViewerPage } from "./file-viewer-page";
import { getG2History, removeG2FromHistory } from "../services/g2-viewer-history-store";

export const G2_HISTORY_MAX_LINES = 9;
export const G2_HISTORY_MAX_WIDTH = 56;

interface HistoryItem {
  path: string;
  name: string;
  lastViewedAt: number;
}

export class HistoryPage extends BasePage {
  private gatewayService: GatewayFileSystemService;
  private fileService: FileSystemService;
  private items: HistoryItem[] = [];
  private selectedIndex: number = 0;
  private onStateChange?: (items: HistoryItem[], selectedIndex: number) => void;
  private onFileViewerStateChange?: (file: any, content: string) => void;
  private onAgentSessionList?: () => Promise<void>;
  private onBackToExplorer?: () => Promise<boolean>;

  constructor(
    gatewayService: GatewayFileSystemService,
    fileService: FileSystemService,
    onStateChange?: (items: HistoryItem[], selectedIndex: number) => void,
    onFileViewerStateChange?: (file: any, content: string) => void,
    onAgentSessionList?: () => Promise<void>,
    onBackToExplorer?: () => Promise<boolean>,
  ) {
    super();
    this.pageType = "HistoryPage";
    this.gatewayService = gatewayService;
    this.fileService = fileService;
    this.onStateChange = onStateChange;
    this.onFileViewerStateChange = onFileViewerStateChange;
    this.onAgentSessionList = onAgentSessionList;
    this.onBackToExplorer = onBackToExplorer;
  }

  public async afterRender(): Promise<void> {
    if (this.items.length === 0) {
      await this.loadHistory();
    } else {
      this.notifyState();
    }
  }

  private async loadHistory() {
    try {
      this.notifyStatus("Loading history...");
      const history = await getG2History(this.gatewayService);
      this.items = history.map((entry) => ({
        path: entry.path,
        name: entry.path.split(/[\/\\]/).pop() || entry.path,
        lastViewedAt: entry.lastViewedAt,
      }));
      this.selectedIndex = 0;
      this.notifyStatus(`Loaded ${this.items.length} history entries`);
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
      this.onStateChange(this.items, this.selectedIndex);
    }
  }

  public render(): PageRenderResult {
    const total = this.items.length;
    const pageIndicator = total > 0 ? `[${this.selectedIndex + 1}/${total}]` : "[0/0]";
    const headerContent = this.buildHeaderLine("履歴", pageIndicator, G2_HISTORY_MAX_WIDTH, "[History]");

    let bodyText = "";

    if (total === 0) {
      bodyText = "  (No viewing history)\n  Double-tap: Back";
    } else {
      const selected = Math.max(0, Math.min(this.selectedIndex, total - 1));
      const halfWindow = Math.floor(G2_HISTORY_MAX_LINES / 2);
      let start = Math.max(0, selected - halfWindow);
      let end = start + G2_HISTORY_MAX_LINES;

      if (end > total) {
        end = total;
        start = Math.max(0, end - G2_HISTORY_MAX_LINES);
      }

      const visible = this.items.slice(start, end);
      const lines = visible.map((item, idx) => {
        const actualIdx = start + idx;
        const isFocused = actualIdx === selected;
        const pointer = isFocused ? "> " : "  ";
        const icon = "[F] ";
        const overhead = this.getStringWidth(pointer) + this.getStringWidth(icon);
        const name = this.truncateName(item.name, G2_HISTORY_MAX_WIDTH - overhead);
        return `${pointer}${icon}${name}`;
      });

      bodyText = lines.join("\n");
    }

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "history_header",
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
      containerName: "history_body",
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
          { id: "back", title: "Explorerに戻る" },
          { id: "refresh", title: "更新" },
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

    // Open file in FileViewer
    const fileItem = {
      id: item.path,
      name: item.name,
      type: 'file' as const,
      path: item.path,
    };
    const viewerPage = new FileViewerPage(
      fileItem,
      this.fileService,
      () => this.navigate(this),  // back to history
      this.onFileViewerStateChange,
      this.onAgentSessionList,
      this.gatewayService,
    );
    await this.navigate(viewerPage);
  }

  public async onDoubleClick() {
    if (this.onBackToExplorer) {
      await this.onBackToExplorer();
    }
  }

  public async onLongPress() {
    // Reserved for future Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "refresh":
        await this.loadHistory();
        break;
      case "back":
        if (this.onBackToExplorer) {
          await this.onBackToExplorer();
        }
        break;
    }
  }
}
