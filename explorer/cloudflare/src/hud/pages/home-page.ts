import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";

export const G2_HOME_MAX_LINES = 9;
export const G2_HOME_MAX_WIDTH = 56;

/**
 * Which file system the G2 Runtime is currently driving.
 *
 * - 'local'   アプリ (LocalFileSystemService)
 * - 'gateway' 自宅PC (GatewayFileSystemService)
 *
 * Homeは選択結果をRuntimeへ返すだけで、FileSystem自体は触らない。
 * 永続化はしない（G2起動ごとに選択時に決定する）。
 */
export type G2ConnectionMode = 'local' | 'gateway';

interface HomeOption {
  value: G2ConnectionMode;
  label: string;
}

const HOME_OPTIONS: HomeOption[] = [
  { value: 'local', label: 'アプリ' },
  { value: 'gateway', label: '自宅PC' },
];

/**
 * G2アプリのルート画面。
 * FileSystemを直接操作せず、選択した接続先をRuntimeへ返す。
 *
 * 操作は既存G2画面と同じ Up/Down/Tap/Double Tap/Long Press のみ。
 * Double Tap はアプリ終了確認（root画面の役割）。
 */
export class HomePage extends BasePage {
  private selectedIndex: number = 0;
  private onSelect: (target: G2ConnectionMode) => Promise<void>;
  /**
   * 接続失敗などのメッセージ。Home 上の本文に描画する。
   * notifyStatus は PWA 側にしか届かないため、G2 で知らせるには
   * 画面のテキストとして出す必要がある。
   */
  private statusMessage: string | null = null;

  constructor(onSelect: (target: G2ConnectionMode) => Promise<void>) {
    super();
    this.pageType = "HomePage";
    this.onSelect = onSelect;
  }

  /**
   * Set (or clear) the status line shown on Home, then redraw.
   * Home に留まる接続失敗時に呼ぶ。
   */
  public async setStatus(message: string | null): Promise<void> {
    this.statusMessage = message;
    if (this.renderPage) {
      await this.renderPage();
    }
  }

  public render(): PageRenderResult {
    const total = HOME_OPTIONS.length;
    const pageIndicator = `[${this.selectedIndex + 1}/${total}]`;
    const headerContent = this.buildHeaderLine("ホーム", pageIndicator, G2_HOME_MAX_WIDTH, "[Home]");

    const lines = HOME_OPTIONS.map((option, index) => {
      const pointer = index === this.selectedIndex ? "> " : "  ";
      return `${pointer}${option.label}`;
    });
    let bodyText = lines.join("\n");
    if (this.statusMessage) {
      bodyText += `\n\n${this.truncateName(this.statusMessage, G2_HOME_MAX_WIDTH)}`;
    }

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "home_header",
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
      containerName: "home_body",
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
        ],
      },
    };
  }

  public async afterRender(): Promise<void> {
    // Home holds no data — nothing to load.
  }

  public async onScrollUp() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = HOME_OPTIONS.length - 1;
    }
    await this.renderPage();
  }

  public async onScrollDown() {
    if (this.selectedIndex < HOME_OPTIONS.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    await this.renderPage();
  }

  public async onClick() {
    const option = HOME_OPTIONS[this.selectedIndex];
    if (!option) return;
    await this.onSelect(option.value);
  }

  public async onDoubleClick() {
    // Home is the root screen: Double Tap shows the system exit confirmation.
    await this.bridge.shutDownPageContainer(1);
  }

  public async onLongPress() {
    // Reserved for future Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "refresh":
        if (this.renderPage) {
          await this.renderPage();
        }
        break;
    }
  }
}
