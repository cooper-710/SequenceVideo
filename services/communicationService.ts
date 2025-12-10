import { Message, Session, User, MessageType, UserRole } from '../types';

const STORAGE_KEY_SESSIONS = 'sequence_sessions';
const STORAGE_KEY_MESSAGES = 'sequence_messages';
const STORAGE_KEY_PLAYERS = 'sequence_players';
const STORAGE_KEY_DELETED_SESSIONS = 'sequence_deleted_sessions'; // userId -> Set<sessionId>
const STORAGE_VERSION = '1';

// Enhanced service with localStorage for cross-tab communication
// In production, this would connect to a backend API/WebSocket
class CommunicationService {
  private sessions: Map<string, Session> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private players: Map<string, User> = new Map();
  private listeners: Map<string, Set<(messages: Message[]) => void>> = new Map();
  private storageListeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
    // Listen for storage changes (cross-tab communication)
    window.addEventListener('storage', this.handleStorageChange.bind(this));
    // Also poll localStorage for changes (same-tab updates)
    setInterval(() => this.checkStorageChanges(), 1000);
  }

  private loadFromStorage(): void {
    try {
      // Load sessions
      const sessionsData = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (sessionsData) {
        const sessions = JSON.parse(sessionsData);
        sessions.forEach((s: Session) => {
          this.sessions.set(s.id, {
            ...s,
            date: new Date(s.date),
            playerIds: s.playerIds || [] // Ensure playerIds exists
          });
        });
      }

      // Load messages
      const messagesData = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (messagesData) {
        const messages = JSON.parse(messagesData);
        Object.entries(messages).forEach(([sessionId, msgs]: [string, any]) => {
          this.messages.set(sessionId, msgs.map((m: Message) => ({
            ...m,
            createdAt: new Date(m.createdAt)
          })));
        });
      }

      // Load players
      const playersData = localStorage.getItem(STORAGE_KEY_PLAYERS);
      if (playersData) {
        const players = JSON.parse(playersData);
        players.forEach((p: User) => {
          this.players.set(p.id, p);
        });
      } else {
        // Initialize with default players if none exist
        this.initializeDefaultPlayers();
      }
    } catch (error) {
      console.error('Error loading from storage:', error);
    }
  }

  private initializeDefaultPlayers(): void {
    const defaultPlayers: User[] = [
      {
        id: 'player1',
        name: 'Player 1',
        role: UserRole.PLAYER,
        avatarUrl: ''
      },
      {
        id: 'player2',
        name: 'Player 2',
        role: UserRole.PLAYER,
        avatarUrl: ''
      },
      {
        id: 'player3',
        name: 'Player 3',
        role: UserRole.PLAYER,
        avatarUrl: ''
      }
    ];
    defaultPlayers.forEach(player => this.players.set(player.id, player));
    this.savePlayersToStorage();
  }

  private saveToStorage(): void {
    try {
      // Save sessions
      const sessionsArray = Array.from(this.sessions.values());
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessionsArray));
      localStorage.setItem(`${STORAGE_KEY_SESSIONS}_version`, STORAGE_VERSION);

      // Save messages
      const messagesObj: Record<string, Message[]> = {};
      this.messages.forEach((msgs, sessionId) => {
        messagesObj[sessionId] = msgs;
      });
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messagesObj));
      localStorage.setItem(`${STORAGE_KEY_MESSAGES}_version`, STORAGE_VERSION);
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  private savePlayersToStorage(): void {
    try {
      const playersArray = Array.from(this.players.values());
      localStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(playersArray));
    } catch (error) {
      console.error('Error saving players to storage:', error);
    }
  }

  private handleStorageChange(e: StorageEvent): void {
    if (e.key === STORAGE_KEY_SESSIONS || e.key === STORAGE_KEY_MESSAGES) {
      this.loadFromStorage();
      // Notify all listeners
      this.messages.forEach((_, sessionId) => {
        this.notifyListeners(sessionId);
      });
    }
  }

  private lastSessionsVersion = '';
  private lastMessagesVersion = '';
  private checkStorageChanges(): void {
    const sessionsVersion = localStorage.getItem(`${STORAGE_KEY_SESSIONS}_version`) || '';
    const messagesVersion = localStorage.getItem(`${STORAGE_KEY_MESSAGES}_version`) || '';

    if (sessionsVersion !== this.lastSessionsVersion || messagesVersion !== this.lastMessagesVersion) {
      this.lastSessionsVersion = sessionsVersion;
      this.lastMessagesVersion = messagesVersion;
      this.loadFromStorage();
      // Notify all listeners
      this.messages.forEach((_, sessionId) => {
        this.notifyListeners(sessionId);
      });
    }
  }

  // Session Management
  createSession(session: Session): void {
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    this.saveToStorage();
    this.notifyListeners(session.id);
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => 
      b.date.getTime() - a.date.getTime()
    );
  }

  getSessionsForUser(userId: string): Session[] {
    const allSessions = this.getSessions();
    const deletedSessionIds = this.getDeletedSessionsForUser(userId);
    return allSessions.filter(session => !deletedSessionIds.has(session.id));
  }

  // User-specific session deletion (like iMessage - only deletes for that user)
  deleteSessionForUser(userId: string, sessionId: string): void {
    const deletedSessions = this.getDeletedSessionsForUser(userId);
    deletedSessions.add(sessionId);
    this.saveDeletedSessionsForUser(userId, deletedSessions);
  }

  // Restore a deleted session for a user
  restoreSessionForUser(userId: string, sessionId: string): void {
    const deletedSessions = this.getDeletedSessionsForUser(userId);
    deletedSessions.delete(sessionId);
    this.saveDeletedSessionsForUser(userId, deletedSessions);
  }

  // Check if a session is deleted for a user
  isSessionDeletedForUser(userId: string, sessionId: string): boolean {
    const deletedSessions = this.getDeletedSessionsForUser(userId);
    return deletedSessions.has(sessionId);
  }

  private getDeletedSessionsForUser(userId: string): Set<string> {
    try {
      const key = `${STORAGE_KEY_DELETED_SESSIONS}_${userId}`;
      const data = localStorage.getItem(key);
      if (data) {
        const sessionIds = JSON.parse(data);
        return new Set(sessionIds);
      }
    } catch (error) {
      console.error('Error loading deleted sessions:', error);
    }
    return new Set();
  }

  private saveDeletedSessionsForUser(userId: string, deletedSessions: Set<string>): void {
    try {
      const key = `${STORAGE_KEY_DELETED_SESSIONS}_${userId}`;
      const sessionIds = Array.from(deletedSessions);
      localStorage.setItem(key, JSON.stringify(sessionIds));
    } catch (error) {
      console.error('Error saving deleted sessions:', error);
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId: string, updates: Partial<Session>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, ...updates });
      this.saveToStorage();
    }
  }

  // Player Management
  getPlayers(): User[] {
    return Array.from(this.players.values());
  }

  getPlayer(playerId: string): User | undefined {
    return this.players.get(playerId);
  }

  addPlayer(player: User): void {
    this.players.set(player.id, player);
    this.savePlayersToStorage();
  }

  updatePlayer(playerId: string, updates: Partial<User>): void {
    const player = this.players.get(playerId);
    if (player) {
      this.players.set(playerId, { ...player, ...updates });
      this.savePlayersToStorage();
    }
  }

  deletePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.savePlayersToStorage();
  }

  // Message Management
  sendMessage(sessionId: string, message: Message): void {
    const sessionMessages = this.messages.get(sessionId) || [];
    sessionMessages.push(message);
    this.messages.set(sessionId, sessionMessages);
    this.saveToStorage();
    this.notifyListeners(sessionId);
  }

  getMessages(sessionId: string): Message[] {
    return this.messages.get(sessionId) || [];
  }

  updateMessage(sessionId: string, messageId: string, updates: Partial<Message>): void {
    const sessionMessages = this.messages.get(sessionId) || [];
    const index = sessionMessages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      sessionMessages[index] = { ...sessionMessages[index], ...updates };
      this.messages.set(sessionId, sessionMessages);
      this.saveToStorage();
      this.notifyListeners(sessionId);
    }
  }

  // Real-time updates via listeners
  subscribe(sessionId: string, callback: (messages: Message[]) => void): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const sessionListeners = this.listeners.get(sessionId);
      if (sessionListeners) {
        sessionListeners.delete(callback);
      }
    };
  }

  private notifyListeners(sessionId: string): void {
    const listeners = this.listeners.get(sessionId);
    if (listeners) {
      const messages = this.getMessages(sessionId);
      listeners.forEach(callback => callback(messages));
    }
  }

  // Polling mechanism for cross-tab communication
  // In production, use WebSockets
  startPolling(sessionId: string, callback: (messages: Message[]) => void, interval = 2000): () => void {
    const poll = () => {
      const messages = this.getMessages(sessionId);
      callback(messages);
    };

    poll(); // Initial call
    const intervalId = setInterval(poll, interval);

    return () => clearInterval(intervalId);
  }
}

// Singleton instance
export const communicationService = new CommunicationService();
