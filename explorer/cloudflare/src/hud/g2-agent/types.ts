import {
  OpenCodeSessionInfo,
  OpenCodeProviderModel,
  OpenCodeQuestionRequest,
} from '../../domain/types';
import { OpenCodeMessageWithParts } from './message-mapper';

export type G2VoiceState = 'idle' | 'ready' | 'transcribing' | 'confirmation';

export interface G2AgentState {
  sessions: OpenCodeSessionInfo[];
  selectedSessionID: string | null;
  selectedSession: OpenCodeSessionInfo | null;

  messages: OpenCodeMessageWithParts[];
  isLoadingMessages: boolean;

  pendingQuestions: OpenCodeQuestionRequest[];

  processingSessionIDs: string[];
  unreadSessionIDs: string[];

  voiceState: G2VoiceState;
  transcript: string;
  questionVoiceConfirm: boolean;

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
  pendingQuestions: [],
  processingSessionIDs: [],
  unreadSessionIDs: [],
  voiceState: 'idle',
  transcript: '',
  questionVoiceConfirm: false,
  models: [],
  selectedModel: null,
  error: null,
});
