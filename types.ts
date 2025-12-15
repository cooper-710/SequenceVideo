export enum MessageType {
  TEXT = 'TEXT',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  IMAGE = 'IMAGE'
}

export enum UserRole {
  PLAYER = 'PLAYER',
  COACH = 'COACH'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl: string;
}

export interface Point {
  x: number;
  y: number;
}

export type DrawingTool = 'pen' | 'line' | 'arrow' | 'circle' | 'angle' | 'eraser';

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: Point[]; // For pen
  start?: Point;   // For shapes
  end?: Point;     // For shapes
  color: string;
  timestamp: number;
  text?: string;   // For angle measurement labels
}

export interface Annotation {
  id: string;
  timestamp: number;
  startTime?: number; // When annotation starts showing (defaults to timestamp)
  endTime?: number;   // When annotation stops showing (defaults to video end)
  text?: string;
  drawings?: Drawing[];
}

export interface Message {
  id: string;
  coachId: string;  // Admin/coach ID
  playerId: string; // Player ID
  senderId: string;
  type: MessageType;
  content: string; // Text content or URL to media
  createdAt: Date;
  metadata?: {
    duration?: number;
    thumbnailUrl?: string;
    annotations?: Annotation[];
    fileSize?: string;
    aiSummary?: string;
  };
}

export interface AIResponse {
  summary: string;
  actionItems: string[];
}