import { Message, User, MessageType, UserRole } from '../types';
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
  private currentUserId: string | null = null;

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
          // Notify listeners for the affected conversation
          let coachId: string | null = null;
          let playerId: string | null = null;
          
          // Handle INSERT and UPDATE (payload.new exists)
          if (payload.new) {
            coachId = payload.new.coach_id as string;
            playerId = payload.new.player_id as string;
          }
          // Handle DELETE (payload.old exists)
          else if (payload.old) {
            coachId = payload.old.coach_id as string;
            playerId = payload.old.player_id as string;
          }
          
          if (coachId && playerId) {
            const conversationKey = `${coachId}::${playerId}`;
            this.loadMessagesForConversation(coachId, playerId).then(messages => {
              this.notifyListeners(conversationKey, messages);
            });
          }
        }
      )
      .subscribe();

    this.realtimeSubscriptions.set('messages', messagesChannel);
  }

  // Conversation Management
  async getConversationsForCoach(coachId: string): Promise<User[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      // Get all unique player IDs that have messages with this coach
      const { data, error } = await supabase
        .from('messages')
        .select('player_id')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unique player IDs
      const uniquePlayerIds = [...new Set((data || []).map((m: any) => m.player_id))];
      
      // Fetch player details
      const players = await Promise.all(
        uniquePlayerIds.map(id => this.getPlayer(id))
      );

      return players.filter(p => p !== undefined) as User[];
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  }

  async getMessagesForConversation(coachId: string, playerId: string): Promise<Message[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('coach_id', coachId)
        .eq('player_id', playerId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((m: any) => ({
        id: m.id,
        coachId: m.coach_id,
        playerId: m.player_id,
        senderId: m.sender_id,
        type: m.type as MessageType,
        content: m.content,
        createdAt: new Date(m.created_at),
        metadata: m.metadata || {}
      }));
    } catch (error) {
      console.error('Error loading messages for conversation:', error);
      return [];
    }
  }

  private async loadMessagesForConversation(coachId: string, playerId: string): Promise<Message[]> {
    return this.getMessagesForConversation(coachId, playerId);
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

  async getFirstCoach(): Promise<User | undefined> {
    if (!isSupabaseConfigured()) {
      return undefined;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', UserRole.COACH)
        .limit(1)
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
      console.error('Error loading coach:', error);
      return undefined;
    }
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
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
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
  async sendMessage(coachId: string, playerId: string, message: Message): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, message not sent');
      throw new Error('Supabase is not configured');
    }

    try {
      const { error, data } = await supabase
        .from('messages')
        .insert({
          id: message.id,
          coach_id: coachId,
          player_id: playerId,
          sender_id: message.senderId,
          type: message.type,
          content: message.content,
          metadata: message.metadata || {},
          created_at: message.createdAt.toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      // Real-time will notify listeners automatically, but also manually notify
      const messages = await this.getMessagesForConversation(coachId, playerId);
      const conversationKey = `${coachId}::${playerId}`;
      this.notifyListeners(conversationKey, messages);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error; // Re-throw so caller can handle it
    }
  }

  async updateMessage(coachId: string, playerId: string, messageId: string, updates: Partial<Message>): Promise<void> {
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
        .eq('coach_id', coachId)
        .eq('player_id', playerId);

      if (error) throw error;

      // Real-time will notify listeners automatically
      const messages = await this.getMessagesForConversation(coachId, playerId);
      const conversationKey = `${coachId}-${playerId}`;
      this.notifyListeners(conversationKey, messages);
    } catch (error) {
      console.error('Error updating message:', error);
    }
  }

  // Add method to set current user ID
  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  // Real-time updates via listeners
  // conversationKey format: "coachId::playerId" (using :: separator to avoid UUID hyphen conflicts)
  subscribe(conversationKey: string, callback: (messages: Message[]) => void): () => void {
    if (!this.listeners.has(conversationKey)) {
      this.listeners.set(conversationKey, new Set());
    }
    this.listeners.get(conversationKey)!.add(callback);

    // Parse conversation key to load initial messages
    const [coachId, playerId] = conversationKey.split('::');
    if (coachId && playerId) {
      this.loadMessagesForConversation(coachId, playerId).then(messages => {
        callback(messages);
      });
    }

    // Return unsubscribe function
    return () => {
      const conversationListeners = this.listeners.get(conversationKey);
      if (conversationListeners) {
        conversationListeners.delete(callback);
        if (conversationListeners.size === 0) {
          this.listeners.delete(conversationKey);
        }
      }
    };
  }

  private notifyListeners(conversationKey: string, messages: Message[]): void {
    const listeners = this.listeners.get(conversationKey);
    if (listeners) {
      listeners.forEach(callback => callback(messages));
    }
  }

  // Polling mechanism (fallback if real-time doesn't work)
  startPolling(conversationKey: string, callback: (messages: Message[]) => void, interval = 2000): () => void {
    const [coachId, playerId] = conversationKey.split('::');
    if (!coachId || !playerId) {
      console.error('Invalid conversation key format');
      return () => {};
    }

    const poll = async () => {
      const messages = await this.getMessagesForConversation(coachId, playerId);
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

