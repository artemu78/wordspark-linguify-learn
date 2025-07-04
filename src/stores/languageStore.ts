import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client"; // Assuming you have a Supabase client initialized

interface Language {
  id: number | string; // Depending on your DB schema (bigint or uuid)
  name: string;
  code: string;
}

interface LanguageState {
  languages: Language[];
  loading: boolean;
  error: string | null;
  hasFetched: boolean; // To prevent multiple fetches
  fetchLanguages: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  languages: [],
  loading: false,
  error: null,
  hasFetched: false,
  fetchLanguages: async () => {
    if (get().hasFetched || get().loading) {
      // Don't fetch if already fetched or currently loading
      return;
    }

    set({ loading: true, error: null });
    try {
      // const { data, error } = await supabase.functions.invoke('get-languages');
      // Supabase function invocation returns a response object, data is on response.data
      const { data: functionResponse, error: functionError } =
        await supabase.functions.invoke("get-languages");

      if (functionError) {
        throw functionError;
      }

      // The actual language data is nested under a 'languages' key as per our edge function
      const languages = functionResponse?.languages;

      if (!languages) {
        // This case handles if the 'languages' key is missing or functionResponse itself is null/undefined
        console.error(
          "No languages data found in function response:",
          functionResponse
        );
        throw new Error("No languages data returned from the server.");
      }

      set({ languages, loading: false, hasFetched: true, error: null });
    } catch (error: any) {
      console.error("Error fetching languages:", error);
      set({ error: error.message, loading: false, hasFetched: false }); // Set hasFetched to false to allow retrying
    }
  },
}));

// Optional: Log store changes for debugging (remove in production)
useLanguageStore.subscribe((state, prevState) => {
  if (state.error !== prevState.error && state.error) {
    console.error("Language store error:", state.error);
  }
});

// Example of how to initialize the Supabase client if you don't have one
// You would typically have this in a separate file like `src/supabaseClient.ts`
/*
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL or Anon Key is missing. Make sure REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY are set in your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
*/
