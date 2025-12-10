-- Add missing policies for users table
-- Run this in your Supabase SQL Editor to allow creating and deleting players
-- IMPORTANT: Run this in your Supabase Dashboard → SQL Editor

-- First, check if policies already exist and drop them if needed
DROP POLICY IF EXISTS "Users can insert users" ON users;
DROP POLICY IF EXISTS "Users can delete players" ON users;

-- Policy: Allow inserting new users (for creating players)
-- This allows anyone with the anon key to create users
CREATE POLICY "Users can insert users" ON users
  FOR INSERT 
  WITH CHECK (true);

-- Policy: Allow deleting players (but not admins/coaches)
-- This allows deleting users with role 'PLAYER'
CREATE POLICY "Users can delete players" ON users
  FOR DELETE 
  USING (role = 'PLAYER');

-- Verify the policies were created
SELECT * FROM pg_policies WHERE tablename = 'users';

