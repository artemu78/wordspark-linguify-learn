import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getEnvVariable, corsHeaders } from "../_shared/common-lib.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { word, sourceLanguage, targetLanguage } = await req.json();

    if (!word || !sourceLanguage || !targetLanguage) {
      throw new Error(
        "Missing required parameters: word, sourceLanguage, targetLanguage"
      );
    }

    const apiKey = getEnvVariable("GEMINI_API_KEY");

    const prompt = `Translate the word "${word}" from ${sourceLanguage} to ${targetLanguage}. 
    
    Return only the translation, no other text or explanation. Just the translated word.`;

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
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 256,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error?.message || "Unknown error";
      const status = errorBody?.error?.status || response.status;
      throw new Error(`Gemini API error: ${status} - ${message}`);
    }

    const data = await response.json();
    const translation = data.candidates[0]?.content?.parts[0]?.text?.trim();

    if (!translation) {
      throw new Error("No translation generated from Gemini API");
    }

    return new Response(
      JSON.stringify({
        translation,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in translate-word function:", error);
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
