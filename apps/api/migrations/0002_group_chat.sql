-- Group chat support.
--
-- SQLite cannot ALTER column constraints, so both touched tables are rebuilt:
--   * conversations gains kind/name/is_team/created_by and the direct-user
--     pair becomes nullable (groups have no fixed pair).
--   * messages.recipient_id becomes nullable (group posts broadcast instead).
--
-- Wrapped in an explicit transaction with deferred FK checks so the drop /
-- rename dance never leaves or observes an inconsistent state. Works under
-- D1 (`defer_foreign_keys`) and better-sqlite3 alike.

PRAGMA defer_foreign_keys = TRUE;
BEGIN;

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

CREATE TABLE conversations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'direct',
  name TEXT,
  is_team INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  first_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  second_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO conversations_new
  (id, kind, name, is_team, created_by, first_user_id, second_user_id, created_at, updated_at)
SELECT
  id, 'direct', NULL, 0, NULL, first_user_id, second_user_id, created_at, updated_at
FROM conversations;

DROP TABLE messages;
DROP TABLE conversations;

ALTER TABLE conversations_new RENAME TO conversations;
ALTER TABLE messages_new RENAME TO messages;

CREATE UNIQUE INDEX conversations_pair_unique ON conversations (first_user_id, second_user_id);
CREATE INDEX conversations_kind_idx ON conversations (kind);

CREATE INDEX messages_conversation_idx ON messages (conversation_id);
CREATE INDEX messages_recipient_idx ON messages (recipient_id);

CREATE TABLE conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

COMMIT;
