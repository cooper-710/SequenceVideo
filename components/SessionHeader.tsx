import React from 'react';
import { Session, User } from '../types';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface SessionHeaderProps {
  session: Session;
  coach: User;
  onBackMobile: () => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({ session, coach, onBackMobile }) => {
  return (
    <div className="h-16 sm:h-20 border-b border-white/[0.03] bg-gradient-to-b from-black/95 via-black/90 to-black/95 backdrop-blur-2xl flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-white leading-tight tracking-tight truncate">
              {session.title}
            </h1>
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <span className="w-1 h-1 rounded-full bg-sequence-orange/60 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-neutral-400 tracking-wide">
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-500/60 flex-shrink-0" />
              <span className="hidden sm:inline font-normal">{format(session.date, 'MMMM d, yyyy')}</span>
              <span className="sm:hidden">{format(session.date, 'MMM d, yyyy')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
