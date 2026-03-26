-- Unify tasks into one table keyed by channel_id (text/voice channel or DM conversation id)
-- and stop persisting DM call sessions in DB.

ALTER TABLE tasks
    ALTER COLUMN server_id DROP NOT NULL;

-- Allow DM conversation IDs in tasks.channel_id.
ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_channel_id_fkey;

CREATE INDEX IF NOT EXISTS idx_tasks_channel ON tasks(channel_id);

-- Migrate dm_tasks -> tasks(channel_id = conversation_id).
INSERT INTO tasks (id, server_id, channel_id, title, assignee_id, completed, source_msg_id, created_at)
SELECT dt.id, NULL, dt.conversation_id, dt.title, dt.assignee_id, dt.completed, dt.source_dm_msg_id, dt.created_at
FROM dm_tasks dt
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS dm_tasks;
DROP TABLE IF EXISTS dm_call_sessions;
