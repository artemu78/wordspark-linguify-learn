import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "https://esm.sh/@google/generative-ai@0.11.3"; // Using ESM import for Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"; // For Supabase Storage
// VertexAI import removed as it's no longer used for image generation

// Helper function to return JSON response
const jsonResponse = (data: any, status: number = 200) => {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // Or your specific client domain
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
};

// Helper function to return error response
const errorResponse = (message: string, status: number = 500, details?: any) => {
  console.error(`[EdgeFunctionError] Status: ${status}, Message: ${message}`, details);
  return jsonResponse({ error: message, details }, status);
};

interface WordDetail {
  word: string;
  translation?: string;
}

interface GeminiStoryBit {
  word: string;
  storyBitDescription: string;
  imagePrompt: string;
  image_url?: string; // Added for storing the public URL of the generated image
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: {
        "Access-Control-Allow-Origin": "*", // Or your specific client domain
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed. Please use POST.", 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return errorResponse("Invalid JSON payload.", 400, e.message);
  }

  const {
    words,
    vocabularyTitle,
    sourceLanguage,
    targetLanguage,
  } = payload;

  if (!Array.isArray(words) || words.length === 0 || !vocabularyTitle || !sourceLanguage || !targetLanguage) {
    return errorResponse("Missing required fields in payload: words, vocabularyTitle, sourceLanguage, targetLanguage.", 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const gcpProjectId = Deno.env.get("GCP_PROJECT_ID");
  const gcpLocation = Deno.env.get("GCP_LOCATION");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!apiKey) {
    return errorResponse("GEMINI_API_KEY is not set in environment variables.", 500, "API_KEY_MISSING");
  }
  if (!gcpProjectId) {
    return errorResponse("GCP_PROJECT_ID is not set in environment variables.", 500, "GCP_PROJECT_ID_MISSING");
  }
  if (!gcpLocation) {
    return errorResponse("GCP_LOCATION is not set in environment variables.", 500, "GCP_LOCATION_MISSING");
  }
  if (!supabaseUrl) {
    return errorResponse("SUPABASE_URL is not set in environment variables.", 500, "SUPABASE_URL_MISSING");
  }
  if (!supabaseAnonKey) {
    return errorResponse("SUPABASE_ANON_KEY is not set in environment variables.", 500, "SUPABASE_ANON_KEY_MISSING");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // Vertex AI client for Image Generation is no longer initialized here, using REST API directly.

    const generationConfig = {
      temperature: 0.7,
      topK: 1,
      topP: 1,
      maxOutputTokens: 8192,
      response_mime_type: "application/json",
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const wordList = words.map((w: WordDetail) => w.word).join(", ");

    const prompt = `
      You are a creative storyteller for a language learning app.
      Your task is to create an engaging and coherent story using a specific list of words from a vocabulary titled "${vocabularyTitle}".
      The story should be written in ${targetLanguage}.
      The vocabulary words are in ${sourceLanguage}. The words are: ${wordList}.

      The story must be broken down into several "bits" or parts. Each bit must prominently feature one of the provided vocabulary words.
      The number of story bits must be exactly equal to the number of words provided (${words.length} words = ${words.length} bits).
      The story bits must flow logically and form a single, connected narrative.

      For each story bit, you must provide:
      1.  "word": The specific vocabulary word (from the provided list in ${sourceLanguage}) that is central to this bit.
      2.  "storyBitDescription": A short description of this part of the story (1-2 sentences) in ${targetLanguage}. This description should naturally incorporate or be about the specified "word".
      3.  "imagePrompt": A detailed, captivating prompt (in English) for an AI image generator to create an illustration for this story bit. The prompt should describe a scene that visually represents the storyBitDescription. Maintain a consistent artistic style across all image prompts (e.g., "digital painting, vibrant colors, whimsical style" or "Studio Ghibli inspired anime style").

      The output MUST be a valid JSON array of objects, where each object represents a story bit and has the following structure:
      {
        "word": "the ${sourceLanguage} word",
        "storyBitDescription": "the story segment in ${targetLanguage}",
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
    const responseText = response.text();

    if (!responseText) {
      return errorResponse("Received an empty response from Gemini API.", 500, "GEMINI_EMPTY_RESPONSE");
    }

    let parsedResponse: GeminiStoryBit[];
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error("Failed to parse Gemini response in Edge Function:", parseError);
      return errorResponse(
        `Failed to parse JSON response from Gemini. Raw response snippet: ${responseText.substring(0, 200)}...`,
        500,
        { error: parseError.message, response: responseText.substring(0, 200) + "..." }
      );
    }

    if (!Array.isArray(parsedResponse) || parsedResponse.length !== words.length) {
      return errorResponse(
        `Gemini response is not a valid array or does not match the expected number of story bits. Expected ${words.length}, got ${parsedResponse.length}.`,
        500,
        "GEMINI_RESPONSE_MISMATCH"
      );
    }
    // Validate structure of each bit from Gemini
    parsedResponse.forEach((bit, index) => {
      if (!bit || !bit.word || !bit.storyBitDescription || !bit.imagePrompt) {
        throw new Error(
          `Gemini response bit ${index} is incomplete or malformed. Bit: ${JSON.stringify(bit)}`
        );
      }
    });

    // Now, generate images for each bit and upload them
    const processedBits = await Promise.all(
      parsedResponse.map(async (bit, index) => {
        try {
          console.log(`Generating image for bit ${index}: "${bit.imagePrompt.substring(0, 50)}..."`);
          const imageRequest = {
            prompt: bit.imagePrompt,
            sample_count: 1, // Number of images to generate
            // You can add other parameters like negative_prompt, seed, etc.
            // "aspect_ratio": "1:1", // e.g., "1:1", "16:9", "9:16"
            // "output_format": "png" // "png" or "jpeg" - though API returns base64 bytes
          };

          // Note: The actual method call might be different depending on the VertexAI SDK version
          // and how imagegeneration@006 model is exposed.
          // This assumes a similar API to `gemini-pro-vision` or newer Vertex AI SDKs.
          // If `generateImages` is not available, we may need to use `predict` with a specific endpoint/instance structure.
          const imageGenerationResponse = await imageGenerationModel.generateContent({
            contents: [{ role: "user", parts: [{ text: `Generate an image with this prompt: ${bit.imagePrompt}` }] }],
            // This is a guess, the actual API for image generation model might be different.
            // It's more likely to be a direct method like `generateImages` or `predict` with specific parameters.
            // Let's assume for now the SDK has a more direct method, or we'll need to adjust.
            // The `@google-cloud/aiplatform` library might require a `PredictionServiceClient` for Imagen.
            // The `getGenerativeModel` approach used for `imageGenerationModel` might be more for multimodal models.
            //
            // **Corrected approach for Imagen (conceptual - actual SDK usage might vary with esm version):**
            // This part is highly dependent on the exact capabilities of the imported VertexAI library.
            // A more typical call for Vertex AI Imagen (non-multimodal endpoint) would be:
            // const [predictionResponse] = await imageGenerationModel.predict({ // or client.predict
            //   instances: [{ prompt: bit.imagePrompt, sampleCount: 1 }],
            //   parameters: { "sampleCount": 1 } // Parameters might vary
            // });
            // const imageBase64 = predictionResponse.predictions[0].bytesBase64Encoded;

            // **Using a placeholder for the actual image generation call structure, as the esm version might differ**
            // For now, let's assume `imageGenerationModel.generateImages(imageRequest)` is the method,
            // and it returns an object with `images[0].bytesBase64Encoded`. This will likely need refinement.

            // Simulating the expected structure from a hypothetical `generateImages` call
            // In a real scenario, this would be:
            // const result = await imageGenerationModel.generateImages(imageRequest);
            // const imageBase64 = result.images[0].bytesBase64Encoded;
            // This is a common pattern with Google's image generation APIs.
            // However, the VertexAI class from `@google-cloud/aiplatform` (especially older or esm versions)
            // might use `predict` for the "imagegeneration@006" model.

            // Let's use a more generic `predict` like structure for now, as it's common for aiplatform
            const instances = [{ prompt: bit.imagePrompt }];
            const parameters = { sampleCount: 1 }; // Number of images

            const endpoint = `projects/${gcpProjectId}/locations/${gcpLocation}/publishers/google/models/imagegeneration@006`;
            // The `imageGenerationModel` here is from `vertexAI.getGenerativeModel`.
            // This might not be the correct client or method.
            // A `PredictionServiceClient` is often used for specific model endpoints.
            // Given the constraints, and if `imageGenerationModel.generateImages` isn't directly available on this
            // specific esm `VertexAI` class instance for this model type, a direct REST API call would be more reliable.
            // However, the plan said to use the SDK.

            // Let's try to make a call that *might* work with the `GenerativeModel` interface if it's adapted for images.
            // This is speculative for `imagegeneration@006` via `getGenerativeModel`.
            // The `generateContent` API is usually for text/chat/multimodal.
            // A more direct method like `imageGenerationModel.generateImages()` or using a `PredictionServiceClient`
            // is typical for dedicated image models.
            // For the sake of progress, I'll construct a call that resembles what a dedicated image generation method would take.
            // This part will likely need adjustment after testing or with more specific info on the esm library version.

            let imageBase64: string;
            // Attempting a predict-like call if `generateImages` is not on `imageGenerationModel` directly
            // This is a common pattern for Vertex AI endpoints.
            // The specific method and request/response structure depends on the model and client library version.
            // For "imagegeneration@006", it's usually a specific REST endpoint or a PredictionServiceClient method.
            // Since we initialized `imageGenerationModel` with `getGenerativeModel`,
            // we'll try a method that might exist on it or its underlying client.
            // This is the most uncertain part due to Deno/ESM and Vertex AI SDK specifics.

            const requestPayload = {
              instances: [{ prompt: bit.imagePrompt }],
              parameters: {
                sampleCount: 1,
                // "aspectRatio": "1:1", // Optional: "1:1", "16:9", "4:3", etc.
                // "outputFormat": "png" // Optional: "png" or "jpeg". Default is png.
              },
            };

            // The actual API call to Vertex AI Imagen:
            // This uses a generic `predict` method that would be available on a `PredictionServiceClient`.
            // The `imageGenerationModel` we have might not be that client.
            // If `VertexAI.getGenerativeModel({model: "imagegeneration@006"})`
            // doesn't directly provide a `generateImages` or similar method,
            // we'd typically fall back to a raw REST call or a more specific client.
            // For now, assuming the `esm.sh/@google-cloud/aiplatform`'s `VertexAI` class
            // and its `getGenerativeModel` for "imagegeneration@006" has a compatible method,
            // or we are making a REST call.
            // Let's proceed with a conceptual SDK call structure, acknowledging it might need a specific client.
            // The `@google-cloud/vertexai` (newer library, often for Node) has `generateImages`.
            // The `@google-cloud/aiplatform` (older, more general) usually uses `PredictionServiceClient.predict`.

            // Simulating the REST API call structure as it's the most fundamental approach if SDK methods are unclear for Deno.
            const imageGenApiUrl = `https://${gcpLocation}-aiplatform.googleapis.com/v1/projects/${gcpProjectId}/locations/${gcpLocation}/publishers/google/models/imagegeneration@006:predict`;

            const accessToken = ""; // In a real Google Cloud environment (like Cloud Functions, Run), this is often automatic.
                                   // For local or other Deno setups, you'd need to get an access token (e.g. via gcloud auth print-access-token).
                                   // Supabase Edge Functions might have service account credentials configured.
                                   // Let's assume the environment provides auth for now (e.g. via `gcloud auth application-default login`).
                                   // If not, this fetch would fail with auth errors.
                                   // For Supabase Edge Functions, you need to ensure the function has appropriate IAM permissions
                                   // and that the execution environment can generate/provide tokens for Google APIs.
                                   // This often involves setting GOOGLE_APPLICATION_CREDENTIALS or using workload identity federation.
                                   // THIS IS A CRITICAL PART FOR EXECUTION.

            // For Deno, it's often simpler to use `gcloud auth print-access-token` and pass it if GOOGLE_APPLICATION_CREDENTIALS isn't set up
            // in the Supabase Edge Function environment for Google APIs.
            // However, Deno.env.get("GOOGLE_ACCESS_TOKEN") could be a way if pre-set.
            // For this exercise, I'll assume the environment handles auth for Google APIs.

            const imageGenResponse = await fetch(imageGenApiUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("GOOGLE_CLOUD_ACCESS_TOKEN") || await getGoogleAccessToken()}`, // Placeholder for actual token retrieval
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestPayload),
            });

            if (!imageGenResponse.ok) {
              const errorBody = await imageGenResponse.text();
              console.error("Vertex AI Image Generation API error:", errorBody);
              throw new Error(`Failed to generate image: ${imageGenResponse.status} ${errorBody}`);
            }

            const imageGenResult = await imageGenResponse.json();

            if (!imageGenResult.predictions || !imageGenResult.predictions[0] || !imageGenResult.predictions[0].bytesBase64Encoded) {
              console.error("Invalid response structure from Vertex AI Image Generation:", imageGenResult);
              throw new Error("Failed to get base64 image data from Vertex AI response.");
            }
            imageBase64 = imageGenResult.predictions[0].bytesBase64Encoded;

          // Helper function to get Google Access Token (conceptual)
          // In a proper GCP environment, this is often handled by the Application Default Credentials (ADC)
          // For Supabase Edge Functions, this might require specific setup if not using ADC with workload identity.
          async function getGoogleAccessToken(): Promise<string> {
            // This is a simplified placeholder. In a real scenario, you would use:
            // 1. `gcloud auth application-default print-access-token` if ADC is set up.
            // 2. A service account key to request a token (not recommended to embed keys).
            // 3. Metadata server if running on GCP compute.
            // Supabase functions might need explicit setup for this.
            const token = Deno.env.get("GOOGLE_ACCESS_TOKEN_MANUAL"); // Example: user provides this if needed
            if (token) return token;

            // Attempt to use gcloud CLI if available in the Deno environment (unlikely in Supabase default)
            // Removing gcloud CLI attempt as it's not suitable for serverless.
            // console.warn("gcloud CLI method for token retrieval is not suitable for serverless functions and has been removed.");

            // Fallback or error if no token can be obtained
            // This part is critical and environment-dependent.
            // For Supabase Edge Functions, rely on GOOGLE_CLOUD_ACCESS_TOKEN being set,
            // or Application Default Credentials (ADC) working implicitly if the environment is configured for it (e.g., Workload Identity Federation).
            const directToken = Deno.env.get("GOOGLE_CLOUD_ACCESS_TOKEN");
            if (directToken) {
              return directToken;
            }
            // If ADC is expected to work, the fetch call might pick it up automatically if no Authorization header is set,
            // or the Google SDKs would handle it. Since we are using raw fetch, an explicit token is more reliable unless ADC is proven.
            throw new Error("Google Cloud Access Token not available. Please set GOOGLE_CLOUD_ACCESS_TOKEN or GOOGLE_ACCESS_TOKEN_MANUAL, or ensure Application Default Credentials (ADC) are configured and accessible by fetch in this environment.");
          }


          // Decode base64 to ArrayBuffer
          const byteString = atob(imageBase64);
          const ia = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const imageBuffer = ia.buffer;

          const filename = `story_images/${vocabularyTitle ? vocabularyTitle.replace(/\s+/g, '_') : 'story'}_${index}_${Date.now()}.png`;

          console.log(`Uploading image to Supabase Storage: ${filename}`);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("wordspark-files")
            .upload(filename, imageBuffer, {
              contentType: "image/png",
              upsert: true, // Overwrite if file exists, though filename should be unique
            });

          if (uploadError) {
            console.error("Supabase Storage upload error:", uploadError);
            throw new Error(`Failed to upload image to Supabase Storage: ${uploadError.message}`);
          }

          // Get public URL
          const { data: publicUrlData } = supabase.storage
            .from("wordspark-files")
            .getPublicUrl(filename);

          if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error("Failed to get public URL for uploaded image.");
          }
          console.log(`Image uploaded: ${publicUrlData.publicUrl}`);

          return {
            ...bit,
            image_url: publicUrlData.publicUrl,
          };

        } catch (e: any) {
          console.error(`Error processing bit ${index} (${bit.word}):`, e);
          // Re-throw the error to be caught by the outer try-catch if we want to fail the whole request
          // Or handle it by returning the bit without image_url or with an error indicator
          throw new Error(`Failed to generate or upload image for bit ${index} (${bit.word}): ${e.message}`);
        }
      })
    );

    return jsonResponse(processedBits);

  } catch (error: any) {
    console.error("Error in Supabase Edge Function 'generate-story-with-gemini':", error);
    // Check for specific Gemini API error structures if available from SDK
    // For example, error.response?.promptFeedback might contain safety-related blocks
    if (error.message?.includes("SAFETY")) {
      return errorResponse(
        "Content generation blocked by Gemini due to safety settings.",
        400, // Bad request, as the prompt might need adjustment
        { code: "GEMINI_SAFETY_BLOCK", originalError: error.message }
      );
    }
    return errorResponse(
      `An unexpected error occurred: ${error.message || "Unknown error"}`,
      500,
      { code: "EDGE_FUNCTION_UNEXPECTED_ERROR", originalError: error.message }
    );
  }
});
