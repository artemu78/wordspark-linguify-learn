import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const getEnvVariable = (varName: string) => {
  const value = Deno.env.get(varName);
  if (!value) {
    throw new Error(`Environment variable ${varName} is not set`);
  }
  return value;
};

const ELEVENLABS_VOICE_ID = "9BWtsMINqrJLrRacOk9x";
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
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
// Helper function to handle Supabase storage upload and get public URL
async function uploadToStorage(filePath, data, contentType) {
  const supabaseClient = createClient(
    getEnvVariable("SUPABASE_URL") ?? "",
    getEnvVariable("SUPABASE_SERVICE_ROLE_KEY") ?? ""
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
    const { word, languageCode } = await req.json();
    const apiKey = getEnvVariable("GEMINI_API_KEY");
    if (!word) {
      throw new Error("Missing 'word' in request body");
    }
    if (!languageCode) {
      throw new Error("Missing 'languageCode' in request body");
    }
    if (!apiKey) {
      throw new Error("Missing 'GEMINI_API_KEY' environment variable");
    }
    // Generate audio using Gemini API (Text-to-Speech)
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": getEnvVariable("ELEVENLABS_API_KEY"),
        },
        body: JSON.stringify({
          text: word,
          model_id: ELEVENLABS_MODEL_ID,
        }),
      }
    );
    if (!ttsResponse.ok) {
      // const errorBody = await ttsResponse.json().catch(()=>null);
      // const message = errorBody?.error?.message || "Unknown error";
      // const status = errorBody?.error?.status || ttsResponse.status;
      // throw new Error(`ElevenLabs API TTS error: ${status} - ${message}`);
      throw new Error(`ElevenLabs API TTS error`);
    }
    let audioContent;
    try {
      // Read the audio content as a Uint8Array from the response body
      const arrayBuffer = await ttsResponse.arrayBuffer();
      audioContent = new Uint8Array(arrayBuffer);
    } catch (e) {
      console.error("Failed to read audio content from response");
      throw new Error("Failed to read audio data");
    }
    const audioFileName = transliterate(
      `${languageCode}_${word.replace(/\s+/g, "_")}.mp3`
    );
    let audioUrl;
    try {
      audioUrl = await uploadToStorage(
        audioFileName,
        audioContent,
        "audio/mpeg"
      );
    } catch (e) {
      throw new Error("error in uploadToStorage" + e.message.toString());
    }
    let functionResponse;
    try {
      functionResponse = new Response(
        JSON.stringify({
          audioUrl,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (e) {
      throw new Error("Failed to read audio data");
    }
    return functionResponse;
  } catch (error) {
    console.error("Error in generate-audio function:", error);
    return new Response(
      JSON.stringify({
        "Error in generate-audio function:": error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
