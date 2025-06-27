import { supabase } from "@/integrations/supabase/client"; // For invoking Edge Function

// Keep WordDetail and GeminiStoryBit interfaces as they define the data structure
// exchanged with the backend and used by other parts of the client application.
interface WordDetail {
  word: string;
  translation?: string;
}

export interface GeminiStoryBit {
  word: string;
  storyBitDescription: string;
  imagePrompt: string;
}

// This error can be used to wrap errors coming from the Edge Function call
export class GeminiGenerationError extends Error {
  constructor(message: string, public details?: any) { // Changed originalError to details for broader use
    super(message);
    this.name = "GeminiGenerationError";
  }
}

export const generateStoryFromWords = async (
  words: WordDetail[],
  vocabularyTitle: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<GeminiStoryBit[]> => {
  if (!words || words.length === 0) {
    throw new GeminiGenerationError("No words provided to generate a story.");
  }

  const payload = {
    words,
    vocabularyTitle,
    sourceLanguage,
    targetLanguage,
  };

  try {
    const { data, error } = await supabase.functions.invoke<GeminiStoryBit[]>(
      "generate-story-with-gemini", // Name of the Supabase Edge Function
      {
        body: payload,
        // headers: { 'Content-Type': 'application/json' } // Supabase client sets this
      }
    );

    if (error) {
      console.error("Error invoking Supabase function 'generate-story-with-gemini':", error);
      // Attempt to parse a more specific error message if the function returned one
      let message = `Error calling story generation service: ${error.message}`;
      if (error.context && typeof error.context.error_message === 'string') {
        message = error.context.error_message;
      } else if (typeof error.details === 'string') {
        message = error.details;
      }
      throw new GeminiGenerationError(message, error);
    }

    if (!data) {
      throw new GeminiGenerationError("Received no data from story generation service.");
    }

    // Optional: Add validation for the received data structure if needed,
    // though the Edge Function should ideally ensure correctness.
    if (!Array.isArray(data) || data.length !== words.length) {
      console.warn("Data from Edge function does not match expected structure or length.", data);
      // Decide if this should be a hard error or if partial data is acceptable
      // For now, let's be strict as per the initial requirements.
      throw new GeminiGenerationError(
        `Story data from service is not a valid array or does not match the expected number of story bits. Expected ${words.length}, received items: ${Array.isArray(data) ? data.length : 'not an array'}.`
      );
    }
    data.forEach((bit, index) => {
      if (!bit.word || !bit.storyBitDescription || !bit.imagePrompt) {
        throw new GeminiGenerationError(
          `Story bit ${index} from service is missing one or more required fields (word, storyBitDescription, imagePrompt). Bit: ${JSON.stringify(bit)}`
        );
      }
    });

    return data;

  } catch (error: any) {
    console.error("Client-side error in generateStoryFromWords:", error);
    if (error instanceof GeminiGenerationError) {
      throw error; // Re-throw if it's already our custom error
    }
    throw new GeminiGenerationError(
      `An unexpected client-side error occurred: ${error.message || "Unknown client error"}`,
      error
    );
  }
};
