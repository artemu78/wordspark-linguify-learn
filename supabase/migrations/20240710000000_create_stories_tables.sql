-- Create the stories table
CREATE TABLE public.stories (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    vocabulary_id uuid NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stories_pkey PRIMARY KEY (id),
    CONSTRAINT stories_vocabulary_id_fkey FOREIGN KEY (vocabulary_id) REFERENCES public.vocabularies(id) ON DELETE CASCADE
);

-- Add RLS policy for stories table
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read stories"
ON public.stories
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert stories"
ON public.stories
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow users to update their own stories or admins"
ON public.stories
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = (SELECT created_by FROM public.vocabularies WHERE id = vocabulary_id)
  -- OR (SELECT current_user_is_admin()) -- Assuming an admin check function
)
WITH CHECK (
  (SELECT auth.uid()) = (SELECT created_by FROM public.vocabularies WHERE id = vocabulary_id)
  -- OR (SELECT current_user_is_admin())
);

CREATE POLICY "Allow users to delete their own stories or admins"
ON public.stories
FOR DELETE
TO authenticated
USING (
  (SELECT auth.uid()) = (SELECT created_by FROM public.vocabularies WHERE id = vocabulary_id)
  -- OR (SELECT current_user_is_admin())
);


-- Create the story_bits table
CREATE TABLE public.story_bits (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    story_id uuid NOT NULL,
    sequence_number integer NOT NULL,
    word text NOT NULL,
    sentence text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_bits_pkey PRIMARY KEY (id),
    CONSTRAINT story_bits_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE
);

-- Add RLS policy for story_bits table
ALTER TABLE public.story_bits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read story_bits"
ON public.story_bits
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert story_bits"
ON public.story_bits
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow users to update their own story_bits or admins"
ON public.story_bits
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.vocabularies v ON s.vocabulary_id = v.id
    WHERE s.id = story_bits.story_id AND v.created_by = (SELECT auth.uid())
  )
  -- OR (SELECT current_user_is_admin())
)
WITH CHECK (
   EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.vocabularies v ON s.vocabulary_id = v.id
    WHERE s.id = story_bits.story_id AND v.created_by = (SELECT auth.uid())
  )
  -- OR (SELECT current_user_is_admin())
);

CREATE POLICY "Allow users to delete their own story_bits or admins"
ON public.story_bits
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.vocabularies v ON s.vocabulary_id = v.id
    WHERE s.id = story_bits.story_id AND v.created_by = (SELECT auth.uid())
  )
  -- OR (SELECT current_user_is_admin())
);

-- Add trigger to update "updated_at" timestamp for stories
CREATE OR REPLACE FUNCTION public.handle_story_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_story_update
BEFORE UPDATE ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.handle_story_update();
