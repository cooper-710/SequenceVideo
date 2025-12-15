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
  const [coachUser, setCoachUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize communication service and load sessions
  useEffect(() => {
    communicationService.setCurrentUserId(currentUser.id);
    
    // Subscribe to real-time sessions updates
    const unsubscribeSessions = communicationService.subscribeToSessions((newSessions) => {
      // Filter sessions to only show those that include current user as a player
      const userSessions = newSessions.filter(session => 
        session.playerIds && session.playerIds.includes(currentUser.id)
      );
      
      setSessions(userSessions);
      
      // If active session no longer exists, clear it
      if (activeSessionId && !userSessions.find(s => s.id === activeSessionId)) {
        setActiveSessionId(null);
      }
    });
    
    return () => {
      unsubscribeSessions();
    };
  }, [currentUser.id, activeSessionId]);

  // Auto-select the most relevant session on mount
  useEffect(() => {
    if (isInitialized || sessions.length === 0) return;

    const selectBestSession = async () => {
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

      // Select the first session (best match)
      if (sortedSessions.length > 0) {
        const bestSession = sortedSessions[0];
        setActiveSessionId(bestSession.id);
        
        // Load coach user if session has a coach
        if (bestSession.coachId) {
          const coach = await communicationService.getPlayer(bestSession.coachId);
          if (coach) {
            setCoachUser(coach);
          }
        }
      } else {
        // No sessions exist - create a default one
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
      }
      
      setIsInitialized(true);
    };

    selectBestSession();
  }, [sessions, currentUser.id, isInitialized]);

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

  // Update coach user when active session changes
  useEffect(() => {
    const updateCoachUser = async () => {
      if (!activeSessionId) {
        setCoachUser(null);
        return;
      }

      const activeSession = sessions.find(s => s.id === activeSessionId);
      if (activeSession && activeSession.coachId) {
        const coach = await communicationService.getPlayer(activeSession.coachId);
        if (coach) {
          setCoachUser(coach);
        } else {
          // Fallback: create a default coach user object
          setCoachUser({
            id: activeSession.coachId,
            name: 'Admin',
            role: UserRole.COACH,
            avatarUrl: ''
          });
        }
      } else {
        setCoachUser(null);
      }
    };

    updateCoachUser();
  }, [activeSessionId, sessions]);

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
  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    
    // Load coach user for the selected session
    const selectedSession = sessions.find(s => s.id === sessionId);
    if (selectedSession && selectedSession.coachId) {
      const coach = await communicationService.getPlayer(selectedSession.coachId);
      if (coach) {
        setCoachUser(coach);
      } else {
        setCoachUser({
          id: selectedSession.coachId,
          name: 'Admin',
          role: UserRole.COACH,
          avatarUrl: ''
        });
      }
    } else {
      setCoachUser(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // Delete for all participants
      await communicationService.deleteSessionForAll(sessionId, currentUser.id);
      // If the deleted session was active, clear it
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
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

  // Default coach user for display
  const displayCoach = coachUser || {
    id: 'admin',
    name: 'Admin',
    role: UserRole.COACH,
    avatarUrl: ''
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
                coach={displayCoach}
                onBackMobile={() => {}}
              />
              <div className="flex-1 overflow-hidden relative">
                <ChatInterface 
                  messages={activeMessages}
                  currentUser={currentUser}
                  onSendMessage={handleSendMessage}
                  onUpdateMessage={handleUpdateMessage}
                  otherUserName={displayCoach.name}
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
