export enum MessageType {
  JOIN = 'JOIN',
  OFFER = 'OFFER',
  ANSWER = 'ANSWER',
  ICE_CANDIDATE = 'ICE_CANDIDATE',
  ROOM_CREATED = 'ROOM_CREATED',
  ERROR = 'ERROR'
}

export interface SignalingMessage {
  type: MessageType;
  roomId: string;
  payload?: any;
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  summary?: string; // Gemini AI Summary
}

export interface TransferState {
  progress: number; // 0 to 100
  speed: string; // e.g. "2.5 MB/s"
  status: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'TRANSFERRING' | 'COMPLETED' | 'ERROR';
  error?: string;
}

export const CHUNK_SIZE = 16 * 1024; // 16KB chunks for safe reliable transfer
