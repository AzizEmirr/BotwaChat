DO $$
DECLARE
    constraint_row RECORD;
BEGIN
    IF to_regclass('public.presence_states') IS NULL THEN
        RETURN;
    END IF;

    FOR constraint_row IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'c'
          AND n.nspname = 'public'
          AND t.relname = 'presence_states'
          AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.presence_states DROP CONSTRAINT IF EXISTS %I', constraint_row.conname);
    END LOOP;

    ALTER TABLE public.presence_states
        ADD CONSTRAINT presence_states_status_check
        CHECK (status IN ('online', 'idle', 'dnd', 'invisible', 'offline'));
END $$;
