ALTER TABLE public.user_progress
ADD COLUMN choice_correct BOOLEAN DEFAULT FALSE,
ADD COLUMN typing_correct BOOLEAN DEFAULT FALSE;

-- Update existing rows:
-- If is_correct is true, assume choice_correct was true.
-- Set typing_correct to false initially for all, as this is a new feature.
-- If is_correct is false, both new columns remain false (as per default).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_progress' AND column_name='is_correct') THEN
        UPDATE public.user_progress
        SET choice_correct = CASE WHEN is_correct = TRUE THEN TRUE ELSE FALSE END,
            typing_correct = FALSE
        WHERE is_correct IS NOT NULL;
    END IF;
END $$;

-- Optional: Modify the is_correct column to be a generated column
-- This makes is_correct automatically true if both choice_correct and typing_correct are true.
-- Remove the existing is_correct column first if it has default values or constraints that prevent alteration.
-- ALTER TABLE public.user_progress DROP COLUMN is_correct;
-- ALTER TABLE public.user_progress ADD COLUMN is_correct BOOLEAN GENERATED ALWAYS AS (choice_correct AND typing_correct) STORED;

-- For now, we will update is_correct via application logic.
-- The `is_correct` column will represent overall completion of both challenges.
-- So, if a row had `is_correct = true`, it implies the choice was correct.
-- We'll set `typing_correct` to false for all existing rows as this challenge didn't exist.
-- New entries will have `is_correct` updated when both `choice_correct` and `typing_correct` become true.
