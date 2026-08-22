import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { AgentContext } from "../../domain/types";

export class AgentPlaceholderPage extends BasePage {
  private context: AgentContext;
  private onReturn: () => Promise<boolean>;

  constructor(context: AgentContext, onReturn: () => Promise<boolean>) {
    super();
    this.pageType = "AgentPlaceholderPage";
    this.context = context;
    this.onReturn = onReturn;
  }

  public render(): PageRenderResult {
    const target = this.context.selectedFile?.name || this.context.selectedItem?.name || this.context.currentPath;
    const targetTruncated = this.truncateName(target, 22);

    const bodyText = [
      "🤖 [HomePilot Agent Ready]",
      "Target:",
      ` ${targetTruncated}`,
      `Source: ${this.context.sourceScreen}`,
      "────────────────────────",
      "Double-tap: Return",
    ].join("\n");

    const textProp = new TextContainerProperty({
      containerID: 1,
      containerName: "agent_body",
      content: `🤖 Agent Mode\n────────────────────────\n${bodyText}`,
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
        menuList: [{ id: "return", title: "Return to App" }],
      },
    };
  }

  public async onClick() {
    await this.onReturn();
  }

  public async onDoubleClick() {
    await this.onReturn();
  }

  public async onMenuItemClick(menuId: string) {
    if (menuId === "return") {
      await this.onReturn();
    }
  }
}
