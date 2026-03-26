-- Zaproszenia do znajomych i zaakceptowane znajomości (globalne, nie per serwer)

CREATE TABLE IF NOT EXISTS friend_requests (
    id BIGINT PRIMARY KEY,
    from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT friend_req_no_self CHECK (from_user_id <> to_user_id),
    CONSTRAINT friend_req_unique_pair UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);

CREATE TABLE IF NOT EXISTS friendships (
    id BIGINT PRIMARY KEY,
    user_low BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT friendships_ordered CHECK (user_low < user_high),
    CONSTRAINT friendships_unique UNIQUE (user_low, user_high)
);

CREATE INDEX IF NOT EXISTS idx_friendships_low ON friendships(user_low);
CREATE INDEX IF NOT EXISTS idx_friendships_high ON friendships(user_high);
