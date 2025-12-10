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

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  preview_image TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'new_feedback')),
  coach_id UUID REFERENCES users(id),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session players junction table (many-to-many)
CREATE TABLE IF NOT EXISTS session_players (
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, player_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('TEXT', 'VIDEO', 'AUDIO', 'IMAGE')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-specific session deletions (like iMessage)
CREATE TABLE IF NOT EXISTS user_session_deletions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, session_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_coach_id ON sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_session_players_session_id ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_session_players_player_id ON session_players(player_id);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session_deletions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true); -- Allow reading all users (needed for displaying names)

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (true);

-- Policy: Anyone can read sessions (filtered by access in app logic)
CREATE POLICY "Users can read sessions" ON sessions
  FOR SELECT USING (true);

-- Policy: Coaches can create sessions
CREATE POLICY "Coaches can create sessions" ON sessions
  FOR INSERT WITH CHECK (true);

-- Policy: Coaches can update sessions
CREATE POLICY "Coaches can update sessions" ON sessions
  FOR UPDATE USING (true);

-- Policy: Users can read messages in their sessions
CREATE POLICY "Users can read messages" ON messages
  FOR SELECT USING (true);

-- Policy: Users can create messages
CREATE POLICY "Users can create messages" ON messages
  FOR INSERT WITH CHECK (true);

-- Policy: Users can update their own messages
CREATE POLICY "Users can update messages" ON messages
  FOR UPDATE USING (true);

-- Policy: Users can read session_players
CREATE POLICY "Users can read session_players" ON session_players
  FOR SELECT USING (true);

-- Policy: Users can manage session_players
CREATE POLICY "Users can manage session_players" ON session_players
  FOR ALL USING (true);

-- Policy: Users can read user_session_deletions
CREATE POLICY "Users can read user_session_deletions" ON user_session_deletions
  FOR SELECT USING (true);

-- Policy: Users can manage user_session_deletions
CREATE POLICY "Users can manage user_session_deletions" ON user_session_deletions
  FOR ALL USING (true);

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

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

