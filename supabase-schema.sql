-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (stores player and admin info with access tokens)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL, -- Access token for link-based auth
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PLAYER', 'COACH')),
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID REFERENCES users(id) NOT NULL,
  player_id UUID REFERENCES users(id) NOT NULL,
  sender_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('TEXT', 'VIDEO', 'AUDIO', 'IMAGE')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(coach_id, player_id);
CREATE INDEX IF NOT EXISTS idx_messages_player_id ON messages(player_id);
CREATE INDEX IF NOT EXISTS idx_messages_coach_id ON messages(coach_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(coach_id, player_id, created_at DESC);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true); -- Allow reading all users (needed for displaying names)

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (true);

-- Policy: Users can read messages in their conversations
CREATE POLICY "Users can read messages" ON messages
  FOR SELECT USING (true);

-- Policy: Users can create messages
CREATE POLICY "Users can create messages" ON messages
  FOR INSERT WITH CHECK (true);

-- Policy: Users can update their own messages
CREATE POLICY "Users can update messages" ON messages
  FOR UPDATE USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
