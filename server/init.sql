CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio TEXT DEFAULT 'Passionate athlete dedicated to pushing limits and achieving new personal records every day.',
  weekly_goal INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sports (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sports (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  sport_id INTEGER REFERENCES sports(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, sport_id)
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  workout_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise VARCHAR(255) NOT NULL,
  sport_id INTEGER REFERENCES sports(id),
  sets VARCHAR(50),
  reps VARCHAR(50),
  distance VARCHAR(50),
  duration VARCHAR(50),
  notes TEXT,
  likes INTEGER DEFAULT 0,
  is_personal_record BOOLEAN DEFAULT FALSE,
  workout_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS workout_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES workout_sessions(id) ON DELETE CASCADE;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS is_personal_record BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS workout_likes (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  workout_id INTEGER REFERENCES workouts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, workout_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id)
);

INSERT INTO sports (name) VALUES 
  ('Football'),
  ('Basketball'),
  ('Athletics'),
  ('Swimming'),
  ('Cycling'),
  ('Tennis'),
  ('Volleyball'),
  ('Golf')
ON CONFLICT (name) DO NOTHING;
