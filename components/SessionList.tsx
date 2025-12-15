import React, { useMemo } from 'react';
import { Session, Message, MessageType } from '../types';
import { format } from 'date-fns';
import { Film, Trash2, X } from 'lucide-react';

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  messages?: Message[]; // Optional: if provided, will extract video thumbnails
  onDeleteSession?: (sessionId: string) => void; // Optional: callback for deletion
  currentUserId?: string; // Optional: current user ID for deletion
}

// Helper function to get video thumbnail for a session
const getSessionThumbnail = (sessionId: string, messages?: Message[]): string | null => {
  if (!messages) return null;
  
  // Find first video message in this session
  const videoMessage = messages
    .filter(m => m.sessionId === sessionId && m.type === MessageType.VIDEO)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  
  if (!videoMessage) return null;
  
  // Use thumbnailUrl from metadata if available
  if (videoMessage.metadata?.thumbnailUrl) {
    return videoMessage.metadata.thumbnailUrl;
  }
  
  // For video URLs, we can't generate a thumbnail client-side easily
  // In production, you'd want to generate thumbnails server-side
  // For now, return null to show placeholder
  return null;
};

export const SessionList: React.FC<SessionListProps> = ({ 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  messages,
  onDeleteSession,
  currentUserId
}) => {
  const [hoveredSessionId, setHoveredSessionId] = React.useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // Prevent session selection
    if (showDeleteConfirm === sessionId) {
      // Confirm deletion
      if (onDeleteSession) {
        onDeleteSession(sessionId);
      }
      setShowDeleteConfirm(null);
    } else {
      // Show confirmation
      setShowDeleteConfirm(sessionId);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowDeleteConfirm(null), 3000);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(null);
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* List */}
      <div className="overflow-y-auto flex-1 px-2 sm:px-3 py-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="text-xs sm:text-sm text-neutral-500 py-4 text-center">
            No sessions available
          </div>
        ) : (
          sessions.map((session) => {
          const isActive = activeSessionId === session.id;
          const thumbnailUrl = getSessionThumbnail(session.id, messages);
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
                onClick={() => {
                  if (!isConfirmingDelete) {
                    onSelectSession(session.id);
                  }
                }}
                className={`w-full text-left p-2 sm:p-2.5 rounded-xl transition-all duration-200 relative touch-manipulation min-h-[60px] ${
                  isActive 
                    ? 'bg-white/10 shadow-sm ring-1 ring-white/10' 
                    : 'hover:bg-white/5 active:bg-white/10'
                } ${isConfirmingDelete ? 'ring-2 ring-red-500/50' : ''}`}
              >
                <div className="flex gap-2.5 sm:gap-3.5 items-center">
                  {/* Thumbnail */}
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800 ring-1 ring-white/10 group-hover:ring-white/20 transition-all">
                    {hasVideo ? (
                      <div 
                        className="absolute inset-0 bg-cover bg-center opacity-80 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundImage: `url(${thumbnailUrl})` }} 
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                        <Film className="w-5 h-5 text-neutral-600" />
                      </div>
                    )}
                    {/* Status Dot */}
                    {session.status === 'new_feedback' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-sequence-orange rounded-full shadow-[0_0_8px_rgba(249,115,22,0.8)] border border-black/20" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <h3 className={`text-xs sm:text-sm font-semibold truncate transition-colors ${isActive ? 'text-white' : 'text-neutral-300 group-hover:text-white'}`}>
                      {session.title}
                    </h3>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                       <span className="text-[10px] sm:text-[11px] font-medium text-neutral-500 uppercase tracking-wide">{format(session.date, 'MMM d')}</span>
                       <span className="w-0.5 h-0.5 rounded-full bg-neutral-600" />
                       <span className={`text-[9px] sm:text-[10px] px-1.5 py-px rounded-md border transition-colors ${
                         isActive 
                          ? 'bg-sequence-orange/10 border-sequence-orange/20 text-sequence-orange' 
                          : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                       }`}>
                        {session.tags[0]}
                       </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Delete Button - appears on hover */}
              {onDeleteSession && currentUserId && (
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
                        onClick={handleCancelDelete}
                        className="p-1 hover:bg-neutral-700/50 rounded transition-colors"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5 text-neutral-400" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleDeleteClick(e, session.id)}
                      className="p-1.5 rounded-lg bg-neutral-800/90 hover:bg-red-500/20 border border-neutral-700 hover:border-red-500/50 transition-all group/delete"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-neutral-400 group-hover/delete:text-red-400 transition-colors" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        }))}
      </div>
    </div>
  );
};
