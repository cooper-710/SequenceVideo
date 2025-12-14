-- Fix foreign key constraint to allow player deletion
-- This updates the messages table to set sender_id to NULL when a user is deleted
-- instead of preventing the deletion

-- Drop the existing foreign key constraint
ALTER TABLE messages 
DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

-- Add the new foreign key constraint with ON DELETE SET NULL
ALTER TABLE messages 
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) 
REFERENCES users(id) 
ON DELETE SET NULL;

