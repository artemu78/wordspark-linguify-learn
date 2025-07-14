-- Create image generation jobs table to track fal.ai job status
CREATE TABLE public.image_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_bit_id UUID NOT NULL,
  fal_job_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  image_url TEXT
);

-- Enable Row Level Security
ALTER TABLE public.image_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for image generation jobs
CREATE POLICY "Users can view image generation jobs for their stories" 
ON public.image_generation_jobs 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM story_bits sb
  JOIN stories s ON sb.story_id = s.id
  JOIN vocabularies v ON s.vocabulary_id = v.id
  WHERE sb.id = image_generation_jobs.story_bit_id 
  AND v.created_by = auth.uid()
));

CREATE POLICY "Users can create image generation jobs for their stories" 
ON public.image_generation_jobs 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM story_bits sb
  JOIN stories s ON sb.story_id = s.id
  JOIN vocabularies v ON s.vocabulary_id = v.id
  WHERE sb.id = image_generation_jobs.story_bit_id 
  AND v.created_by = auth.uid()
));

CREATE POLICY "System can update image generation jobs" 
ON public.image_generation_jobs 
FOR UPDATE 
USING (true);

-- Add image generation status to story_bits
ALTER TABLE public.story_bits 
ADD COLUMN image_generation_status TEXT DEFAULT 'pending';

-- Create index for better performance
CREATE INDEX idx_image_generation_jobs_story_bit_id ON public.image_generation_jobs(story_bit_id);
CREATE INDEX idx_image_generation_jobs_fal_job_id ON public.image_generation_jobs(fal_job_id);
CREATE INDEX idx_story_bits_image_generation_status ON public.story_bits(image_generation_status);