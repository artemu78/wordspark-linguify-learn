import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEnvVariable, corsHeaders } from "../_shared/common-lib.ts";

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      getEnvVariable("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      getEnvVariable("SUPABASE_ANON_KEY") ?? "",
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Fetch languages from the 'languages' table.
    const { data, error } = await supabaseClient
      .from("languages")
      .select("id, name, code")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ languages: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Error fetching languages:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

/*
To deploy this function:
1. Ensure you have the Supabase CLI installed and are logged in.
2. Navigate to your Supabase project root in the terminal.
3. Run: `supabase functions deploy get-languages --project-ref YOUR_PROJECT_REF`
   (Replace YOUR_PROJECT_REF with your actual Supabase project reference)

To invoke locally for testing (after `supabase start`):
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/get-languages' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{}'

Make sure your `supabase/functions/_shared/cors.ts` file exists. If not, create it with:
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
*/
