import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../../page-manager";
import { G2AgentController } from "../g2-agent-controller";
import { OpenCodeProviderModel } from "../../../domain/types";

const LIST_MAX_LINES = 9;
const LIST_MAX_WIDTH = 56;

export class AgentModelSelectPage extends BasePage {
  private controller: G2AgentController;
  private onModelSelected: (sessionID: string) => Promise<void>;
  private onReturnToSessionList: () => Promise<void>;
  private models: OpenCodeProviderModel[] = [];
  private selectedIndex: number = 0;

  constructor(
    controller: G2AgentController,
    onModelSelected: (sessionID: string) => Promise<void>,
    onReturnToSessionList: () => Promise<void>,
  ) {
    super();
    this.pageType = "AgentModelSelectPage";
    this.controller = controller;
    this.onModelSelected = onModelSelected;
    this.onReturnToSessionList = onReturnToSessionList;
  }

  public async afterRender(): Promise<void> {
    try {
      this.models = await this.controller.loadModels();
      this.selectedIndex = 0;
      await this.renderPage();
    } catch (e) {
      console.error('[AgentModelSelectPage] afterRender error:', e);
    }
  }

  public render(): PageRenderResult {
    const total = this.models.length;
    const pageIndicator = total > 0 ? `[${this.selectedIndex + 1}/${total}]` : "[0/0]";
    const headerContent = this.buildHeaderLine("Models", pageIndicator, LIST_MAX_WIDTH, "[Models]");

    let bodyText = "";

    if (total > 0) {
      const selected = Math.max(0, Math.min(this.selectedIndex, total - 1));
      const halfWindow = Math.floor(LIST_MAX_LINES / 2);
      let start = Math.max(0, selected - halfWindow);
      let end = start + LIST_MAX_LINES;

      if (end > total) {
        end = total;
        start = Math.max(0, end - LIST_MAX_LINES);
      }

      const visible = this.models.slice(start, end);
      const lines = visible.map((model, idx) => {
        const actualIdx = start + idx;
        const isFocused = actualIdx === selected;
        const pointer = isFocused ? "> " : "  ";
        const name = this.truncateName(model.name, LIST_MAX_WIDTH - this.getStringWidth(pointer));
        return `${pointer}${name}`;
      });

      bodyText = lines.join("\n");
    } else {
      bodyText = "  Loading models...";
    }

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "agent_header",
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
      containerName: "agent_body",
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
          { id: "back", title: "Back" },
        ],
      },
    };
  }

  public async onScrollUp() {
    if (this.models.length === 0) return;
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = this.models.length - 1;
    }
    await this.renderPage();
  }

  public async onScrollDown() {
    if (this.models.length === 0) return;
    if (this.selectedIndex < this.models.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    await this.renderPage();
  }

  public async onClick() {
    const model = this.models[this.selectedIndex];
    if (!model) return;

    this.controller.selectModel(model);
    const sessionID = await this.controller.createSession(model);
    if (sessionID) {
      await this.onModelSelected(sessionID);
    }
  }

  public async onDoubleClick() {
    await this.onReturnToSessionList();
  }

  public async onLongPress() {
    // Future: Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "back":
        await this.onReturnToSessionList();
        break;
    }
  }
}
