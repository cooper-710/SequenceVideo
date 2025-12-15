-- ============================================
-- Migration: Remove Sessions, Use Direct Conversations
-- ============================================
-- Run this in Supabase Dashboard → SQL Editor
-- This migrates from session-based to direct admin-player messaging

BEGIN;

-- Step 1: Add new columns to messages table
ALTER TABLE messages 
  ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES users(id);

-- Step 2: Migrate existing data
-- Extract coach_id and player_id from sessions for existing messages
UPDATE messages m
SET 
  coach_id = COALESCE(
    (SELECT s.coach_id FROM sessions s WHERE s.id = m.session_id),
    (SELECT sp.player_id FROM session_players sp 
     WHERE sp.session_id = m.session_id 
     LIMIT 1) -- Fallback: use first player if no coach
  ),
  player_id = (
    SELECT sp.player_id 
    FROM session_players sp 
    WHERE sp.session_id = m.session_id 
    LIMIT 1
  )
WHERE m.session_id IS NOT NULL
  AND (m.coach_id IS NULL OR m.player_id IS NULL);

-- Step 3: Make new columns NOT NULL (after data migration)
-- First, handle any messages that couldn't be migrated
DELETE FROM messages 
WHERE coach_id IS NULL OR player_id IS NULL;

-- Now make them required
ALTER TABLE messages 
  ALTER COLUMN coach_id SET NOT NULL,
  ALTER COLUMN player_id SET NOT NULL;

-- Step 4: Drop the old session_id foreign key constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey;

-- Step 5: Drop the session_id column
ALTER TABLE messages DROP COLUMN IF EXISTS session_id;

-- Step 6: Update indexes
-- Drop old index
DROP INDEX IF EXISTS idx_messages_session_id;

-- Create new indexes for conversation queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(coach_id, player_id);
CREATE INDEX IF NOT EXISTS idx_messages_player_id ON messages(player_id);
CREATE INDEX IF NOT EXISTS idx_messages_coach_id ON messages(coach_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(coach_id, player_id, created_at DESC);

-- Step 7: Update RLS policies for messages
-- Drop old policies
DROP POLICY IF EXISTS "Users can read messages" ON messages;
DROP POLICY IF EXISTS "Users can create messages" ON messages;
DROP POLICY IF EXISTS "Users can update messages" ON messages;

-- New policy: Users can read messages in their conversations
-- (either as coach or as player)
-- Note: Using true for anon key access - app logic handles filtering
CREATE POLICY "Users can read their conversation messages" ON messages
  FOR SELECT 
  USING (true);

-- New policy: Users can create messages in their conversations
CREATE POLICY "Users can create conversation messages" ON messages
  FOR INSERT 
  WITH CHECK (true);

-- New policy: Users can update their own messages
CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE 
  USING (true);

-- Step 8: (Optional) Drop session-related tables
-- Only do this if you're sure you don't need the old data!
-- Uncomment these lines when ready:

/*
DROP TABLE IF EXISTS user_session_deletions CASCADE;
DROP TABLE IF EXISTS session_players CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP INDEX IF EXISTS idx_sessions_coach_id;
DROP INDEX IF EXISTS idx_sessions_status;
DROP INDEX IF EXISTS idx_session_players_session_id;
DROP INDEX IF EXISTS idx_session_players_player_id;
*/

-- Step 9: Drop RLS policies for session tables (if dropping tables)
-- Uncomment when dropping tables:
/*
DROP POLICY IF EXISTS "Users can read sessions" ON sessions;
DROP POLICY IF EXISTS "Coaches can create sessions" ON sessions;
DROP POLICY IF EXISTS "Coaches can update sessions" ON sessions;
DROP POLICY IF EXISTS "Users can read session_players" ON session_players;
DROP POLICY IF EXISTS "Users can manage session_players" ON session_players;
DROP POLICY IF EXISTS "Users can read user_session_deletions" ON user_session_deletions;
DROP POLICY IF EXISTS "Users can manage user_session_deletions" ON user_session_deletions;
*/

COMMIT;

-- ============================================
-- Verification Queries
-- ============================================
-- Run these to verify the migration:

-- Check messages have coach_id and player_id
SELECT COUNT(*) as total_messages,
       COUNT(coach_id) as messages_with_coach,
       COUNT(player_id) as messages_with_player
FROM messages;

-- Check for any orphaned messages (should be 0)
SELECT COUNT(*) as orphaned_messages
FROM messages
WHERE coach_id IS NULL OR player_id IS NULL;

-- View sample migrated messages
SELECT id, coach_id, player_id, sender_id, type, created_at
FROM messages
ORDER BY created_at DESC
LIMIT 10;

