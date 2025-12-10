-- Add missing policies for users table
-- Run this in your Supabase SQL Editor to allow creating and deleting players

-- Policy: Allow inserting new users (for creating players)
CREATE POLICY "Users can insert users" ON users
  FOR INSERT WITH CHECK (true);

-- Policy: Allow deleting players (but not admins/coaches)
CREATE POLICY "Users can delete players" ON users
  FOR DELETE USING (role = 'PLAYER');

-- Alternative: If you want admins to be able to delete any user (including other admins)
-- Uncomment the line below and comment out the one above:
-- CREATE POLICY "Users can delete users" ON users
--   FOR DELETE USING (true);

