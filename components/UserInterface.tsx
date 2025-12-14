import React, { useState, useEffect, useMemo } from 'react';
import { ChatInterface } from './ChatInterface';
import { SessionHeader } from './SessionHeader';
import { SessionList } from './SessionList';
import { Session, Message, MessageType, User, UserRole } from '../types';
import { communicationService } from '../services/communicationService';
import sequenceLogo from '../Sequence.png';

interface UserInterfaceProps {
  currentUser: User;
}

export const UserInterface: React.FC<UserInterfaceProps> = ({ currentUser }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasManuallySelected, setHasManuallySelected] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Load sessions on mount and auto-select/create default session
  useEffect(() => {
    communicationService.setCurrentUserId(currentUser.id);
    
    // Subscribe to real-time sessions updates
    const unsubscribeSessions = communicationService.subscribeToSessions((newSessions) => {
      // Filter sessions to only show those that include current user
      const userSessions = newSessions.filter(session => 
        session.playerIds && session.playerIds.includes(currentUser.id)
      );
      
      setSessions(userSessions);
      
      // If active session no longer exists, clear it (but don't auto-select if user manually selected)
      if (activeSessionId && !userSessions.find(s => s.id === activeSessionId)) {
        // Only clear if user hasn't manually selected, otherwise keep it null
        if (!hasManuallySelected) {
          setActiveSessionId(null);
        } else {
          // If manually selected session is deleted, clear it
          setActiveSessionId(null);
          setHasManuallySelected(false);
        }
      }
    });
    
    return () => {
      unsubscribeSessions();
    };
  }, [currentUser, activeSessionId, hasManuallySelected]);

  // Auto-create or find default session on mount (only once)
  useEffect(() => {
    // Only auto-select if user hasn't manually selected a session AND we haven't initialized yet
    if (hasManuallySelected || hasInitialized) return;
    
    // Wait for sessions to load
    if (sessions.length === 0) return;

    const ensureDefaultSession = async () => {
      // Prioritize sessions with a coach assigned (active admin sessions)
      // Sort: sessions with coach first, then by date (most recent first)
      const sortedSessions = [...sessions].sort((a, b) => {
        const aHasCoach = a.coachId && a.coachId !== '';
        const bHasCoach = b.coachId && b.coachId !== '';
        
        // Sessions with coach come first
        if (aHasCoach && !bHasCoach) return -1;
        if (!aHasCoach && bHasCoach) return 1;
        
        // Then sort by date (most recent first)
        return b.date.getTime() - a.date.getTime();
      });

      // Find existing session for this user (prioritizing those with coaches)
      const existingSession = sortedSessions.find(session => 
        session.playerIds && session.playerIds.includes(currentUser.id)
      );

      if (existingSession) {
        // Only set if we don't already have this session selected
        if (activeSessionId !== existingSession.id) {
          setActiveSessionId(existingSession.id);
        }
        setHasInitialized(true);
      } else {
        // Only create a default session if user has no sessions at all
        const sessionId = crypto.randomUUID();
        const newSession: Session = {
          id: sessionId,
          title: 'Chat',
          date: new Date(),
          status: 'active',
          coachId: '',
          playerIds: [currentUser.id],
          tags: []
        };

        await communicationService.createSession(newSession);
        setActiveSessionId(sessionId);
        setHasInitialized(true);
      }
    };

    ensureDefaultSession();
  }, [sessions, currentUser.id, activeSessionId, hasManuallySelected, hasInitialized]);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }

    loadMessages(activeSessionId);
    
    // Subscribe to real-time updates
    const unsubscribe = communicationService.subscribe(activeSessionId, (newMessages) => {
      setMessages(newMessages);
    });

    // Also poll for cross-tab updates (fallback)
    const stopPolling = communicationService.startPolling(activeSessionId, (newMessages) => {
      setMessages(newMessages);
    });

    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [activeSessionId]);

  const loadMessages = async (sessionId: string) => {
    const sessionMessages = await communicationService.getMessages(sessionId);
    setMessages(sessionMessages);
  };

  const handleSendMessage = async (content: string, type: MessageType, metadata?: Message['metadata']) => {
    if (!activeSessionId || !currentUser) return;

    const newMessage: Message = {
      id: crypto.randomUUID(),
      sessionId: activeSessionId,
      senderId: currentUser.id,
      type,
      content,
      createdAt: new Date(),
      metadata,
    };

    await communicationService.sendMessage(activeSessionId, newMessage);
  };

  const handleUpdateMessage = async (messageId: string, updates: Partial<Message>) => {
    if (!activeSessionId) return;
    await communicationService.updateMessage(activeSessionId, messageId, updates);
  };

  // Handler for manual session selection
  const handleSelectSession = (sessionId: string) => {
    setHasManuallySelected(true);
    setHasInitialized(true); // Also mark as initialized to prevent auto-selection
    setActiveSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // Delete for all participants
      await communicationService.deleteSessionForAll(sessionId, currentUser.id);
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete session. Please check the console for details.');
    }
  };


  const activeSession = useMemo(() => {
    if (!activeSessionId || !sessions.length) return undefined;
    return sessions.find(s => s.id === activeSessionId);
  }, [activeSessionId, sessions]);
  
  const activeMessages = messages.filter(m => m.sessionId === activeSessionId);

  // Get coach user for header (first admin/coach found in messages, or default)
  const getCoachUser = (): User => {
    if (!currentUser) {
      return {
        id: 'admin',
        name: 'Admin',
        role: UserRole.COACH,
        avatarUrl: ''
      };
    }
    const coachMessage = messages.find(m => m.senderId !== currentUser.id);
    if (coachMessage) {
      // In a real app, you'd fetch the user by ID
      return {
        id: coachMessage.senderId,
        name: 'Admin',
        role: UserRole.COACH,
        avatarUrl: ''
      };
    }
    return {
      id: 'admin',
      name: 'Admin',
      role: UserRole.COACH,
      avatarUrl: ''
    };
  };


  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden font-sans text-white">
      {/* Top Navigation */}
      <div className="h-14 sm:h-16 border-b border-white/5 bg-black/80 backdrop-blur-xl flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30">
        {/* Left: Video Labs Branding */}
        <div className="flex items-center gap-2 sm:gap-3">
          <img 
            src={sequenceLogo} 
            alt="Sequence" 
            className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
          />
          <div className="hidden sm:block">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">{currentUser.name}</h2>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-w-0 w-full bg-black relative z-0 overflow-hidden">
        {/* SessionList sidebar */}
        <div className="hidden md:flex w-64 border-r border-white/5 bg-black/40 flex-shrink-0">
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            messages={messages}
            onDeleteSession={handleDeleteSession}
            currentUserId={currentUser.id}
          />
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0 w-full bg-black relative z-0 overflow-hidden">
          {activeSession ? (
            <>
              <SessionHeader 
                session={activeSession} 
                coach={getCoachUser()}
                onBackMobile={() => {}}
              />
              <div className="flex-1 overflow-hidden relative">
                <ChatInterface 
                  messages={activeMessages}
                  currentUser={currentUser}
                  onSendMessage={handleSendMessage}
                  onUpdateMessage={handleUpdateMessage}
                  otherUserName="Admin"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-sequence-muted p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-sequence-card flex items-center justify-center mb-4 border border-sequence-border">
                <div className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Loading...</h3>
              <p className="max-w-xs">Setting up your chat session.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

