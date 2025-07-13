import { supabase } from "@/integrations/supabase/client"; // For invoking Edge Function

// Keep WordDetail and GeminiStoryBit interfaces as they define the data structure
// exchanged with the backend and used by other parts of the client application.
interface WordDetail {
  word: string;
  translation?: string;
}

export interface GeminiStoryBit {
  word: string;
  storyBitDescription: string; // In languageToLearn
  storyBitDescriptionInLanguageYouKnow: string; // In languageYouKnow
  imagePrompt: string;
}

// This error can be used to wrap errors coming from the Edge Function call
export class GeminiGenerationError extends Error {
  constructor(message: string, public details?: typeof Error) { // Changed originalError to details for broader use
    super(message);
    this.name = "GeminiGenerationError";
  }
}

export const generateStoryFromWords = async (
  words: WordDetail[],
  vocabularyTitle: string,
  languageYouKnow: string,
  languageToLearn: string,
): Promise<GeminiStoryBit[]> => {
  if (!words || words.length === 0) {
    throw new GeminiGenerationError("No words provided to generate a story.");
  }

  const payload = {
    words,
    vocabularyTitle,
    languageYouKnow,
    languageToLearn,
  };

  try {
    const { data: dataString, error } = await supabase.functions.invoke<string>(
      "generate-story-with-gemini", // Name of the Supabase Edge Function
      {
        body: payload,
        // headers: { 'Content-Type': 'application/json' } // Supabase client sets this
      },
    );

    if (error) {
      console.error(
        "Error invoking Supabase function 'generate-story-with-gemini':",
        error,
      );
      // Attempt to parse a more specific error message if the function returned one
      let message = `Error calling story generation service: ${error.message}`;
      if (error.context && typeof error.context.error_message === "string") {
        message = error.context.error_message;
      } else if (typeof error.details === "string") {
        message = error.details;
      }
      throw new GeminiGenerationError(message, error);
    }

    if (!dataString) {
      throw new GeminiGenerationError(
        "Received no data from story generation service.",
      );
    }

    let data: GeminiStoryBit[] = [];
    try {
      // Ensure the data is parsed correctly
      data = JSON.parse(dataString);
    } catch (parseError: unknown) {
      const errorMessage = parseError instanceof Error
        ? parseError.message
        : "Unknown parsing error";
      console.error("Failed to parse response from Edge function:", parseError);
      throw new GeminiGenerationError(
        `Failed to parse response from story generation service: ${errorMessage}`,
        parseError as typeof Error, // Cast to Error for consistency
      );
    }

    // Optional: Add validation for the received data structure if needed,
    // though the Edge Function should ideally ensure correctness.
    if (!Array.isArray(data) || data.length !== words.length) {
      console.warn(
        "Data from Edge function does not match expected structure or length.",
        dataString,
      );
      // Decide if this should be a hard error or if partial data is acceptable
      // For now, let's be strict as per the initial requirements.
      throw new GeminiGenerationError(
        `Story data from service is not a valid array or does not match the expected number of story bits. Expected ${words.length}, received items: ${
          Array.isArray(data) ? data.length : "not an array"
        }.`,
      );
    }
    data.forEach((bit, index) => {
      if (
        !bit.word ||
        !bit.storyBitDescription ||
        !bit.storyBitDescriptionInLanguageYouKnow || // Check for the new field
        !bit.imagePrompt
      ) {
        throw new GeminiGenerationError(
          `Story bit ${index} from service is missing one or more required fields (word, storyBitDescription, storyBitDescriptionInLanguageYouKnow, imagePrompt). Bit: ${
            JSON.stringify(bit)
          }`, // Updated error message
        );
      }
    });

    return data;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Client-side error in generateStoryFromWords:", error);
    if (error instanceof GeminiGenerationError) {
      throw error; // Re-throw if it's already our custom error
    }
    throw new GeminiGenerationError(
      `An unexpected client-side error occurred: ${errorMessage}`,
      error as typeof Error,
    );
  }
};
