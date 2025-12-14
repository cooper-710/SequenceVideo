-- Fix foreign key constraint to allow player deletion
-- This updates the messages table to set sender_id to NULL when a user is deleted
-- instead of preventing the deletion

-- Step 1: Drop the existing foreign key constraint (try common names)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_users_id_fk;

-- Step 2: If the constraint has a different name, find and drop it
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the foreign key constraint on sender_id column
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'messages'::regclass
    AND contype = 'f'
    AND (
        SELECT COUNT(*) FROM unnest(conkey) AS col_idx
        JOIN pg_attribute ON pg_attribute.attrelid = conrelid AND pg_attribute.attnum = col_idx
        WHERE pg_attribute.attname = 'sender_id'
    ) > 0
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE messages DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    END IF;
END $$;

-- Step 3: Add the new foreign key constraint with ON DELETE SET NULL
ALTER TABLE messages 
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) 
REFERENCES users(id) 
ON DELETE SET NULL;

