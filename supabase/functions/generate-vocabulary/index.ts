import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getEnvVariable } from "../_shared/common-lib.ts";

function transliterate(str) {
  const normalizedNFD = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
    .replace(/ç/g, "c")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u");
  const normalizedNFC = normalizedNFD.normalize("NFC");
  const normalizedNFKD = normalizedNFD.normalize("NFKD");
  const normalizedNFKC = normalizedNFD.normalize("NFKC");
  // Ensure the string contains only Latin letters and numbers
  const latinOnly = normalizedNFKC.replace(/[^a-zA-Z0-9]/g, "");
  return latinOnly;
}

// Call gemini API to generate vocabulary image
async function generateVocabularyImage(sourceLanguage, targetLanguage, topic) {
  const apiKey = getEnvVariable("GEMINI_API_KEY");
  const imagenResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [
          {
            prompt:
              `Generate an image that visually represents vocabulary with the topic "${topic}" in ${sourceLanguage} language with their translations to ${targetLanguage}. The image should be educational and visually appealing, suitable for a language learning context.`,
          },
        ],
        parameters: {
          sampleCount: 1,
        },
      }),
    },
  );
  if (!imagenResponse.ok) {
    const errorBody = await imagenResponse.json().catch(() => null); // safely parse JSON
    const message = errorBody?.error?.message || "Unknown error";
    const status = errorBody?.error?.status || imagenResponse.status;
    throw new Error(`Imagen API error: ${status} - ${message}`);
  }
  const imagenData = await imagenResponse.json();
  if (!imagenData || !imagenData.predictions || !imagenData.predictions[0]) {
    throw new Error(
      "Invalid response from Imagen API: " +
        imagenResponse.statusText +
        "\n" +
        JSON.stringify(imagenData, null, 2),
    );
  }
  let imageContent;
  try {
    // Check if the prediction contains an image
    const prediction = imagenData.predictions[0];
    if (!prediction || !prediction.bytesBase64Encoded) {
      throw new Error("No image generated by Imagen API");
    }
    // Extract the base64 part of the image data
    const base64Image = prediction.bytesBase64Encoded;
    // Decode the base64 string to a Uint8Array
    const binaryString = atob(base64Image);
    imageContent = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imageContent[i] = binaryString.charCodeAt(i);
    }
  } catch (e) {
    console.error("Failed to decode image data from response", e);
    throw new Error("Failed to decode image data from response");
  }
  // } catch (e) {
  //   console.error("Failed to read content from response");
  //   throw new Error("Failed to read image data");
  // }
  let coverImageUrl;
  const fileName = `${
    transliterate(
      `covers/${sourceLanguage}_${targetLanguage}_${topic}`,
    )
  }.png`;
  try {
    coverImageUrl = await uploadToStorage(fileName, imageContent, "image/png");
  } catch (e) {
    throw new Error("error in uploadToStorage" + e.message.toString());
  }
  return coverImageUrl;
}
// Helper function to handle Supabase storage upload and get public URL
async function uploadToStorage(filePath, data, contentType) {
  const supabaseClient = createClient(
    getEnvVariable("SUPABASE_URL") ?? "",
    getEnvVariable("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { error: storageError } = await supabaseClient.storage
    .from(getEnvVariable("BUCKET_NAME"))
    .upload(filePath, data, {
      contentType,
      upsert: true,
    });
  if (storageError) {
    throw new Error(`Supabase Storage error: ${storageError.message}`);
  }
  const { data: publicUrlData } = supabaseClient.storage
    .from(getEnvVariable("BUCKET_NAME"))
    .getPublicUrl(filePath);
  if (!publicUrlData || !publicUrlData.publicUrl) {
    throw new Error("Could not get public URL for file");
  }
  return publicUrlData.publicUrl;
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }
  try {
    const {
      topic,
      languageToLearn,
      languageYouKnow,
      wordCount = 10,
    } = await req.json();
    const apiKey = getEnvVariable("GEMINI_API_KEY");
    const prompt =
      `Generate ${wordCount} vocabulary words for the topic "${topic}" in ${languageToLearn} language with their translations to ${languageYouKnow}. 
    
    Return the response as a JSON array where each object has this exact structure:
    {
      "word": "word in ${languageToLearn}",
      "translation": "translation in ${languageYouKnow}"
    }
    
    Only return the JSON array, no other text or explanation.`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      },
    );
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null); // safely parse JSON
      const message = errorBody?.error?.message || "Unknown error";
      const status = errorBody?.error?.status || response.status;
      throw new Error(`Gemini API error: ${status} - ${message}`);
    }
    const data = await response.json();
    const generatedText = data.candidates[0]?.content?.parts[0]?.text;
    if (!generatedText) {
      throw new Error("No content generated from Gemini API");
    }
    // Extract JSON from the response (in case there's extra text)
    const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not extract valid JSON from response");
    }
    let coverImageUrl = "";
    try {
      coverImageUrl = await generateVocabularyImage(
        languageToLearn,
        languageYouKnow,
        topic,
      );
    } catch (e) {
      console.error("Error generating vocabulary image:", e);
      throw new Error("Error generating vocabulary image: " + e.message);
    }
    const vocabularyWords = JSON.parse(jsonMatch[0]);
    return new Response(
      JSON.stringify({
        vocabularyWords,
        coverImageUrl,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error in generate-vocabulary function:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
