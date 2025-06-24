import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const {
      topic,
      sourceLanguage,
      targetLanguage,
      wordCount = 10,
    } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const prompt = `Generate ${wordCount} vocabulary words for the topic "${topic}" in ${sourceLanguage} language with their translations to ${targetLanguage}. 
    
    Return the response as a JSON array where each object has this exact structure:
    {
      "word": "word in ${sourceLanguage}",
      "translation": "translation in ${targetLanguage}"
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
      }
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
    const vocabularyWords = JSON.parse(jsonMatch[0]);
    return new Response(
      JSON.stringify({
        vocabularyWords,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
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
      }
    );
  }
});
