import React, { useState, useEffect } from 'react';
import { AdminInterface } from './components/AdminInterface';
import { UserInterface } from './components/UserInterface';
import { Users, User as UserIcon } from 'lucide-react';
import { extractPlayerNameFromUrl, getStoredToken, storeToken, getUserFromToken, getFirstAdminUser, getPlayerByName } from './services/authService';
import { User, UserRole } from './types';

type ViewMode = 'admin' | 'user' | 'select' | 'loading' | 'invalid';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Check for token in URL or localStorage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const path = window.location.pathname;
      
      // Check if accessing admin directly (no token needed)
      if (path === '/admin' || path.startsWith('/admin/')) {
        // Try to get admin user
        const adminUser = await getFirstAdminUser();
        if (adminUser) {
          setCurrentUser(adminUser);
          setViewMode('admin');
          return;
        }
        // If no admin found, show invalid with helpful message
        console.error('No admin user found. Please ensure at least one user with role "COACH" exists in the database.');
        setViewMode('invalid');
        return;
      }
      
      // Check if accessing player via name-based link: /player/{playerName}
      const playerName = extractPlayerNameFromUrl();
      
      if (playerName) {
        // Get player user by name
        const user = await getPlayerByName(playerName);
        
        if (user) {
          setCurrentUser(user);
          // Store user ID in localStorage for persistence (using name as key)
          localStorage.setItem('player_name', playerName);
          // Players always use 'user' view mode
          setViewMode('user');
          return;
        } else {
          // Player name not found
          setViewMode('invalid');
          return;
        }
      }
      
      // If no URL player name, try stored player name (for players)
      const storedPlayerName = localStorage.getItem('player_name');
      if (storedPlayerName) {
        const user = await getPlayerByName(storedPlayerName);
        if (user) {
          setCurrentUser(user);
          setViewMode('user');
          return;
        }
      }
      
      // Fallback: try stored token (for backward compatibility)
      const storedToken = getStoredToken();
      if (storedToken) {
        const user = await getUserFromToken(storedToken);
        if (user) {
          setCurrentUser(user);
          setViewMode(user.role === UserRole.COACH ? 'admin' : 'user');
          return;
        }
      }
      
      // No valid token found - show select screen
      setViewMode('select');
    };

    initializeAuth();
  }, []);

  // Update URL hash when view changes (for non-token access)
  useEffect(() => {
    if (viewMode !== 'select' && viewMode !== 'loading' && viewMode !== 'invalid') {
      window.location.hash = viewMode;
    }
  }, [viewMode]);

  if (viewMode === 'loading') {
    return (
      <div className="flex h-screen w-full bg-black items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  if (viewMode === 'invalid') {
    const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
    return (
      <div className="flex h-screen w-full bg-black items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            {isAdminPath ? 'Admin Access Unavailable' : 'Invalid Access Link'}
          </h1>
          <p className="text-neutral-400 mb-6">
            {isAdminPath 
              ? 'No admin user found in the database. Please ensure at least one user with role "COACH" exists. Check the browser console for more details.'
              : 'The link you used is not valid. Please contact your administrator for a new access link.'}
          </p>
          <button
            onClick={() => {
              window.location.href = window.location.origin;
            }}
            className="px-6 py-2 bg-sequence-orange text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'select') {
    return (
      <div className="flex h-screen w-full bg-black items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="max-w-md w-full space-y-4 sm:space-y-6 p-4 sm:p-6 md:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">Sequence BioLab</h1>
            <p className="text-sm sm:text-base text-neutral-400">Access via your unique link</p>
            <p className="text-xs text-neutral-500 mt-2">Contact your administrator for access</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {viewMode === 'admin' && currentUser && <AdminInterface currentUser={currentUser} />}
      {viewMode === 'user' && currentUser && <UserInterface currentUser={currentUser} />}
    </>
  );
}

export default App;
