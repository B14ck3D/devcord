-- Zaproszenia do serwera: kod, limit użyć, wygaśnięcie

CREATE TABLE IF NOT EXISTS server_invites (
    id BIGINT PRIMARY KEY,
    server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id),
    max_uses INT,
    uses_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_invites_code_upper ON server_invites (upper(code));
CREATE INDEX IF NOT EXISTS idx_server_invites_server ON server_invites (server_id);
