-- Group chat: conversations gain a kind (direct|group), and group membership
-- lives in its own table with per-member read state. Group messages have no
-- single recipient, so messages.recipient_id becomes nullable (table rebuild).

ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE conversations ADD COLUMN name TEXT;
ALTER TABLE conversations ADD COLUMN is_team INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN created_by INTEGER REFERENCES users(id);

CREATE TABLE conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

-- Rebuild messages so recipient_id can be NULL for group broadcasts.
CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO messages_new
  (id, conversation_id, sender_id, recipient_id, content, status, is_read, created_at, updated_at)
SELECT
  id, conversation_id, sender_id, recipient_id, content, status, is_read, created_at, updated_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
CREATE INDEX messages_conversation_idx ON messages (conversation_id);
CREATE INDEX messages_recipient_idx ON messages (recipient_id);
