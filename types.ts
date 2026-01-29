export interface Participant {
  id: string;
  name: string;
  tableNumber?: string;
  addedAt: number;
}

export interface Prize {
  id: string;
  name: string;
  count: number;
}

export interface Winner {
  id: string;
  name: string;
  tableNumber?: string;
  prizeName: string;
  drawnAt: number;
  aiMessage: string;
  verified?: boolean;
}

export enum AppState {
  IDLE = 'IDLE',
  DRAWING = 'DRAWING',
  WINNER_REVEALED = 'WINNER_REVEALED',
}