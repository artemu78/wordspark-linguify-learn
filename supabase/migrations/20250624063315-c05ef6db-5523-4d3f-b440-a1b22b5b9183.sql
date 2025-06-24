
-- Fix RLS policies for vocabulary_words table
-- First, drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view vocabulary words" ON public.vocabulary_words;
DROP POLICY IF EXISTS "Users can create words for their vocabularies" ON public.vocabulary_words;

-- Create comprehensive RLS policies for vocabulary_words
CREATE POLICY "Users can view vocabulary words" ON public.vocabulary_words
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vocabularies v 
      WHERE v.id = vocabulary_id
    )
  );

CREATE POLICY "Users can create words for their vocabularies" ON public.vocabulary_words
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vocabularies v 
      WHERE v.id = vocabulary_id AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update words for their vocabularies" ON public.vocabulary_words
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vocabularies v 
      WHERE v.id = vocabulary_id AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete words for their vocabularies" ON public.vocabulary_words
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vocabularies v 
      WHERE v.id = vocabulary_id AND v.created_by = auth.uid()
    )
  );
