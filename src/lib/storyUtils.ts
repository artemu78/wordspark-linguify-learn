import { supabase } from "@/integrations/supabase/client";
import { TablesInsert, Tables } from "@/integrations/supabase/types";
import { generateStoryFromWords, GeminiGenerationError, GeminiStoryBit } from "./geminiUtils"; // Added import

export class StoryGenerationError extends Error {
  constructor(message: string, public code?: string, public originalError?: any) { // Added originalError
    super(message);
    this.name = "StoryGenerationError";
  }
}

export const generateAndSaveStory = async (
  vocabularyId: string
  // vocabularyTitle is no longer passed as it will be fetched
): Promise<string> => { // Returns storyId on success, throws StoryGenerationError on failure

  // 1. Fetch vocabulary details (including title and languages)
  const { data: vocabulary, error: vocabError } = await supabase
    .from("vocabularies")
    .select("title, source_language, target_language")
    .eq("id", vocabularyId)
    .single();

  if (vocabError) {
    console.error("Error fetching vocabulary details:", vocabError);
    throw new StoryGenerationError(`Failed to fetch vocabulary details: ${vocabError.message}`, "FETCH_VOCAB_FAILED");
  }
  if (!vocabulary) {
    throw new StoryGenerationError("Vocabulary not found.", "VOCAB_NOT_FOUND");
  }

  const { title: vocabularyTitle, source_language: sourceLanguage, target_language: targetLanguage } = vocabulary;

  // 2. Fetch all vocabulary words
  const { data: words, error: wordsError } = await supabase
    .from("vocabulary_words")
    .select("id, word, translation") // translation can be useful for context or future features
    .eq("vocabulary_id", vocabularyId);
    // Removed limit(5) to fetch all words

  if (wordsError) {
    console.error("Error fetching words for story:", wordsError);
    throw new StoryGenerationError(`Failed to fetch words: ${wordsError.message}`, "FETCH_WORDS_FAILED");
  }

  if (!words || words.length === 0) {
    throw new StoryGenerationError("Cannot generate a story for a vocabulary with no words.", "NO_WORDS_FOUND");
  }

  // 3. Generate story using Gemini
  let geminiStoryBits: GeminiStoryBit[];
  try {
    // Prepare words for Gemini. Ensure sourceLanguage and targetLanguage are available.
    // The current `words` objects from Supabase have `word` and `translation`.
    // `generateStoryFromWords` expects an array of objects with at least a `word` property.
    const wordsForGemini = words.map(w => ({ word: w.word, translation: w.translation }));

    if (!sourceLanguage || !targetLanguage) {
        throw new StoryGenerationError(
            "Source or target language not found for the vocabulary. Cannot generate story.",
            "LANGUAGES_MISSING"
        );
    }

    geminiStoryBits = await generateStoryFromWords(wordsForGemini, vocabularyTitle, sourceLanguage, targetLanguage);
  } catch (error: any) {
    console.error("Error generating story via Edge Function (Gemini):", error);
    if (error instanceof GeminiGenerationError) {
      // Propagate Gemini-specific errors (now from Edge Function call) with more context
      throw new StoryGenerationError(`Story generation service failed: ${error.message}`, "STORY_SERVICE_FAILED", error.details);
    }
    throw new StoryGenerationError(`Failed to generate story content: ${error.message}`, "STORY_CONTENT_GENERATION_FAILED", error);
  }

  // 4. Create Story Entry in Supabase
  const storyTitle = `${vocabularyTitle} - AI Story`; // Updated title to reflect AI generation
  const storyInsert: TablesInsert<"stories"> = {
    vocabulary_id: vocabularyId,
    title: storyTitle,
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
    throw new StoryGenerationError("Failed to create story entry (no data returned).", "STORY_CREATION_NO_ID");
  }

  // 5. Create Story Bits in Supabase using Gemini response
  // Ensure the order of geminiStoryBits matches the intended sequence.
  // The prompt to Gemini requests the bits in order of the words provided.
  // We should ensure the words from Supabase are consistently ordered if sequence matters beyond Gemini's output.
  // For now, we assume Gemini returns them in a usable order corresponding to the input word list.

  const storyBitsInsert: TablesInsert<"story_bits">[] = geminiStoryBits.map(
    (geminiBit, index) => {
      // It's important to ensure the 'word' from Gemini response is one of the original words
      // and is in the source language. The prompt guides Gemini to do this.
      const originalWordEntry = words.find(w => w.word === geminiBit.word);

      return {
        story_id: newStory.id,
        sequence_number: index + 1,
        word: geminiBit.word, // This should be the word in the source language, as per Gemini prompt
        sentence: geminiBit.storyBitDescription, // This is the story part in the target language
        image_prompt: geminiBit.imagePrompt, // The prompt for image generation
        image_url: "/placeholder.svg", // Using a public placeholder, image generation is separate
      };
    }
  );

  const { error: bitsError } = await supabase
    .from("story_bits")
    .insert(storyBitsInsert);

  if (bitsError) {
    console.error("Error inserting story bits:", bitsError);
    try {
      await supabase.from("stories").delete().eq("id", newStory.id);
    } catch (cleanupError) {
      console.error("Failed to cleanup story after bits insertion failure:", cleanupError);
    }
    throw new StoryGenerationError(`Failed to insert story bits: ${bitsError.message}`, "BITS_INSERTION_FAILED");
  }

  return newStory.id;
};
