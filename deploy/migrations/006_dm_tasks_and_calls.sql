-- DM shared tasks and DM call sessions

CREATE TABLE IF NOT EXISTS dm_tasks (
    id BIGINT PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    assignee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    source_dm_msg_id BIGINT REFERENCES dm_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_tasks_conversation ON dm_tasks(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_call_sessions (
    id BIGINT PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    caller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dm_call_sessions_conversation ON dm_call_sessions(conversation_id, created_at DESC);
