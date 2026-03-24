DROP INDEX IF EXISTS idx_message_reactions_user_id;
DROP INDEX IF EXISTS idx_message_reactions_message_emoji;
DROP TABLE IF EXISTS message_reactions;

DROP INDEX IF EXISTS idx_message_pins_pinned_by;
DROP INDEX IF EXISTS idx_message_pins_created_at;
DROP TABLE IF EXISTS message_pins;
