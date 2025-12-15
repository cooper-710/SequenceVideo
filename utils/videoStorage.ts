/**
 * Video storage utility using Supabase Storage for persistence
 * Falls back to IndexedDB for local caching, then data URLs for small files
 */

import { supabase } from '../services/supabaseClient';

const DB_NAME = 'sequence_video_db';
const DB_VERSION = 1;
const STORE_NAME = 'videos';
const STORAGE_BUCKET = 'videos'; // Supabase Storage bucket name

let dbInstance: IDBDatabase | null = null;

// Check if Supabase is configured
const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && key && !url.includes('placeholder'));
};

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

/**
 * Store a video blob and return a storage key
 * Priority: Supabase Storage > IndexedDB (for large files) > Data URL (for small files)
 */
export const storeVideo = async (blob: Blob): Promise<string> => {
  // Try Supabase Storage first if configured
  if (isSupabaseConfigured()) {
    try {
      const fileName = `video_${Date.now()}_${Math.random().toString(36).substring(7)}.${blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'mp4'}`;
      
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, blob, {
          contentType: blob.type || 'video/mp4',
          upsert: false
        });

      if (error) {
        console.warn('Error uploading to Supabase Storage:', error);
        // Fall through to local storage
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(fileName);
        
        if (urlData?.publicUrl) {
          return `supabase:${urlData.publicUrl}`;
        }
      }
    } catch (error) {
      console.warn('Error uploading to Supabase Storage:', error);
      // Fall through to local storage
    }
  }

  // For small files (< 2MB), use data URL
  const TWO_MB = 2 * 1024 * 1024;
  if (blob.size < TWO_MB) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // For large files, use IndexedDB as fallback
  try {
    const db = await initDB();
    const key = `video_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, key);
      
      request.onsuccess = () => resolve(`indexeddb:${key}`);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error storing video in IndexedDB:', error);
    // Fallback to data URL even for large files (might fail but worth trying)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};

/**
 * Test if a blob URL is still valid
 */
const isBlobUrlValid = (blobUrl: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const testVideo = document.createElement('video');
    testVideo.onerror = () => resolve(false);
    testVideo.onloadedmetadata = () => {
      resolve(true);
      testVideo.src = '';
      testVideo.load();
    };
    testVideo.src = blobUrl;
    // Timeout after 2 seconds if no response
    setTimeout(() => {
      testVideo.src = '';
      testVideo.load();
      resolve(false);
    }, 2000);
  });
};

/**
 * Retrieve a video from storage
 */
export const getVideo = async (storageKey: string): Promise<string> => {
  // If it's already a data URL, return it
  if (storageKey.startsWith('data:')) {
    return storageKey;
  }

  // If it's a Supabase Storage URL, return it directly
  if (storageKey.startsWith('supabase:')) {
    const url = storageKey.replace('supabase:', '');
    return url;
  }

  // If it's a blob URL, check if it's still valid
  if (storageKey.startsWith('blob:')) {
    const isValid = await isBlobUrlValid(storageKey);
    if (isValid) {
      return storageKey;
    } else {
      // Blob URL is invalid (likely from a previous session)
      console.warn('Invalid blob URL detected, video may have been lost:', storageKey);
      throw new Error('Video blob URL is no longer valid. This video was from a previous session and cannot be recovered.');
    }
  }

  // If it's an IndexedDB key, retrieve it
  if (storageKey.startsWith('indexeddb:')) {
    const key = storageKey.replace('indexeddb:', '');
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        
        request.onsuccess = () => {
          const blob = request.result;
          if (!blob) {
            reject(new Error('Video not found in IndexedDB'));
            return;
          }
          // Convert to blob URL for the video element
          const blobUrl = URL.createObjectURL(blob);
          resolve(blobUrl);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error retrieving video from IndexedDB:', error);
      throw error;
    }
  }

  // Unknown format, return as-is (might be an external URL or Supabase URL)
  return storageKey;
};

/**
 * Delete a video from storage
 */
export const deleteVideo = async (storageKey: string): Promise<void> => {
  // Delete from Supabase Storage if applicable
  if (storageKey.startsWith('supabase:') && isSupabaseConfigured()) {
    try {
      const url = storageKey.replace('supabase:', '');
      // Extract file path from URL
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([fileName]);
      
      if (error) {
        console.warn('Error deleting from Supabase Storage:', error);
      }
    } catch (error) {
      console.warn('Error deleting from Supabase Storage:', error);
    }
  }

  // Delete from IndexedDB if applicable
  if (storageKey.startsWith('indexeddb:')) {
    const key = storageKey.replace('indexeddb:', '');
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error deleting video from IndexedDB:', error);
    }
  }

  // Data URLs and blob URLs don't need explicit deletion
  if (storageKey.startsWith('blob:')) {
    URL.revokeObjectURL(storageKey);
  }
};

