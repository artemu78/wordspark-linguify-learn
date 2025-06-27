import { supabase } from "@/integrations/supabase/client";
import { TablesInsert } from "@/integrations/supabase/types";

export class StoryGenerationError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "StoryGenerationError";
  }
}

export const generateAndSaveStory = async (
  vocabularyId: string,
  vocabularyTitle: string
): Promise<string> => { // Returns storyId on success, throws StoryGenerationError on failure
  // 1. Fetch vocabulary words
  const { data: words, error: wordsError } = await supabase
    .from("vocabulary_words")
    .select("id, word, translation")
    .eq("vocabulary_id", vocabularyId)
    .limit(5);

  if (wordsError) {
    console.error("Error fetching words for story:", wordsError);
    throw new StoryGenerationError(`Failed to fetch words: ${wordsError.message}`, "FETCH_WORDS_FAILED");
  }

  if (!words || words.length === 0) {
    throw new StoryGenerationError("Cannot generate a story for a vocabulary with no words.", "NO_WORDS_FOUND");
  }

  // 2. Create Story Entry
  const storyTitle = `${vocabularyTitle} - Story`;
    const storyInsert: TablesInsert<"stories"> = {
      vocabulary_id: vocabularyId,
      title: storyTitle,
      // created_by: userId, // If your RLS for stories relies on this field being set explicitly.
                           // Otherwise, if it uses auth.uid() from the session, this isn't needed here.
                           // The previous migration used vocabularies.created_by for RLS.
    };

    const { data: newStory, error: storyError } = await supabase
      .from("stories")
      .insert(storyInsert)
      .select("id")
      .single();

    if (storyError) {
      console.error("Error creating story entry:", storyError);
      throw new StoryGenerationError(`Failed to create story entry: ${storyError.message}`, "STORY_CREATION_FAILED");
    }
    if (!newStory) {
      // This case should ideally be covered by storyError, but as a safeguard:
      throw new StoryGenerationError("Failed to create story entry (no data returned).", "STORY_CREATION_NO_ID");
    }

    // 3. Create Story Bits
    const storyBitsInsert: TablesInsert<"story_bits">[] = words.map(
      (wordData, index) => ({
        story_id: newStory.id,
        sequence_number: index + 1,
        word: wordData.word,
        sentence: `This is a simple sentence featuring the word "${wordData.word}". The translation is "${wordData.translation}".`,
        image_url: "/placeholder.svg", // Using a public placeholder
      })
    );

    const { error: bitsError } = await supabase
      .from("story_bits")
      .insert(storyBitsInsert);

    if (bitsError) {
      console.error("Error inserting story bits:", bitsError);
      // Attempt to clean up the created story entry if bits fail
      try {
        await supabase.from("stories").delete().eq("id", newStory.id);
      } catch (cleanupError) {
        console.error("Failed to cleanup story after bits insertion failure:", cleanupError);
        // Log this, but the original error is more important to throw
      }
      throw new StoryGenerationError(`Failed to insert story bits: ${bitsError.message}`, "BITS_INSERTION_FAILED");
    }

    return newStory.id;
  // No catch block here, let errors propagate to be handled by the calling component's try/catch
  // This allows components to use their own toast mechanisms and loading states.
};
