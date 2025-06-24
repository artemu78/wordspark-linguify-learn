import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { word, languageCode } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");

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
    // Note: The exact API endpoint and request payload for TTS might differ.
    // This is a placeholder based on common patterns for Gemini.
    // You'll need to replace this with the actual Gemini TTS API details.
    const ttsResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/text:synthesizeSpeech?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { text: word },
          voice: { languageCode: languageCode, name: `${languageCode}-Standard-A` }, // Example voice
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorBody = await ttsResponse.json().catch(() => null);
      const message = errorBody?.error?.message || "Unknown error";
      const status = errorBody?.error?.status || ttsResponse.status;
      throw new Error(`Gemini API TTS error: ${status} - ${message}`);
    }

    const audioContentBase64 = await ttsResponse.json();
    const audioContent = Uint8Array.from(atob(audioContentBase64.audioContent), c => c.charCodeAt(0));


    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const fileName = `${languageCode}_${word.replace(/\s+/g, '_')}.mp3`;
    const filePath = `${fileName}`; // Store directly in the bucket root for simplicity

    // Upload audio to Supabase Storage
    const { data: storageData, error: storageError } = await supabaseClient.storage
      .from("audio_files") // Make sure this bucket exists and has appropriate policies
      .upload(filePath, audioContent, {
        contentType: "audio/mpeg",
        upsert: true, // Overwrite if file already exists
      });

    if (storageError) {
      throw new Error(`Supabase Storage error: ${storageError.message}`);
    }

    // Get public URL for the uploaded file
    const { data: publicUrlData } = supabaseClient.storage
      .from("audio_files")
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error("Could not get public URL for audio file");
    }

    return new Response(
      JSON.stringify({
        audioUrl: publicUrlData.publicUrl,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in generate-audio function:", error);
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
      }
    );
  }
});
