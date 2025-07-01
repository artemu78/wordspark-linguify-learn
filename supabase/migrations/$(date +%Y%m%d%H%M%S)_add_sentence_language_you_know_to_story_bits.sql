-- Add the new column to the story_bits table
ALTER TABLE public.story_bits
ADD COLUMN sentence_language_you_know TEXT;

-- Optional: Add a comment to describe the new column
COMMENT ON COLUMN public.story_bits.sentence_language_you_know IS 'Stores the story sentence/bit in the language the user already knows, complementing the existing sentence column which is in the language to learn.';

-- Update RLS policies if necessary.
-- If you have row-level security policies on story_bits that specify columns,
-- you might need to update them to include the new column if it should be accessible.
-- For example, if you have a policy like:
-- CREATE POLICY "Users can read their own story bits"
-- ON public.story_bits
-- FOR SELECT USING (auth.uid() = user_id);
-- And you want the new column to be selectable, this policy might already cover it
-- if it doesn't explicitly list columns. If it does list columns, add
-- sentence_language_you_know to the list.

-- For now, assuming existing policies are permissive enough or column-specific policies
-- will be updated manually if strict column controls are in place.
-- If INSERT policies specify columns, they also might need an update if all columns must be listed.
-- However, standard INSERTs where not all columns are provided (and others get defaults or NULL)
-- usually don't require policy changes for adding a nullable column.

-- Example of how you might update a policy if it explicitly listed columns for SELECT:
-- DROP POLICY "Users can read their own story bits" ON public.story_bits;
-- CREATE POLICY "Users can read their own story bits"
-- ON public.story_bits
-- FOR SELECT USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id); -- Assuming it was also for all operations or specific ones.

-- For INSERT, if it was specific:
-- DROP POLICY "Users can insert their own story bits" ON public.story_bits;
-- CREATE POLICY "Users can insert their own story bits"
-- ON public.story_bits
-- FOR INSERT
-- WITH CHECK (
--   auth.uid() = user_id AND
--   -- if you had to list columns, ensure the new one is allowed or handled by default
-- );

-- Since the new column is nullable, existing INSERT operations that don't specify
-- this new column will work by defaulting it to NULL, which is acceptable.
-- SELECT policies that don't list columns (e.g., SELECT * ...) will automatically include it.
-- If policies are more restrictive (e.g., SELECT col1, col2 FROM ...), they'll need manual updates.
-- Given typical Supabase RLS, often policies are not column-specific unless for security redaction.
-- So, no RLS changes are made automatically here, but noted for consideration.

-- It's also good practice to ensure that any services/roles that interact with this table
-- have the necessary permissions for the new column.
-- For example, the 'service_role' and 'authenticated' roles.
-- GRANT SELECT ON public.story_bits TO authenticated;
-- GRANT INSERT (sentence_language_you_know) ON public.story_bits TO authenticated; -- if needed explicitly.
-- Typically, Supabase default grants are sufficient.
-- GRANT ALL ON TABLE public.story_bits TO service_role;
-- These are usually already in place.

SELECT 'Migration to add sentence_language_you_know to story_bits complete.';
