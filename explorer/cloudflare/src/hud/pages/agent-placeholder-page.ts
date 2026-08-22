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
    const targetTruncated = this.truncateName(target, 52);

    const bodyText = [
      "Target:",
      ` ${targetTruncated}`,
      `Source: ${this.context.sourceScreen}`,
    ].join("\n");

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "agent_header",
      content: "🤖 Agent Mode",
      xPosition: 4,
      yPosition: 2,
      width: 572,
      height: 28,
      borderWidth: 0,
      isEventCapture: 0,
    });

    const bodyProp = new TextContainerProperty({
      containerID: 2,
      containerName: "agent_body",
      content: bodyText,
      xPosition: 4,
      yPosition: 30,
      width: 572,
      height: 228,
      borderWidth: 1,
      borderColor: 0xFFFFFFFF,
      borderRadius: 8,
      paddingLength: 2,
      isEventCapture: 1,
    });

    const footerProp = new TextContainerProperty({
      containerID: 3,
      containerName: "agent_footer",
      content: "Double-tap: Return",
      xPosition: 4,
      yPosition: 262,
      width: 572,
      height: 28,
      borderWidth: 0,
      isEventCapture: 0,
    });

    return {
      containerTotalNum: 3,
      textObject: [headerProp, bodyProp, footerProp],
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
