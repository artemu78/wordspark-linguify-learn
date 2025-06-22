
-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('user', 'admin');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vocabularies table
CREATE TABLE public.vocabularies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en',
  target_language TEXT NOT NULL DEFAULT 'es',
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vocabulary_words table
CREATE TABLE public.vocabulary_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vocabulary_id UUID REFERENCES public.vocabularies(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_progress table
CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vocabulary_id UUID REFERENCES public.vocabularies(id) ON DELETE CASCADE NOT NULL,
  word_id UUID REFERENCES public.vocabulary_words(id) ON DELETE CASCADE NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  last_attempted TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, vocabulary_id, word_id)
);

-- Create vocabulary_completion table to track learned vocabularies
CREATE TABLE public.vocabulary_completion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vocabulary_id UUID REFERENCES public.vocabularies(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, vocabulary_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabularies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary_completion ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS policies for vocabularies (public read, authenticated create)
CREATE POLICY "Anyone can view vocabularies" ON public.vocabularies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create vocabularies" ON public.vocabularies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own vocabularies" ON public.vocabularies
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- RLS policies for vocabulary_words (read access to words in accessible vocabularies)
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

-- RLS policies for user_progress
CREATE POLICY "Users can view their own progress" ON public.user_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own progress" ON public.user_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own progress" ON public.user_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for vocabulary_completion
CREATE POLICY "Users can view their own completions" ON public.vocabulary_completion
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own completions" ON public.vocabulary_completion
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert default vocabulary
INSERT INTO public.vocabularies (title, topic, source_language, target_language, is_default) VALUES
('Basic Spanish', 'basic-words', 'en', 'es', true);

-- Insert default vocabulary words
INSERT INTO public.vocabulary_words (vocabulary_id, word, translation) 
SELECT v.id, word_data.word, word_data.translation
FROM public.vocabularies v,
(VALUES 
  ('hello', 'hola'),
  ('goodbye', 'adiós'),
  ('please', 'por favor'),
  ('thank you', 'gracias'),
  ('yes', 'sí'),
  ('no', 'no'),
  ('water', 'agua'),
  ('food', 'comida'),
  ('house', 'casa'),
  ('friend', 'amigo'),
  ('family', 'familia'),
  ('love', 'amor'),
  ('time', 'tiempo'),
  ('money', 'dinero'),
  ('work', 'trabajo')
) AS word_data(word, translation)
WHERE v.is_default = true;
