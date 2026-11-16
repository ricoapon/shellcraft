import type { EngineReply, EngineSnapshot, EngineView } from './engine';
import type { TranscriptEntry } from '../core/shell';
export type RequestType =
  | 'init'
  | 'command'
  | 'editorDraft'
  | 'saveEditor'
  | 'closeEditor'
  | 'openEditor'
  | 'export'
  | 'import';
export interface GameRequest {
  id: number;
  type: RequestType;
  payload?: unknown;
}
export interface GameResponse {
  id?: number;
  ok: boolean;
  error?: string;
  warning?: string;
  view?: EngineView;
  reply?: EngineReply;
  entries?: readonly TranscriptEntry[];
  save?: EngineSnapshot;
}
