ALTER TABLE vocabularies
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

UPDATE vocabularies SET is_favorite = FALSE WHERE is_favorite IS NULL;

ALTER TABLE vocabularies
ALTER COLUMN is_favorite SET NOT NULL;
