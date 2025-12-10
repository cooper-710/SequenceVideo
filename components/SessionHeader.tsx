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
    <div className="h-14 sm:h-16 border-b border-white/5 bg-black/80 backdrop-blur-xl flex items-center justify-between px-3 sm:px-4 sticky top-0 z-20">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white leading-tight tracking-wide truncate">{session.title}</h1>
            <span className="hidden sm:inline-flex w-1.5 h-1.5 rounded-full bg-sequence-orange/80 shadow-[0_0_6px_rgba(249,115,22,0.5)] flex-shrink-0" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
             <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-medium text-neutral-500">
               <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-neutral-600 flex-shrink-0" />
               <span className="hidden xs:inline">{format(session.date, 'MMMM d, yyyy')}</span>
               <span className="xs:hidden">{format(session.date, 'MMM d')}</span>
             </div>
          </div>
        </div>
      </div>

    </div>
  );
};
