-- DM: one conversation per user pair (user_a < user_b)

CREATE TABLE IF NOT EXISTS dm_conversations (
    id BIGINT PRIMARY KEY,
    user_a BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (user_a < user_b),
    UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS dm_messages (
    id BIGINT PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conv_id ON dm_messages (conversation_id, id DESC);
