import { AgentContext } from '../domain/types';

export function formatAgentContext(context: AgentContext): string {
  const lines: string[] = [];

  lines.push(`Current directory: ${context.currentPath}`);

  if (context.selectedItem) {
    lines.push(`Selected item: ${context.selectedItem.name}`);
  }

  if (context.selectedFile) {
    lines.push(`Selected file: ${context.selectedFile.path}`);
  }

  lines.push(`Source screen: ${context.sourceScreen}`);

  return lines.join('\n');
}

export function formatMessageWithContext(
  context: AgentContext | null | undefined,
  userMessage: string
): string {
  if (!context) {
    return userMessage;
  }

  const contextBlock = formatAgentContext(context);

  return `[HomePilot Context]\n${contextBlock}\n[/HomePilot Context]\n\n${userMessage}`;
}
