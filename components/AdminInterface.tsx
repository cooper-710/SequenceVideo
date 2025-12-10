import React, { useState, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { SessionHeader } from './SessionHeader';
import { Session, Message, MessageType, User, UserRole } from '../types';
import { communicationService } from '../services/communicationService';
import { createUserWithToken } from '../services/authService';
import { Plus, Users, Video, ChevronDown, Film, Trash2, X, Check } from 'lucide-react';
import { format } from 'date-fns';
import sequenceLogo from '../Sequence.png';

interface AdminInterfaceProps {
  currentUser: User;
}

// Helper function to get two initials from a name
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // Multiple words: first letter of first word + first letter of last word
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    // Single word with 2+ characters: first two letters
    return parts[0].substring(0, 2).toUpperCase();
  } else {
    // Single character: just that character
    return parts[0].charAt(0).toUpperCase();
  }
};

export const AdminInterface: React.FC<AdminInterfaceProps> = ({ currentUser }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [players, setPlayers] = useState<User[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const [showDeletePlayerConfirm, setShowDeletePlayerConfirm] = useState<string | null>(null);
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Load sessions, messages, and players on mount
  useEffect(() => {
    // Set current user ID for filtered sessions
    communicationService.setCurrentUserId(currentUser.id);
    
    loadAllMessages();
    loadPlayers();
    
    // Subscribe to real-time sessions updates
    const unsubscribeSessions = communicationService.subscribeToSessions((newSessions) => {
      setSessions(newSessions);
    });

    // Poll for players and messages (less frequent now with real-time sessions)
    const interval = setInterval(() => {
      loadAllMessages();
      loadPlayers();
    }, 10000); // Increased interval since sessions are now real-time
    
    return () => {
      unsubscribeSessions();
      clearInterval(interval);
    };
  }, [currentUser]);

  // Clear active session when player selection changes (new flow: player first)
  useEffect(() => {
    if (!selectedPlayerId) {
      setActiveSessionId(null);
    }
  }, [selectedPlayerId]);

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

    // Also poll for cross-tab updates
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

  const loadPlayers = async () => {
    const allPlayers = await communicationService.getPlayers();
    setPlayers(allPlayers);
  };

  const handleCreateSession = async () => {
    if (!newSessionTitle.trim() || !selectedPlayerId) return;

    // Generate UUID v4
    const sessionId = crypto.randomUUID();
    const newSession: Session = {
      id: sessionId,
      title: newSessionTitle,
      date: new Date(),
      status: 'active',
      coachId: currentUser.id,
      playerIds: [selectedPlayerId],
      tags: ['New Session']
    };

    await communicationService.createSession(newSession);
    setNewSessionTitle('');
    setShowCreateSession(false);
    setActiveSessionId(newSession.id);
    // Sessions will update automatically via real-time subscription
  };

  const handleCreatePlayer = async () => {
    if (!newPlayerName.trim()) return;

    // Create player using authService
    const result = await createUserWithToken(newPlayerName.trim(), UserRole.PLAYER);
    
    if (result && result.user) {
      setNewPlayerName('');
      setShowCreatePlayer(false);
      await loadPlayers();
      // Select the newly created player
      setSelectedPlayerId(result.user.id);
      setPlayerDropdownOpen(false);
    } else {
      console.error('Failed to create player');
      alert('Failed to create player. Check the console for details. Make sure you have run the SQL policies in Supabase (see add-delete-policy.sql).');
    }
  };

  const handlePlayerSelectionChange = (playerId: string | null) => {
    // If clicking the same player, just close the dropdown (don't deselect)
    if (selectedPlayerId === playerId) {
      setPlayerDropdownOpen(false);
      return;
    }
    // Select the new player
    setSelectedPlayerId(playerId);
    // Clear active session when player selection changes
    setActiveSessionId(null);
    setPlayerDropdownOpen(false);
  };

  const handleSendMessage = async (content: string, type: MessageType, metadata?: Message['metadata']) => {
    if (!activeSessionId) return;

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

  const handleDeleteSession = (sessionId: string) => {
    // Delete session only for the admin user (like iMessage)
    communicationService.deleteSessionForUser(currentUser.id, sessionId);
    // Sessions will update automatically via real-time subscription
    // If the deleted session was active, clear it
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
    setShowDeleteConfirm(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (showDeleteConfirm === sessionId) {
      handleDeleteSession(sessionId);
    } else {
      setShowDeleteConfirm(sessionId);
      setTimeout(() => setShowDeleteConfirm(null), 3000);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    try {
      await communicationService.deletePlayer(playerId);
      // If the deleted player was selected, clear the selection
      if (selectedPlayerId === playerId) {
        setSelectedPlayerId(null);
        setActiveSessionId(null);
      }
      // Reload players to reflect deletion
      await loadPlayers();
      setShowDeletePlayerConfirm(null);
    } catch (error) {
      console.error('Failed to delete player:', error);
      // Keep the confirmation state so user can try again
      alert('Failed to delete player. Please check the console for details.');
    }
  };

  const handleDeletePlayerClick = (e: React.MouseEvent, playerId: string) => {
    e.stopPropagation();
    if (showDeletePlayerConfirm === playerId) {
      handleDeletePlayer(playerId);
    } else {
      setShowDeletePlayerConfirm(playerId);
      setTimeout(() => setShowDeletePlayerConfirm(null), 3000);
    }
  };

  const getSessionThumbnail = (sessionId: string): string | null => {
    const videoMessage = allMessages
      .filter(m => m.sessionId === sessionId && m.type === MessageType.VIDEO)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    
    if (!videoMessage) return null;
    return videoMessage.metadata?.thumbnailUrl || null;
  };

  // Filter sessions by selected player
  const filteredSessions = selectedPlayerId
    ? sessions.filter(session => 
        session.playerIds && 
        session.playerIds.includes(selectedPlayerId)
      )
    : [];

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const activeMessages = messages.filter(m => m.sessionId === activeSessionId);

  const selectedPlayer = players.find(p => p.id === selectedPlayerId);

  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden font-sans text-white">
      {/* Top Navigation */}
      <div className="h-14 sm:h-16 border-b border-white/5 bg-black/80 backdrop-blur-xl flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30">
        {/* Left: Admin Panel Branding */}
        <div className="flex items-center gap-2 sm:gap-3">
          <img 
            src={sequenceLogo} 
            alt="Sequence" 
            className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
          />
          <div className="hidden sm:block">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Admin</h2>
          </div>
        </div>

        {/* Center/Right: Session Selector, Player Selector & Create Button */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end">
          {/* Session Dropdown - Only show if a player is selected */}
          {selectedPlayerId && (
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

              {/* Session Dropdown Menu */}
              {sessionDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setSessionDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#0a0a0a] border border-[#222] rounded-xl shadow-xl z-50 max-h-[60vh] overflow-y-auto">
                    <div className="p-2 space-y-1">
                      {filteredSessions.length === 0 ? (
                        <div className="text-xs sm:text-sm text-neutral-500 py-4 text-center">
                          No sessions available
                        </div>
                      ) : (
                        filteredSessions.map((session) => {
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
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Player Dropdown */}
          <div className="relative">
            <button
              onClick={() => setPlayerDropdownOpen(!playerDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white min-w-[120px] sm:min-w-[150px]"
            >
              {selectedPlayer ? (
                <>
                  <div className="w-6 h-6 rounded-full bg-orange-500 border border-neutral-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(selectedPlayer.name)}
                  </div>
                  <span className="truncate">{selectedPlayer.name}</span>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform flex-shrink-0 ${playerDropdownOpen ? 'rotate-180' : ''}`} />
                </>
              ) : (
                <>
                  <span className="text-neutral-400">Select player</span>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform flex-shrink-0 ${playerDropdownOpen ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            {/* Player Dropdown Menu */}
            {playerDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setPlayerDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-[#0a0a0a] border border-[#222] rounded-xl shadow-xl z-50 max-h-[60vh] overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {!showCreatePlayer ? (
                      <>
                        {players.length === 0 ? (
                          <div className="text-xs sm:text-sm text-neutral-500 py-4 text-center">
                            No players available
                          </div>
                        ) : (
                          players.map((player) => {
                            const isSelected = selectedPlayerId === player.id;
                            const isHovered = hoveredPlayerId === player.id;
                            const isConfirmingDelete = showDeletePlayerConfirm === player.id;
                            return (
                              <div
                                key={player.id}
                                onMouseEnter={() => setHoveredPlayerId(player.id)}
                                onMouseLeave={() => {
                                  setHoveredPlayerId(null);
                                  if (!isConfirmingDelete) {
                                    setShowDeletePlayerConfirm(null);
                                  }
                                }}
                                className="relative group"
                              >
                                <button
                                  onClick={() => handlePlayerSelectionChange(player.id)}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 relative ${
                                    isSelected
                                      ? 'bg-orange-500/10 border-orange-500/50 hover:bg-orange-500/15'
                                      : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800/50 hover:border-neutral-600'
                                  } ${isConfirmingDelete ? 'ring-2 ring-red-500/50' : ''}`}
                                >
                                  <div className="relative flex-shrink-0">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-orange-500 border-2 border-neutral-700 flex items-center justify-center text-white text-xs sm:text-sm font-bold">
                                      {getInitials(player.name)}
                                    </div>
                                    {isSelected && (
                                      <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-orange-500 border-2 border-neutral-900 flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <div className="text-xs sm:text-sm font-medium text-white truncate">
                                      {player.name}
                                    </div>
                                    <div className="text-[10px] sm:text-xs text-neutral-500 truncate">
                                      {player.role}
                                    </div>
                                  </div>
                                </button>

                                {/* Delete Button */}
                                <div className={`absolute right-2 top-1/2 -translate-y-1/2 transition-all duration-200 ${
                                  isHovered || isConfirmingDelete ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
                                }`}>
                                  {isConfirmingDelete ? (
                                    <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/50 rounded-lg px-2 py-1">
                                      <button
                                        onClick={(e) => handleDeletePlayerClick(e, player.id)}
                                        className="p-1 hover:bg-red-500/30 rounded transition-colors"
                                        title="Confirm delete"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowDeletePlayerConfirm(null);
                                        }}
                                        className="p-1 hover:bg-neutral-700/50 rounded transition-colors"
                                        title="Cancel"
                                      >
                                        <X className="w-3.5 h-3.5 text-neutral-400" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => handleDeletePlayerClick(e, player.id)}
                                      className="p-1.5 rounded-lg bg-neutral-800/90 hover:bg-red-500/20 border border-neutral-700 hover:border-red-500/50 transition-all"
                                      title="Delete player"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-neutral-400 group-hover:text-red-400 transition-colors" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                        {/* Add Player Button */}
                        <button
                          onClick={() => setShowCreatePlayer(true)}
                          className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-neutral-700 text-neutral-400 text-xs sm:text-sm font-medium hover:border-orange-500/50 hover:text-orange-400 hover:bg-orange-500/5 transition-all duration-200 mt-2"
                        >
                          <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center">
                            <Plus className="w-3 h-3" />
                          </div>
                          Add Player
                        </button>
                      </>
                    ) : (
                      <div className="space-y-2 p-2">
                        <input
                          type="text"
                          value={newPlayerName}
                          onChange={(e) => setNewPlayerName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreatePlayer();
                            if (e.key === 'Escape') {
                              setShowCreatePlayer(false);
                              setNewPlayerName('');
                            }
                          }}
                          placeholder="Player name..."
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 text-sm min-h-[36px]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCreatePlayer}
                            className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation min-h-[36px]"
                          >
                            Create
                          </button>
                          <button
                            onClick={() => {
                              setShowCreatePlayer(false);
                              setNewPlayerName('');
                            }}
                            className="flex-1 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation min-h-[36px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Create Session Button - Only show if a player is selected */}
          {selectedPlayerId && (
            <>
              {!showCreateSession ? (
                <button 
                  onClick={() => setShowCreateSession(true)}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border border-dashed border-neutral-700 text-neutral-400 text-xs sm:text-sm font-medium hover:border-orange-500/50 hover:text-orange-400 hover:bg-orange-500/5 transition-all duration-200 flex items-center gap-2 group touch-manipulation"
                >
                  <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <Plus className="w-3 h-3" />
                  </div>
                  <span className="hidden sm:inline">New Session</span>
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
                    className="px-3 py-1.5 sm:py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 text-sm w-40 sm:w-48 min-h-[36px]"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateSession}
                    className="px-3 py-1.5 sm:py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-medium transition-colors touch-manipulation min-h-[36px]"
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
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 w-full bg-black relative z-0 overflow-hidden">
        {activeSession ? (
          <>
            <SessionHeader 
              session={activeSession} 
              coach={currentUser}
              onBackMobile={() => setActiveSessionId(null)}
            />
            <div className="flex-1 overflow-hidden relative">
              {/* Chat Interface */}
              <ChatInterface 
                messages={activeMessages}
                currentUser={currentUser}
                onSendMessage={handleSendMessage}
                onUpdateMessage={handleUpdateMessage}
                otherUserName={selectedPlayerId
                  ? players.find(p => p.id === selectedPlayerId)?.name || 'User'
                  : 'User'
                }
              />
            </div>
          </>
        ) : !selectedPlayerId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-sequence-muted p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-sequence-card flex items-center justify-center mb-4 border border-sequence-border">
              <Users className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Select a Player</h3>
            <p className="max-w-xs">Choose a player from the dropdown above to view or create sessions.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-sequence-muted p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-sequence-card flex items-center justify-center mb-4 border border-sequence-border">
              <Video className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Session Selected</h3>
            <p className="max-w-xs">Select a session from the dropdown above or create a new one to start communicating.</p>
          </div>
        )}
      </div>
    </div>
  );
};

