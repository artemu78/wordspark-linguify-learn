import { supabase } from "@/integrations/supabase/client";
import { TablesInsert } from "@/integrations/supabase/types";
import {
  GeminiGenerationError,
  GeminiStoryBit,
  generateStoryFromWords,
} from "./geminiUtils";

export class StoryGenerationError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: string,
  ) { // Added originalError
    super(message);
    this.name = "StoryGenerationError";
  }
}

export const generateAndSaveStory = async (
  vocabularyId: string,
  // vocabularyTitle is no longer passed as it will be fetched
): Promise<string> => { // Returns storyId on success, throws StoryGenerationError on failure
  // 1. Fetch vocabulary details (including title and languages)
  const { vocabularyTitle, languageYouKnow, languageToLearn } =
    await getVocabulary(vocabularyId);

  // 2. Fetch all vocabulary words
  const { words } = await getVocabularyWords(vocabularyId);

  // 3. Generate story using Gemini
  let geminiStoryBits: GeminiStoryBit[];
  try {
    // Prepare words for Gemini.
    const wordsForGemini = words.map((w) => ({
      word: w.word,
      translation: w.translation,
    }));

    // Languages are already validated before this try block.
    geminiStoryBits = await generateStoryFromWords(
      wordsForGemini,
      vocabularyTitle,
      languageYouKnow!,
      languageToLearn!,
    ); // Use non-null assertion as they are validated
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error occurred";
    console.error(
      "Error generating story via Edge Function (Gemini):",
      errorMessage,
    );
    if (error instanceof GeminiGenerationError) {
      // Propagate Gemini-specific errors (now from Edge Function call) with more context
      throw new StoryGenerationError(
        `Story generation service failed: ${errorMessage}`,
        "STORY_SERVICE_FAILED",
        error.toString(),
      );
    }
    throw new StoryGenerationError(
      `Failed to generate story content: ${errorMessage}`,
      "STORY_CONTENT_GENERATION_FAILED",
      error.toString(),
    );
  }

  // 4. Create Story Entry in Supabase
  const storyInsert: TablesInsert<"stories"> = {
    vocabulary_id: vocabularyId,
    title: `${vocabularyTitle} - AI Story`,
  };

  const { data: newStory, error: storyError } = await supabase
    .from("stories")
    .insert(storyInsert)
    .select("id")
    .single();

  if (storyError) {
    console.error("Error creating story entry:", storyError);
    throw new StoryGenerationError(
      `Failed to create story entry: ${storyError.message}`,
      "STORY_CREATION_FAILED",
      storyError.toString(),
    );
  }
  if (!newStory) {
    throw new StoryGenerationError(
      "Failed to create story entry (no data returned).",
      "STORY_CREATION_NO_ID",
    );
<<<<<<< HEAD
=======
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
      // const originalWordEntry = words.find((w) => w.word === geminiBit.word);

      return {
        story_id: newStory.id,
        sequence_number: index + 1,
        word: geminiBit.word, // This is the word in languageYouKnow
        sentence: geminiBit.storyBitDescription, // This is the story part in languageToLearn
        sentence_language_you_know:
          geminiBit.storyBitDescriptionInLanguageYouKnow, // New field
        image_prompt: geminiBit.imagePrompt, // The prompt for image generation
        image_url: null,
      };
    },
  );

  const { error: bitsError } = await supabase
    .from("story_bits")
    .insert(storyBitsInsert);

  if (bitsError) {
    console.error("Error inserting story bits:", bitsError);
    try {
      await supabase.from("stories").delete().eq("id", newStory.id);
    } catch (cleanupError) {
      console.error(
        "Failed to cleanup story after bits insertion failure:",
        cleanupError,
      );
    }
    throw new StoryGenerationError(
      `Failed to insert story bits: ${bitsError.message}`,
      "BITS_INSERTION_FAILED",
    );
  }

  return newStory.id;
};

async function getVocabulary(vocabularyId: string) {
  const { data: vocabulary, error: vocabError } = await supabase
    .from("vocabularies")
    .select("title, source_language, target_language") // These will be renamed in DB/globally later
    .eq("id", vocabularyId)
    .single();

  if (vocabError) {
    console.error("Error fetching vocabulary details:", vocabError);
    throw new StoryGenerationError(
      `Failed to fetch vocabulary details: ${vocabError.message}`,
      "FETCH_VOCAB_FAILED",
    );
  }
  if (!vocabulary) {
    throw new StoryGenerationError("Vocabulary not found.", "VOCAB_NOT_FOUND");
  }

  // Use new names internally for clarity, even if DB columns are old names for now
  const vocabularyTitle = vocabulary.title;
  const languageYouKnow = vocabulary.source_language;
  const languageToLearn = vocabulary.target_language;

  // Validate languages BEFORE try-catch for Gemini
  if (!languageYouKnow || !languageToLearn) {
    throw new StoryGenerationError(
      "Language you know or language to learn not found for the vocabulary. Cannot generate story.",
      "LANGUAGES_MISSING",
    );
  }

  return {
    vocabularyTitle,
    languageYouKnow,
    languageToLearn,
  };
}

async function getVocabularyWords(vocabularyId: string) {
  const { data: words, error: wordsError } = await supabase
    .from("vocabulary_words")
    .select("id, word, translation") // translation can be useful for context or future features
    .eq("vocabulary_id", vocabularyId);

  if (wordsError) {
    console.error("Error fetching words for story:", wordsError);
    throw new StoryGenerationError(
      `Failed to fetch words: ${wordsError.message}`,
      "FETCH_WORDS_FAILED",
    );
  }

  if (!words || words.length === 0) {
    throw new StoryGenerationError(
      "Cannot generate a story for a vocabulary with no words.",
      "NO_WORDS_FOUND",
    );
  }

  return { words };
}
