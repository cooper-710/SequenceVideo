import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';

/**
 * Generate a secure random token
 */
export const generateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Get user from token (link-based auth)
 */
export const getUserFromToken = async (token: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      role: data.role as UserRole,
      avatarUrl: data.avatar_url || ''
    };
  } catch (error) {
    console.error('Error getting user from token:', error);
    return null;
  }
};

/**
 * Get player user by name (for name-based player links)
 */
export const getPlayerByName = async (playerName: string): Promise<User | null> => {
  // Decode URL-encoded name (handles spaces, special chars, etc.)
  const decodedName = decodeURIComponent(playerName);
  
  // TEMPORARY: Fallback for when Supabase is not configured
  if (!isSupabaseConfigured()) {
    console.warn('Supabase is not configured, using fallback player');
    return {
      id: `player-${decodedName.toLowerCase().replace(/\s+/g, '-')}`,
      name: decodedName,
      role: UserRole.PLAYER,
      avatarUrl: ''
    };
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', decodedName)
      .eq('role', UserRole.PLAYER)
      .limit(1);

    if (error) {
      console.error('Error querying player by name:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.warn(`Player "${decodedName}" not found in database`);
      return null;
    }

    const player = data[0];
    return {
      id: player.id,
      name: player.name,
      role: player.role as UserRole,
      avatarUrl: player.avatar_url || ''
    };
  } catch (error) {
    console.error('Error getting player by name:', error);
    return null;
  }
};

/**
 * Create a new user with a token
 */
export const createUserWithToken = async (
  name: string,
  role: UserRole
): Promise<{ user: User; token: string } | null> => {
  try {
    const token = generateToken();
    const { data, error } = await supabase
      .from('users')
      .insert({
        token,
        name,
        role,
        avatar_url: ''
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return null;
    }

    if (!data) {
      console.error('No data returned from user creation');
      return null;
    }

    return {
      user: {
        id: data.id,
        name: data.name,
        role: data.role as UserRole,
        avatarUrl: data.avatar_url || ''
      },
      token
    };
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
};

/**
 * Get or create user from token
 */
export const getOrCreateUserFromToken = async (token: string): Promise<User | null> => {
  const user = await getUserFromToken(token);
  if (user) {
    return user;
  }
  return null;
};

/**
 * Extract player name from URL
 * Player links use format: /player/{playerName}
 * Admin access is direct via /admin (no token needed)
 */
export const extractPlayerNameFromUrl = (): string | null => {
  const path = window.location.pathname;
  
  // Check URL path: /player/{playerName}
  const pathMatch = path.match(/\/player\/([^/]+)/);
  if (pathMatch) {
    return pathMatch[1]; // Return the player name (URL-encoded)
  }
  
  return null;
};

/**
 * Check if Supabase is configured
 */
const isSupabaseConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  // Check that both exist and URL isn't a placeholder
  return !!(url && key && !url.includes('placeholder'));
};

/**
 * Get the first admin user from the database
 * Used for direct admin access without tokens
 * Falls back to hardcoded admin if Supabase is not configured
 */
export const getFirstAdminUser = async (): Promise<User | null> => {
  // TEMPORARY: Return hardcoded admin user to make /admin work immediately
  // TODO: Remove this fallback once Supabase is properly configured
  const fallbackAdmin: User = {
    id: 'admin-temp-id',
    name: 'Admin',
    role: UserRole.COACH,
    avatarUrl: ''
  };

  if (!isSupabaseConfigured()) {
    console.warn('Supabase is not configured, using fallback admin user');
    return fallbackAdmin;
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', UserRole.COACH)
      .limit(1);

    if (error) {
      console.warn('Error querying admin user, using fallback:', error);
      return fallbackAdmin;
    }

    if (!data || data.length === 0) {
      console.warn('No admin users found in database, using fallback');
      return fallbackAdmin;
    }

    const admin = data[0];
    return {
      id: admin.id,
      name: admin.name,
      role: admin.role as UserRole,
      avatarUrl: admin.avatar_url || ''
    };
  } catch (error) {
    console.warn('Error getting admin user, using fallback:', error);
    return fallbackAdmin;
  }
};

/**
 * Store token in localStorage for persistence
 */
export const storeToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

/**
 * Get token from localStorage
 */
export const getStoredToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

/**
 * Clear stored token
 */
export const clearToken = (): void => {
  localStorage.removeItem('auth_token');
};

