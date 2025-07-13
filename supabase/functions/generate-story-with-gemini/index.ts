import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "https://esm.sh/@google/generative-ai@0.11.3"; // Using ESM import for Deno
import { corsHeaders, getEnvVariable } from "../_shared/common-lib.ts";
// import { uploadStoryBitsToS3 } from "./s3upload.ts";

// Helper function to return JSON response
const jsonResponse = (data: unknown, status: number = 200) => {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign(
      {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      corsHeaders,
    ),
  });
};

// Helper function to return error response
const errorResponse = (
  message: string,
  status: number = 500,
  details?: unknown,
) => {
  console.error(
    `[EdgeFunctionError] Status: ${status}, Message: ${message}`,
    details,
  );
  return jsonResponse({ error: message, details }, status);
};

interface WordDetail {
  word: string;
  translation?: string;
}

interface GeminiStoryBit {
  word: string;
  storyBitDescription: string; // This will be in languageToLearn
  storyBitDescriptionInLanguageYouKnow: string; // This will be in languageYouKnow
  imagePrompt: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: Object.assign(
        {
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        corsHeaders,
      ),
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed. Please use POST.", 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse("Invalid JSON payload.", 400, message);
  }

  const { words, vocabularyTitle, languageYouKnow, languageToLearn } = payload;

  if (
    !Array.isArray(words) ||
    words.length === 0 ||
    !vocabularyTitle ||
    !languageYouKnow ||
    !languageToLearn
  ) {
    return errorResponse(
      "Missing required fields in payload: words, vocabularyTitle, languageYouKnow, languageToLearn.",
      400,
    );
  }

  const apiKey = getEnvVariable("GEMINI_API_KEY");
  if (!apiKey) {
    return errorResponse(
      "GEMINI_API_KEY is not set in environment variables.",
      500,
      "API_KEY_MISSING",
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    const generationConfig = {
      temperature: 0.7,
      topK: 1,
      topP: 1,
      maxOutputTokens: 8192,
      response_mime_type: "application/json",
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const wordList = words.map((w: WordDetail) => w.word).join(", ");

    const prompt = `
      You are a creative storyteller for a language learning app.
      Your task is to create an engaging and coherent story using a specific list of words from a vocabulary titled "${vocabularyTitle}".
      The story is for a user learning ${languageToLearn}, and who knows ${languageYouKnow}.
      The vocabulary words provided are in ${languageYouKnow}. The words are: ${wordList}.

      The story must be broken down into several "bits" or parts. Each bit must prominently feature one of the provided vocabulary words.
      The number of story bits must be exactly equal to the number of words provided (${words.length} words = ${words.length} bits).
      The story bits must flow logically and form a single, connected narrative.

      For each story bit, you must provide:
      1.  "word": The specific vocabulary word (from the provided list, in ${languageYouKnow}) that is central to this bit.
      2.  "storyBitDescription": A short description of this part of the story (1-2 sentences) IN ${languageToLearn}. This description should naturally incorporate or be about the specified "word".
      3.  "storyBitDescriptionInLanguageYouKnow": The SAME story description, but translated accurately into ${languageYouKnow}.
      4.  "imagePrompt": A detailed, captivating prompt (in English) for an AI image generator to create an illustration for this story bit. The prompt should describe a scene that visually represents the storyBitDescription (the ${languageToLearn} version). Maintain a consistent artistic style across all image prompts (e.g., "digital painting, vibrant colors, whimsical style" or "Studio Ghibli inspired anime style") and keep character consistency among story bits keeping characters detailed description for every story bit.

      The output MUST be a valid JSON array of objects, where each object represents a story bit and has the following structure:
      {
        "word": "the ${languageYouKnow} word",
        "storyBitDescription": "the story segment in ${languageToLearn}",
        "storyBitDescriptionInLanguageYouKnow": "the story segment in ${languageYouKnow}",
        "imagePrompt": "the detailed image prompt in English"
      }

      Ensure the story is age-appropriate and engaging for language learners.
      Make sure to use all the words from the list: ${wordList}.
      Do not include any extra text or explanation outside of the JSON array.
    `;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
      safetySettings,
    });

    const response = result.response;
    const geminiStoryResponseText = response.text();

    if (!geminiStoryResponseText) {
      return errorResponse(
        "Received an empty response from Gemini API.",
        500,
        "GEMINI_EMPTY_RESPONSE",
      );
    }

    let geminiStoryParsedResponse: GeminiStoryBit[];
    try {
      geminiStoryParsedResponse = JSON.parse(geminiStoryResponseText);
    } catch (parseError: unknown) {
      console.error(
        "Failed to parse Gemini response in Edge Function:",
        parseError,
      );
      return errorResponse(
        `Failed to parse JSON response from Gemini. Raw response snippet: ${
          geminiStoryResponseText.substring(
            0,
            300,
          )
        }...`,
        500,
        {
          error: parseError instanceof Error
            ? parseError.message
            : String(parseError),
          response: geminiStoryResponseText.substring(0, 200) + "...",
        },
      );
    }

    if (
      !Array.isArray(geminiStoryParsedResponse) ||
      geminiStoryParsedResponse.length !== words.length
    ) {
      return errorResponse(
        `Gemini response is not a valid array or does not match the expected number of story bits. Expected ${words.length}, got ${geminiStoryParsedResponse.length}.`,
        500,
        "GEMINI_RESPONSE_MISMATCH",
      );
    }

    geminiStoryParsedResponse.forEach((bit, index) => {
      if (
        !bit.word ||
        !bit.storyBitDescription ||
        !bit.storyBitDescriptionInLanguageYouKnow ||
        !bit.imagePrompt
      ) {
        // This error will be caught by the main try-catch and returned as a 500
        throw new Error(
          `Gemini response bit ${index} is missing required fields (word, storyBitDescription, storyBitDescriptionInLanguageYouKnow, or imagePrompt). Bit: ${
            JSON.stringify(
              bit,
            )
          }`,
        );
      }
    });

    // const storyBitsForS3 = geminiStoryParsedResponse.map((bit) => ({
    //   textToImageParams: {
    //     text: bit.imagePrompt,
    //   },
    // }));

    // let s3Result;
    // try {
    //   // const s3Url = await uploadStoryBitsToS3(storyBitsForS3);
    //   s3Result = await uploadStoryBitsToS3(storyBitsForS3, storyId);
    //   // console.log("✅ Image prompts uploaded to:", s3Url);
    //   console.log("✅ Story bits uploaded to S3 successfully.", s3Result);
    // } catch (err) {
    //   console.error("❌ Failed to upload story prompts to S3:", err);
    // }

    // geminiStoryParsedResponse.s3Result = s3Result;
    return jsonResponse(geminiStoryParsedResponse);
  } catch (error: unknown) {
    console.error(
      "Error in Supabase Edge Function 'generate-story-with-gemini':",
      error,
    );
    // Check for specific Gemini API error structures if available from SDK
    // For example, error.response?.promptFeedback might contain safety-related blocks
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: string }).message === "string" &&
      (error as { message: string }).message.includes("SAFETY")
    ) {
      return errorResponse(
        "Content generation blocked by Gemini due to safety settings.",
        400, // Bad request, as the prompt might need adjustment
        {
          code: "GEMINI_SAFETY_BLOCK",
          originalError: (error as { message: string }).message,
        },
      );
    }
    return errorResponse(
      `An unexpected error occurred: ${
        typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message?: string }).message === "string"
          ? (error as { message: string }).message
          : "Unknown error"
      }`,
      500,
      {
        code: "EDGE_FUNCTION_UNEXPECTED_ERROR",
        originalError: typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message?: string }).message === "string"
          ? (error as { message: string }).message
          : String(error),
      },
    );
  }
});
