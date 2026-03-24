CREATE TABLE IF NOT EXISTS voice_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 10 CHECK (max_participants > 0 AND max_participants <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_voice_channels_workspace_id_created_at
    ON voice_channels(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_states (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES voice_channels(id) ON DELETE CASCADE,
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    deafened BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_states_channel_id_joined_at
    ON voice_states(channel_id, joined_at ASC);

DROP TRIGGER IF EXISTS set_voice_states_updated_at ON voice_states;
CREATE TRIGGER set_voice_states_updated_at
BEFORE UPDATE ON voice_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_column();
