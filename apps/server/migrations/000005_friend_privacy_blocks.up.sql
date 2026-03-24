CREATE TABLE IF NOT EXISTS friend_privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allow_friend_requests_everyone BOOLEAN NOT NULL DEFAULT TRUE,
    allow_friend_requests_friends_of_friends BOOLEAN NOT NULL DEFAULT TRUE,
    allow_friend_requests_server_members BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_friend_privacy_settings_updated_at ON friend_privacy_settings;
CREATE TRIGGER set_friend_privacy_settings_updated_at
BEFORE UPDATE ON friend_privacy_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();

CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_user_id_created_at
    ON blocked_users(blocker_user_id, created_at DESC);
