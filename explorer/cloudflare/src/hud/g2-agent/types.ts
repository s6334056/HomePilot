import {
  OpenCodeSessionInfo,
  OpenCodeProviderModel,
} from '../../domain/types';
import { OpenCodeMessageWithParts } from './message-mapper';

export type G2VoiceState = 'idle' | 'ready' | 'transcribing' | 'confirmation';

export interface G2AgentState {
  sessions: OpenCodeSessionInfo[];
  selectedSessionID: string | null;
  selectedSession: OpenCodeSessionInfo | null;

  messages: OpenCodeMessageWithParts[];
  isLoadingMessages: boolean;

  processingSessionIDs: string[];
  unreadSessionIDs: string[];

  voiceState: G2VoiceState;
  transcript: string;

  models: OpenCodeProviderModel[];
  selectedModel: OpenCodeProviderModel | null;

  error: string | null;
}

export const createInitialG2AgentState = (): G2AgentState => ({
  sessions: [],
  selectedSessionID: null,
  selectedSession: null,
  messages: [],
  isLoadingMessages: false,
  processingSessionIDs: [],
  unreadSessionIDs: [],
  voiceState: 'idle',
  transcript: '',
  models: [],
  selectedModel: null,
  error: null,
});
