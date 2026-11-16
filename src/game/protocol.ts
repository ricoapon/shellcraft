import type { EngineReply, EngineSnapshot, EngineView } from './engine';
import type { TranscriptEntry } from '../core/shell';
export type RequestType =
  | 'language'
  | 'init'
  | 'command'
  | 'editorDraft'
  | 'saveEditor'
  | 'closeEditor'
  | 'openEditor'
  | 'export'
  | 'reset'
  | 'import';
export interface GameRequest {
  id: number;
  type: RequestType;
  payload?: unknown;
}
export interface GameResponse {
  language?: import('../runtime/tools').LanguageTools;
  id?: number;
  ok: boolean;
  error?: string;
  warning?: string;
  view?: EngineView;
  reply?: EngineReply;
  entries?: readonly TranscriptEntry[];
  save?: EngineSnapshot;
}
