import React, { useState, useEffect } from 'react';
import { AdminInterface } from './components/AdminInterface';
import { UserInterface } from './components/UserInterface';
import { Users, User as UserIcon } from 'lucide-react';

type ViewMode = 'admin' | 'user' | 'select';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('select');

  // Check URL hash for view mode
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'admin' || hash === 'user') {
      setViewMode(hash);
    }
  }, []);

  // Update URL hash when view changes
  useEffect(() => {
    if (viewMode !== 'select') {
      window.location.hash = viewMode;
    }
  }, [viewMode]);

  if (viewMode === 'select') {
    return (
      <div className="flex h-screen w-full bg-black items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="max-w-md w-full space-y-4 sm:space-y-6 p-4 sm:p-6 md:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">Sequence BioLab</h1>
            <p className="text-sm sm:text-base text-neutral-400">Select your view</p>
          </div>

          <button
            onClick={() => setViewMode('admin')}
            className="w-full p-4 sm:p-5 md:p-6 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-300 shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 flex flex-col items-center gap-3 group touch-manipulation"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="text-left w-full">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">Admin Panel</h2>
              <p className="text-xs sm:text-sm text-blue-100">Manage sessions and communicate with users</p>
            </div>
          </button>

          <button
            onClick={() => setViewMode('user')}
            className="w-full p-4 sm:p-5 md:p-6 rounded-2xl bg-gradient-to-br from-sequence-orange to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white transition-all duration-300 shadow-lg shadow-orange-900/20 hover:shadow-orange-900/40 flex flex-col items-center gap-3 group touch-manipulation"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="text-left w-full">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">Player 1 View</h2>
              <p className="text-xs sm:text-sm text-orange-100">View sessions and communicate with admin</p>
            </div>
          </button>

          <div className="pt-4 border-t border-neutral-800 text-center">
            <button
              onClick={() => {
                setViewMode('select');
                window.location.hash = '';
              }}
              className="text-xs sm:text-sm text-neutral-500 hover:text-neutral-300 transition-colors touch-manipulation py-2 px-4"
            >
              Switch view
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {viewMode === 'admin' && <AdminInterface />}
      {viewMode === 'user' && <UserInterface />}
    </>
  );
}

export default App;
