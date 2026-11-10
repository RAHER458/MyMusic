ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
CREATE TABLE IF NOT EXISTS posts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '',
 media_json TEXT NOT NULL DEFAULT '[]', visibility TEXT NOT NULL DEFAULT 'public',
 created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS likes (
 user_id TEXT NOT NULL, post_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,post_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL,
 created_at TEXT NOT NULL, FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id,created_at);
CREATE TABLE IF NOT EXISTS follows (
 follower_id TEXT NOT NULL, followed_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(follower_id,followed_id), FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(followed_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS video_suggestions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, url TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
 comment TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_videos_status ON video_suggestions(status,created_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL,
 post_id TEXT, text TEXT NOT NULL, created_at TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC);