CREATE TABLE IF NOT EXISTS server_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_server_invites_server_user
    ON server_invites(server_id, invited_user_id);

CREATE INDEX IF NOT EXISTS idx_server_invites_invited_user_status_created_at
    ON server_invites(invited_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_server_invites_server_status_created_at
    ON server_invites(server_id, status, created_at DESC);

DROP TRIGGER IF EXISTS set_server_invites_updated_at ON server_invites;
CREATE TRIGGER set_server_invites_updated_at
BEFORE UPDATE ON server_invites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();
