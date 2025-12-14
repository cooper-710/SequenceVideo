import React, { useState, useEffect, useRef } from 'react';
import { ChatInterface } from './ChatInterface';
import { SessionHeader } from './SessionHeader';
import { Session, Message, MessageType, User, UserRole } from '../types';
import { communicationService } from '../services/communicationService';
import { Video, Plus, ChevronDown, Film, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import sequenceLogo from '../Sequence.png';

interface UserInterfaceProps {
  currentUser: User;
}

export const UserInterface: React.FC<UserInterfaceProps> = ({ currentUser }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Load sessions on mount
  useEffect(() => {
    // Set current user ID for filtered sessions
    communicationService.setCurrentUserId(currentUser.id);
    
    loadAllMessages();
    
    // Subscribe to real-time sessions updates
    const unsubscribeSessions = communicationService.subscribeToSessions((newSessions) => {
      // Filter sessions to only show those that include current user
      const userSessions = newSessions.filter(session => 
        session.playerIds && session.playerIds.includes(currentUser.id)
      );
      
      // Get current active session ID from ref for synchronous check
      const currentActiveId = activeSessionIdRef.current;
      
      // DO NOT modify activeSessionId here - only the button click can change it
      // Ensure active session is in the sessions array so activeSession can find it
      // This prevents activeSession from becoming undefined when sessions update
      let sessionsToSet = [...userSessions];
      if (currentActiveId) {
        const activeSessionInFiltered = userSessions.find(s => s.id === currentActiveId);
        const activeSessionInOriginal = newSessions.find(s => s.id === currentActiveId);
        
        // If active session exists in original but not in filtered, include it anyway
        // This ensures the UI can still display the selected session even if filtering excludes it
        if (!activeSessionInFiltered && activeSessionInOriginal) {
          sessionsToSet.push(activeSessionInOriginal);
        }
      }
      
      setSessions(sessionsToSet);
    });

    // Poll for messages (less frequent now with real-time sessions)
    const interval = setInterval(() => {
      loadAllMessages();
    }, 10000); // Increased interval since sessions are now real-time
    
    return () => {
      unsubscribeSessions();
      clearInterval(interval);
    };
  }, [currentUser]);

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

  // Removed loadSessions - now handled by real-time subscription

  const loadAllMessages = async () => {
    // Load messages from all sessions for thumbnail generation
    const allSessions = await communicationService.getSessions();
    const allMsgs: Message[] = [];
    for (const session of allSessions) {
      const sessionMessages = await communicationService.getMessages(session.id);
      allMsgs.push(...sessionMessages);
    }
    setAllMessages(allMsgs);
  };

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

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setSessionDropdownOpen(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    // Delete session only for current user (like iMessage)
    if (currentUser) {
      try {
        await communicationService.deleteSessionForUser(currentUser.id, sessionId);
        // Sessions will update automatically via real-time subscription
        // If the deleted session was active, clear it
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
        }
        setShowDeleteConfirm(null);
      } catch (error) {
        console.error('Error deleting session:', error);
        alert('Failed to delete session. Please try again.');
      }
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (showDeleteConfirm === sessionId) {
      await handleDeleteSession(sessionId);
    } else {
      setShowDeleteConfirm(sessionId);
      setTimeout(() => setShowDeleteConfirm(null), 3000);
    }
  };

  const getSessionThumbnail = (sessionId: string): string | null => {
    const videoMessage = allMessages
      .filter(m => m.sessionId === sessionId && m.type === MessageType.VIDEO)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    
    if (!videoMessage) return null;
    return videoMessage.metadata?.thumbnailUrl || null;
  };

  const handleCreateSession = async () => {
    if (!newSessionTitle.trim() || !currentUser) return;

    const sessionId = crypto.randomUUID();
    const newSession: Session = {
      id: sessionId,
      title: newSessionTitle,
      date: new Date(),
      status: 'active',
      coachId: '', // Will be assigned to admin when they join
      playerIds: [currentUser.id],
      tags: []
    };

    await communicationService.createSession(newSession);
    setNewSessionTitle('');
    setShowCreateSession(false);
    // DO NOT auto-select new session - user must manually select it via button
    // Sessions will update automatically via real-time subscription
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
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

        {/* Center/Right: Session Selector & Create Button */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end">
          {/* Session Dropdown */}
          <div className="relative">
            <button
              onClick={() => setSessionDropdownOpen(!sessionDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white min-w-[120px] sm:min-w-[180px]"
            >
              {activeSession ? (
                <>
                  <span className="truncate">{activeSession.title}</span>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${sessionDropdownOpen ? 'rotate-180' : ''}`} />
                </>
              ) : (
                <>
                  <span className="text-neutral-400">Select session</span>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${sessionDropdownOpen ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            {/* Dropdown Menu */}
            {sessionDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setSessionDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#0a0a0a] border border-[#222] rounded-xl shadow-xl z-50 max-h-[60vh] overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {sessions.map((session) => {
                      const isActive = activeSessionId === session.id;
                      const thumbnailUrl = getSessionThumbnail(session.id);
                      const hasVideo = thumbnailUrl !== null;
                      const isHovered = hoveredSessionId === session.id;
                      const isConfirmingDelete = showDeleteConfirm === session.id;

                      return (
                        <div
                          key={session.id}
                          onMouseEnter={() => setHoveredSessionId(session.id)}
                          onMouseLeave={() => {
                            setHoveredSessionId(null);
                            if (!isConfirmingDelete) {
                              setShowDeleteConfirm(null);
                            }
                          }}
                          className="relative group"
                        >
                          <button
                            onClick={() => handleSelectSession(session.id)}
                            className={`w-full text-left p-2.5 rounded-xl transition-all duration-200 relative ${
                              isActive 
                                ? 'bg-white/10 shadow-sm ring-1 ring-white/10' 
                                : 'hover:bg-white/5 active:bg-white/10'
                            } ${isConfirmingDelete ? 'ring-2 ring-red-500/50' : ''}`}
                          >
                            <div className="flex gap-3 items-center">
                              {/* Thumbnail */}
                              <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800 ring-1 ring-white/10">
                                {hasVideo ? (
                                  <div 
                                    className="absolute inset-0 bg-cover bg-center"
                                    style={{ backgroundImage: `url(${thumbnailUrl})` }} 
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                                    <Film className="w-5 h-5 text-neutral-600" />
                                  </div>
                                )}
                                {session.status === 'new_feedback' && (
                                  <div className="absolute top-1 right-1 w-2 h-2 bg-sequence-orange rounded-full shadow-[0_0_8px_rgba(249,115,22,0.8)] border border-black/20" />
                                )}
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0 py-0.5">
                                <h3 className={`text-xs sm:text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                                  {session.title}
                                </h3>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide">{format(session.date, 'MMM d')}</span>
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* Delete Button */}
                          {currentUser && (
                            <div className={`absolute right-2 top-1/2 -translate-y-1/2 transition-all duration-200 ${
                              isHovered || isConfirmingDelete ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
                            }`}>
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/50 rounded-lg px-2 py-1">
                                  <button
                                    onClick={(e) => handleDeleteClick(e, session.id)}
                                    className="p-1 hover:bg-red-500/30 rounded transition-colors"
                                    title="Confirm delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowDeleteConfirm(null);
                                    }}
                                    className="p-1 hover:bg-neutral-700/50 rounded transition-colors"
                                    title="Cancel"
                                  >
                                    <X className="w-3.5 h-3.5 text-neutral-400" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => handleDeleteClick(e, session.id)}
                                  className="p-1.5 rounded-lg bg-neutral-800/90 hover:bg-red-500/20 border border-neutral-700 hover:border-red-500/50 transition-all"
                                  title="Delete session"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-neutral-400 group-hover:text-red-400 transition-colors" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Create Session Button */}
          {!showCreateSession ? (
            <button 
              onClick={() => setShowCreateSession(true)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border border-dashed border-neutral-700 text-neutral-400 text-xs sm:text-sm font-medium hover:border-sequence-orange/50 hover:text-sequence-orange hover:bg-sequence-orange/5 transition-all duration-200 flex items-center gap-2 group touch-manipulation"
            >
              <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-sequence-orange group-hover:text-white transition-colors">
                <Plus className="w-3 h-3" />
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSession();
                  if (e.key === 'Escape') {
                    setShowCreateSession(false);
                    setNewSessionTitle('');
                  }
                }}
                placeholder="Session title..."
                className="px-3 py-1.5 sm:py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-sequence-orange text-sm w-40 sm:w-48 min-h-[36px]"
                autoFocus
              />
              <button
                onClick={handleCreateSession}
                className="px-3 py-1.5 sm:py-2 rounded-lg bg-sequence-orange hover:bg-orange-600 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation min-h-[36px]"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateSession(false);
                  setNewSessionTitle('');
                }}
                className="px-3 py-1.5 sm:py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation min-h-[36px]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 w-full bg-black relative z-0 overflow-hidden">
        {activeSession ? (
          <>
            <SessionHeader 
              session={activeSession} 
              coach={getCoachUser()}
              onBackMobile={() => setActiveSessionId(null)}
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
              <Video className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Session Selected</h3>
            <p className="max-w-xs">Select a session from the dropdown above or create a new one to start.</p>
          </div>
        )}
      </div>
    </div>
  );
};

