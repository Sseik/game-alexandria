-- Supabase SQL Schema for Game Alexandria
-- Run these migrations in Supabase SQL Editor

-- 1. Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  role_id BIGINT NOT NULL DEFAULT 2, -- 1=admin, 2=user
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Games table (cached from IGDB)
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  igdb_id BIGINT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  logo_url TEXT,
  rating FLOAT,
  release_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. User library (games user owns)
CREATE TABLE IF NOT EXISTS user_library (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  platform_id BIGINT NOT NULL,
  executable_path TEXT,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, game_id, platform_id)
);

-- 4. Wishlist
CREATE TABLE IF NOT EXISTS wishlists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, game_id)
);

-- 5. Platforms (Steam, Epic, GOG, etc)
CREATE TABLE IF NOT EXISTS platforms (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  launch_prefix TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Game sessions (for tracking playtime)
CREATE TABLE IF NOT EXISTS game_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  platform_id BIGINT NOT NULL REFERENCES platforms(id),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_minutes BIGINT COMPUTED STORED AS (EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60),
  session_type TEXT DEFAULT 'local', -- 'local' or 'external'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Row-Level Security (RLS) Policies

-- Users can only see their own data
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own library"
  ON user_library FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own library"
  ON user_library FOR ALL
  USING (auth.uid() = user_id);

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own wishlist"
  ON wishlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own wishlist"
  ON wishlists FOR ALL
  USING (auth.uid() = user_id);

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own sessions"
  ON game_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
  ON game_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Games are readable by everyone (cached data)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Games are publicly readable"
  ON games FOR SELECT
  USING (TRUE);

-- Platforms are readable by everyone
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platforms are publicly readable"
  ON platforms FOR SELECT
  USING (TRUE);
