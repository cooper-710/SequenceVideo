import React, { useState, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { Message, MessageType, User, UserRole } from '../types';
import { communicationService } from '../services/communicationService';

interface UserInterfaceProps {
  currentUser: User;
}

export const UserInterface: React.FC<UserInterfaceProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [coachUser, setCoachUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize and load coach
  useEffect(() => {
    communicationService.setCurrentUserId(currentUser.id);
    loadCoachAndMessages();
  }, [currentUser.id]);

  // Load messages when coach is found
  useEffect(() => {
    if (!coachUser) {
      setMessages([]);
      return;
    }

    loadMessages(coachUser.id, currentUser.id);
    
    // Subscribe to real-time updates
    const conversationKey = `${coachUser.id}::${currentUser.id}`;
    const unsubscribe = communicationService.subscribe(conversationKey, (newMessages) => {
      setMessages(newMessages);
    });

    // Also poll for cross-tab updates (fallback)
    const stopPolling = communicationService.startPolling(conversationKey, (newMessages) => {
      setMessages(newMessages);
    });

    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [coachUser, currentUser.id]);

  const loadCoachAndMessages = async () => {
    setIsLoading(true);
    try {
      // Get the first coach/admin
      const coach = await communicationService.getFirstCoach();
      if (coach) {
        setCoachUser(coach);
      } else {
        // Fallback: create a default coach user object
        setCoachUser({
          id: 'admin',
          name: 'Admin',
          role: UserRole.COACH,
          avatarUrl: ''
        });
      }
    } catch (error) {
      console.error('Error loading coach:', error);
      // Fallback coach
      setCoachUser({
        id: 'admin',
        name: 'Admin',
        role: UserRole.COACH,
        avatarUrl: ''
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (coachId: string, playerId: string) => {
    const conversationMessages = await communicationService.getMessagesForConversation(coachId, playerId);
    setMessages(conversationMessages);
  };

  const handleSendMessage = async (content: string, type: MessageType, metadata?: Message['metadata']) => {
    if (!coachUser) return;

    const newMessage: Message = {
      id: crypto.randomUUID(),
      coachId: coachUser.id,
      playerId: currentUser.id,
      senderId: currentUser.id,
      type,
      content,
      createdAt: new Date(),
      metadata,
    };

    // Optimistic update - add message to UI immediately
    setMessages(prev => [...prev, newMessage]);

    try {
      await communicationService.sendMessage(coachUser.id, currentUser.id, newMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove the optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== newMessage.id));
      alert('Failed to send message. Please try again.');
    }
  };

  const handleUpdateMessage = async (messageId: string, updates: Partial<Message>) => {
    if (!coachUser) return;
    await communicationService.updateMessage(coachUser.id, currentUser.id, messageId, updates);
  };

  // Default coach user for display
  const displayCoach = coachUser || {
    id: 'admin',
    name: 'Admin',
    role: UserRole.COACH,
    avatarUrl: ''
  };

  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden font-sans text-white">
      {/* Main Content */}
      <div className="flex-1 flex min-w-0 w-full bg-black relative z-0 overflow-hidden">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0 w-full bg-black relative z-0 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-sequence-muted p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-sequence-card flex items-center justify-center mb-4 border border-sequence-border">
                <div className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Loading...</h3>
              <p className="max-w-xs">Setting up your chat.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden relative">
              <ChatInterface 
                messages={messages}
                currentUser={currentUser}
                onSendMessage={handleSendMessage}
                onUpdateMessage={handleUpdateMessage}
                otherUserName={displayCoach.name}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
