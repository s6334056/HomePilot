import { OpenCodeMessagePart } from '../../domain/types';
import { OpenCodeClientMessage } from '../../services/OpenCodeClient';

/**
 * Shared message mapping logic extracted from useOpenCode.ts.
 * Converts OpenCode API messages (from getMessages) into
 * OpenCodeMessageWithParts format used by both PWA and G2.
 */
export interface OpenCodeMessageWithParts {
  id: string;
  role: 'user' | 'assistant';
  sessionID: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
  time?: { created: number; completed?: number };
  finish?: string;
  mode?: string;
  path?: { cwd: string; root: string };
  modelID?: string;
  providerID?: string;
  parts: OpenCodeMessagePart[];
  contentText: string;
}

export function mapApiMessagesToWithParts(
  apiMessages: OpenCodeClientMessage[],
  sessionID: string,
): OpenCodeMessageWithParts[] {
  return apiMessages.map((m) => {
    const parts: OpenCodeMessagePart[] = m.parts.map((p) => ({
      id: p.id,
      type: p.type,
      messageID: p.messageID || m.info.id,
      sessionID: p.sessionID || sessionID,
      text: p.text,
      tool: p.tool,
      callID: p.callID,
      state: p.state,
      time: p.time,
    }));
    const contentText = parts
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text)
      .join('');
    return {
      ...m.info,
      parts,
      contentText,
    };
  });
}
