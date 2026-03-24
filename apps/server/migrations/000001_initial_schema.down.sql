DROP TRIGGER IF EXISTS set_presence_states_updated_at ON presence_states;
DROP TRIGGER IF EXISTS set_servers_updated_at ON servers;
DROP TRIGGER IF EXISTS set_users_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at_column;

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS presence_states;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS direct_conversation_members;
DROP TABLE IF EXISTS direct_conversations;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS server_members;
DROP TABLE IF EXISTS servers;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS pgcrypto;
