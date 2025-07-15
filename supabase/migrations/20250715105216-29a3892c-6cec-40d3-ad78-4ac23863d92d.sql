-- Add foreign key constraint to establish relationship between image_generation_jobs and story_bits
ALTER TABLE public.image_generation_jobs 
ADD CONSTRAINT fk_image_generation_jobs_story_bit_id 
FOREIGN KEY (story_bit_id) REFERENCES public.story_bits(id) ON DELETE CASCADE;