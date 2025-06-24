-- Add RLS DELETE policy for vocabularies table
CREATE POLICY "Users can delete their own vocabularies" ON public.vocabularies
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Add RLS DELETE policy for vocabulary_words table
CREATE POLICY "Users can delete words from their own vocabularies" ON public.vocabulary_words
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vocabularies v
      WHERE v.id = vocabulary_id AND v.created_by = auth.uid()
    )
  );

-- Add RLS DELETE policy for user_progress table
CREATE POLICY "Users can delete their own progress" ON public.user_progress
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add RLS DELETE policy for vocabulary_completion table
CREATE POLICY "Users can delete their own completion records" ON public.vocabulary_completion
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
