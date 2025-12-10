import { Message, Session, User, MessageType, UserRole } from '../types';
import { supabase } from './supabaseClient';

// Check if Supabase is configured
const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  // Check that both exist and URL isn't a placeholder
  return !!(url && key && !url.includes('placeholder'));
};

class CommunicationService {
  private listeners: Map<string, Set<(messages: Message[]) => void>> = new Map();
  private realtimeSubscriptions: Map<string, any> = new Map();

  constructor() {
    // Set up real-time subscriptions if Supabase is configured
    if (isSupabaseConfigured()) {
      this.setupRealtimeSubscriptions();
    }
  }

  private setupRealtimeSubscriptions(): void {
    // Subscribe to message changes
    const messagesChannel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          // Notify listeners for the affected session
          if (payload.new && 'session_id' in payload.new) {
            const sessionId = payload.new.session_id as string;
            this.loadMessages(sessionId).then(messages => {
              this.notifyListeners(sessionId, messages);
            });
          }
        }
      )
      .subscribe();

    // Subscribe to session changes
    const sessionsChannel = supabase
      .channel('sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions'
        },
        () => {
          // Reload sessions for all active listeners
          this.listeners.forEach((_, sessionId) => {
            this.loadMessages(sessionId).then(messages => {
              this.notifyListeners(sessionId, messages);
            });
          });
        }
      )
      .subscribe();

    this.realtimeSubscriptions.set('messages', messagesChannel);
    this.realtimeSubscriptions.set('sessions', sessionsChannel);
  }

  // Session Management
  async createSession(session: Session): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, session creation failed');
      return;
    }

    try {
      // Create session
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          id: session.id,
          title: session.title,
          date: session.date.toISOString(),
          preview_image: session.previewImage || null,
          status: session.status,
          coach_id: session.coachId || null,
          tags: session.tags || []
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Add players to session_players junction table
      if (session.playerIds && session.playerIds.length > 0) {
        const sessionPlayers = session.playerIds.map(playerId => ({
          session_id: session.id,
          player_id: playerId
        }));

        const { error: playersError } = await supabase
          .from('session_players')
          .insert(sessionPlayers);

        if (playersError) throw playersError;
      }

      this.notifyListeners(session.id, []);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  }

  async getSessions(): Promise<Session[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          session_players(player_id)
        `)
        .order('date', { ascending: false });

      if (error) throw error;

      return (data || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        date: new Date(s.date),
        previewImage: s.preview_image || undefined,
        status: s.status,
        coachId: s.coach_id || '',
        playerIds: (s.session_players || []).map((sp: any) => sp.player_id),
        tags: s.tags || []
      }));
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  }

  async getSessionsForUser(userId: string): Promise<Session[]> {
    const allSessions = await this.getSessions();
    const deletedSessionIds = await this.getDeletedSessionsForUser(userId);
    
    return allSessions.filter(session => {
      // Include if user is coach, player in session, or admin
      const isCoach = session.coachId === userId;
      const isPlayer = session.playerIds.includes(userId);
      const isDeleted = deletedSessionIds.has(session.id);
      
      return (isCoach || isPlayer) && !isDeleted;
    });
  }

  async deleteSessionForUser(userId: string, sessionId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_session_deletions')
        .insert({
          user_id: userId,
          session_id: sessionId
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting session for user:', error);
    }
  }

  async restoreSessionForUser(userId: string, sessionId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_session_deletions')
        .delete()
        .eq('user_id', userId)
        .eq('session_id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error restoring session for user:', error);
    }
  }

  async isSessionDeletedForUser(userId: string, sessionId: string): Promise<boolean> {
    const deletedSessions = await this.getDeletedSessionsForUser(userId);
    return deletedSessions.has(sessionId);
  }

  private async getDeletedSessionsForUser(userId: string): Promise<Set<string>> {
    if (!isSupabaseConfigured()) {
      return new Set();
    }

    try {
      const { data, error } = await supabase
        .from('user_session_deletions')
        .select('session_id')
        .eq('user_id', userId);

      if (error) throw error;

      return new Set((data || []).map((d: any) => d.session_id));
    } catch (error) {
      console.error('Error loading deleted sessions:', error);
      return new Set();
    }
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    if (!isSupabaseConfigured()) {
      return undefined;
    }

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          session_players(player_id)
        `)
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      if (!data) return undefined;

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        previewImage: data.preview_image || undefined,
        status: data.status,
        coachId: data.coach_id || '',
        playerIds: (data.session_players || []).map((sp: any) => sp.player_id),
        tags: data.tags || []
      };
    } catch (error) {
      console.error('Error loading session:', error);
      return undefined;
    }
  }

  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.date !== undefined) updateData.date = updates.date.toISOString();
      if (updates.previewImage !== undefined) updateData.preview_image = updates.previewImage;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.coachId !== undefined) updateData.coach_id = updates.coachId;
      if (updates.tags !== undefined) updateData.tags = updates.tags;

      const { error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error) throw error;

      // Update playerIds if provided
      if (updates.playerIds !== undefined) {
        // Delete existing
        await supabase
          .from('session_players')
          .delete()
          .eq('session_id', sessionId);

        // Insert new
        if (updates.playerIds.length > 0) {
          const sessionPlayers = updates.playerIds.map(playerId => ({
            session_id: sessionId,
            player_id: playerId
          }));

          await supabase
            .from('session_players')
            .insert(sessionPlayers);
        }
      }
    } catch (error) {
      console.error('Error updating session:', error);
    }
  }

  // Player Management
  async getPlayers(): Promise<User[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', UserRole.PLAYER)
        .order('name');

      if (error) throw error;

      return (data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        role: u.role as UserRole,
        avatarUrl: u.avatar_url || ''
      }));
    } catch (error) {
      console.error('Error loading players:', error);
      return [];
    }
  }

  async getPlayer(playerId: string): Promise<User | undefined> {
    if (!isSupabaseConfigured()) {
      return undefined;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', playerId)
        .single();

      if (error) throw error;
      if (!data) return undefined;

      return {
        id: data.id,
        name: data.name,
        role: data.role as UserRole,
        avatarUrl: data.avatar_url || ''
      };
    } catch (error) {
      console.error('Error loading player:', error);
      return undefined;
    }
  }

  async addPlayer(player: User): Promise<void> {
    // This should be done through authService, but keeping for compatibility
    console.warn('addPlayer should be done through authService.createUserWithToken');
  }

  async updatePlayer(playerId: string, updates: Partial<User>): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.avatarUrl !== undefined) updateData.avatar_url = updates.avatarUrl;
      if (updates.role !== undefined) updateData.role = updates.role;

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', playerId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating player:', error);
    }
  }

  async deletePlayer(playerId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.error('Cannot delete player: Supabase is not configured');
      return;
    }

    try {
      const { error, data } = await supabase
        .from('users')
        .delete()
        .eq('id', playerId)
        .eq('role', UserRole.PLAYER) // Only allow deleting players, not admins
        .select();

      if (error) {
        console.error('Error deleting player:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.warn(`Player with ID ${playerId} not found or could not be deleted`);
      }
    } catch (error) {
      console.error('Error deleting player:', error);
      throw error; // Re-throw so the UI can handle it
    }
  }

  // Message Management
  async sendMessage(sessionId: string, message: Message): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, message not sent');
      return;
    }

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          id: message.id,
          session_id: sessionId,
          sender_id: message.senderId,
          type: message.type,
          content: message.content,
          metadata: message.metadata || {},
          created_at: message.createdAt.toISOString()
        });

      if (error) throw error;

      // Real-time will notify listeners automatically
      const messages = await this.loadMessages(sessionId);
      this.notifyListeners(sessionId, messages);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private async loadMessages(sessionId: string): Promise<Message[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((m: any) => ({
        id: m.id,
        sessionId: m.session_id,
        senderId: m.sender_id,
        type: m.type as MessageType,
        content: m.content,
        createdAt: new Date(m.created_at),
        metadata: m.metadata || {}
      }));
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    return this.loadMessages(sessionId);
  }

  async updateMessage(sessionId: string, messageId: string, updates: Partial<Message>): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const updateData: any = {};
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      const { error } = await supabase
        .from('messages')
        .update(updateData)
        .eq('id', messageId)
        .eq('session_id', sessionId);

      if (error) throw error;

      // Real-time will notify listeners automatically
      const messages = await this.loadMessages(sessionId);
      this.notifyListeners(sessionId, messages);
    } catch (error) {
      console.error('Error updating message:', error);
    }
  }

  // Real-time updates via listeners
  subscribe(sessionId: string, callback: (messages: Message[]) => void): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(callback);

    // Load initial messages
    this.loadMessages(sessionId).then(messages => {
      callback(messages);
    });

    // Return unsubscribe function
    return () => {
      const sessionListeners = this.listeners.get(sessionId);
      if (sessionListeners) {
        sessionListeners.delete(callback);
        if (sessionListeners.size === 0) {
          this.listeners.delete(sessionId);
        }
      }
    };
  }

  private notifyListeners(sessionId: string, messages: Message[]): void {
    const listeners = this.listeners.get(sessionId);
    if (listeners) {
      listeners.forEach(callback => callback(messages));
    }
  }

  // Polling mechanism (fallback if real-time doesn't work)
  startPolling(sessionId: string, callback: (messages: Message[]) => void, interval = 2000): () => void {
    const poll = async () => {
      const messages = await this.getMessages(sessionId);
      callback(messages);
    };

    poll(); // Initial call
    const intervalId = setInterval(poll, interval);

    return () => clearInterval(intervalId);
  }

  // Cleanup
  cleanup(): void {
    this.realtimeSubscriptions.forEach((subscription) => {
      supabase.removeChannel(subscription);
    });
    this.realtimeSubscriptions.clear();
    this.listeners.clear();
  }
}

// Singleton instance
export const communicationService = new CommunicationService();
