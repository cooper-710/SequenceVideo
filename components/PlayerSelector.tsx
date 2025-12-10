import React from 'react';
import { User } from '../types';
import { Check, Users } from 'lucide-react';

interface PlayerSelectorProps {
  players: User[];
  selectedPlayerId: string | null;
  onSelectionChange: (playerId: string | null) => void;
  className?: string;
}

export const PlayerSelector: React.FC<PlayerSelectorProps> = ({
  players,
  selectedPlayerId,
  onSelectionChange,
  className = ''
}) => {
  const selectPlayer = (playerId: string) => {
    // If clicking the same player, deselect. Otherwise, select the new player.
    if (selectedPlayerId === playerId) {
      onSelectionChange(null);
    } else {
      onSelectionChange(playerId);
    }
  };

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
        <h3 className="text-xs sm:text-sm font-semibold text-white">Select Player</h3>
      </div>
      
      <div className="space-y-1.5 sm:space-y-2">
        {players.length === 0 ? (
          <div className="text-xs sm:text-sm text-neutral-500 py-3 sm:py-4 text-center">
            No players available
          </div>
        ) : (
          players.map((player) => {
            const isSelected = selectedPlayerId === player.id;
            return (
              <button
                key={player.id}
                onClick={() => selectPlayer(player.id)}
                className={`
                  w-full flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border transition-all duration-200 touch-manipulation min-h-[56px] sm:min-h-[60px]
                  ${isSelected
                    ? 'bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/15 active:bg-blue-500/20'
                    : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800/50 hover:border-neutral-600 active:bg-neutral-800'
                  }
                `}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500/80 to-blue-600/80 border-2 border-neutral-700 flex items-center justify-center text-white text-xs sm:text-sm font-bold">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  {isSelected && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-500 border-2 border-neutral-900 flex items-center justify-center">
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
            );
          })
        )}
      </div>
    </div>
  );
};

