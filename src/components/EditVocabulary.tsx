import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"; // Added CardFooter
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Sparkles, BookPlus, Loader2, RefreshCw, Languages } from "lucide-react"; // Added BookPlus, Loader2, RefreshCw, Languages
import { Switch } from "@/components/ui/switch"; // Added Switch
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguageStore } from "@/stores/languageStore"; // Import the language store
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { generateAndSaveStory, StoryGenerationError } from "@/lib/storyUtils"; // Added

interface EditVocabularyProps {
  vocabularyId: string;
  onBack: () => void;
}

interface WordPair {
  id?: string;
  word: string;
  translation: string;
}

const EditVocabulary = ({ vocabularyId, onBack }: EditVocabularyProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [vocabularyImageUrl, setVocabularyImageUrl] = useState<string | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [languageYouKnow, setLanguageYouKnow] = useState("en"); // Renamed
  const [languageToLearn, setLanguageToLearn] = useState("es"); // Renamed
  const [isPublic, setIsPublic] = useState(false); // Added isPublic state
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);
  const [aiWordCount, setAiWordCount] = useState(10);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [isReGeneratingStory, setIsReGeneratingStory] = useState(false); // New state for re-generation
  const [translatingWords, setTranslatingWords] = useState<Set<number>>(new Set());

  // Language store integration
  const {
    languages,
    loading: languagesLoading,
    error: languagesError,
    fetchLanguages,
    hasFetched: languagesHasFetched,
  } = useLanguageStore();

  useEffect(() => {
    if (!languagesHasFetched) {
      fetchLanguages();
    }
  }, [fetchLanguages, languagesHasFetched]);

  // Fetch vocabulary details including story
  const { data: vocabularyData, isLoading: isLoadingVocabulary } = useQuery({
    queryKey: ["vocabularyWithStory", vocabularyId], // Updated queryKey
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vocabularies")
        .select(
          `
          *,
          stories (id)
        `
        )
        .eq("id", vocabularyId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch vocabulary words
  const { data: words = [], isLoading: isLoadingWords } = useQuery({
    queryKey: ["vocabularyWords", vocabularyId], // Consistent key
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vocabulary_words")
        .select("*")
        .eq("vocabulary_id", vocabularyId);

      if (error) throw error;
      return data;
    },
    enabled: !!vocabularyId, // Only run if vocabularyId is available
  });

  // Populate form when data is loaded
  useEffect(() => {
    if (vocabularyData) {
      setTitle(vocabularyData.title);
      setTopic(vocabularyData.topic);
      setLanguageYouKnow(vocabularyData.source_language); // DB field is source_language
      setLanguageToLearn(vocabularyData.target_language); // DB field is target_language
      setIsPublic(vocabularyData.is_public || false); // Set isPublic from fetched data
      setStoryId(vocabularyData.stories?.[0]?.id || null);
      setVocabularyImageUrl(vocabularyData.cover_image_url || null);
    }
  }, [vocabularyData]);

  useEffect(() => {
    if (words.length > 0) {
      setWordPairs(
        words.map((word) => ({
          id: word.id,
          word: word.word,
          translation: word.translation,
        }))
      );
    } else {
      setWordPairs([{ word: "", translation: "" }]);
    }
  }, [words]);

  const generateVocabularyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "generate-vocabulary",
        {
          body: {
            topic,
            languageYouKnow,
            languageToLearn,
            wordCount: aiWordCount,
          },
        }
      );

      if (error) {
        console.error("AI generation error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      setVocabularyImageUrl(data?.coverImageUrl || null); // Set image URL if available
      setWordPairs(
        data?.vocabularyWords?.map((word: any) => ({
          word: word.word,
          translation: word.translation,
        }))
      );
      toast({
        title: "Success!",
        description: `Generated ${data?.vocabularyWords.length} vocabulary words.`,
      });
    },
    onError: (error: any) => {
      console.error("AI generation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate vocabulary",
        variant: "destructive",
      });
    },
  });

  const updateVocabularyMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");

      // Update vocabulary
      const { error: vocabError } = await supabase
        .from("vocabularies")
        .update({
          title,
          topic,
          source_language: languageYouKnow, // DB field is source_language
          target_language: languageToLearn, // DB field is target_language
          updated_at: new Date().toISOString(),
          cover_image_url: vocabularyImageUrl, // Use the image URL if available
          is_public: isPublic, // Added is_public field
        })
        .eq("id", vocabularyId)
        .eq("created_by", user.id); // Ensure user owns this vocabulary

      if (vocabError) {
        console.error("Error updating vocabulary:", vocabError);
        throw vocabError;
      }

      // Delete existing words
      const { error: deleteError } = await supabase
        .from("vocabulary_words")
        .delete()
        .eq("vocabulary_id", vocabularyId);

      if (deleteError) {
        console.error("Error deleting existing words:", deleteError);
        throw deleteError;
      }

      // Insert new word pairs
      const wordsToInsert = wordPairs
        .filter((pair) => pair.word.trim() && pair.translation.trim())
        .map((pair) => ({
          vocabulary_id: vocabularyId,
          word: pair.word.trim(),
          translation: pair.translation.trim(),
        }));

      if (wordsToInsert.length > 0) {
        const { error: wordsError } = await supabase
          .from("vocabulary_words")
          .insert(wordsToInsert);

        if (wordsError) {
          console.error("Error inserting new words:", wordsError);
          throw wordsError;
        }
      }
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Vocabulary updated successfully.",
      });
      // Invalidate queries that would show this vocabulary, including its story status
      queryClient.invalidateQueries({ queryKey: ["vocabulariesWithStories"] });
      queryClient.invalidateQueries({
        queryKey: ["vocabularyWithStory", vocabularyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["vocabularyWords", vocabularyId],
      });
      // Potentially stay on page if we want to allow story creation immediately after edit.
      // For now, matching original behavior of going back.
      // If staying, ensure 'storyId' state is updated or re-fetched.
      onBack();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vocabulary",
        variant: "destructive",
      });
    },
  });

  const translateWordMutation = useMutation({
    mutationFn: async ({ word, index }: { word: string; index: number }) => {
      if (!languageToLearn || !languageYouKnow) {
        throw new Error("Languages not selected");
      }

      const { data, error } = await supabase.functions.invoke(
        "translate-word",
        {
          body: {
            word,
            sourceLanguage: languageToLearn, // Word is in language to learn
            targetLanguage: languageYouKnow, // Translate to language you know
          },
        }
      );

      if (error) throw error;
      return { translation: data.translation, index };
    },
    onSuccess: ({ translation, index }) => {
      updateWordPair(index, "translation", translation);
      setTranslatingWords(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
      toast({
        title: "Translation Complete",
        description: "Word translated successfully!",
      });
    },
    onError: (error: any, { index }) => {
      setTranslatingWords(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
      toast({
        title: "Translation Failed",
        description: error.message || "Failed to translate word",
        variant: "destructive",
      });
    },
  });

  const handleTranslateWord = (index: number) => {
    const word = wordPairs[index].word.trim();
    if (!word) {
      toast({
        title: "Error",
        description: "Please enter a word before translating.",
        variant: "destructive",
      });
      return;
    }

    if (!languageYouKnow || !languageToLearn) {
      toast({
        title: "Error",
        description: "Please select both languages before translating.",
        variant: "destructive",
      });
      return;
    }

    setTranslatingWords(prev => new Set(prev).add(index));
    translateWordMutation.mutate({ word, index });
  };

  const handleGenerateWithAI = () => {
    if (!topic.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic before generating with AI.",
        variant: "destructive",
      });
      return;
    }
    generateVocabularyMutation.mutate();
  };

  const addWordPair = () => {
    setWordPairs([...wordPairs, { word: "", translation: "" }]);
  };

  const removeWordPair = (index: number) => {
    if (wordPairs.length > 1) {
      setWordPairs(wordPairs.filter((_, i) => i !== index));
    }
  };

  const updateWordPair = (
    index: number,
    field: "word" | "translation",
    value: string
  ) => {
    const updated = [...wordPairs];
    updated[index][field] = value;
    setWordPairs(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !topic.trim()) {
      toast({
        title: "Error",
        description: "Please fill in the title and topic.",
        variant: "destructive",
      });
      return;
    }

    const validPairs = wordPairs.filter(
      (pair) => pair.word.trim() && pair.translation.trim()
    );
    if (validPairs.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one word pair.",
        variant: "destructive",
      });
      return;
    }

    updateVocabularyMutation.mutate();
  };

  const handleCreateStory = async () => {
    if (!vocabularyId || !user) {
      toast({
        title: "Error",
        description: "Vocabulary ID missing or user not authenticated.",
        variant: "destructive",
      });
      return;
    }
    if (!title) {
      // Ensure title is available (it should be from vocabularyData)
      toast({
        title: "Error",
        description: "Vocabulary title is missing.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingStory(true);
    try {
      const newStoryId = await generateAndSaveStory(vocabularyId);
      if (newStoryId) {
        toast({
          title: "Story Created!",
          description: "Your story has been successfully generated.",
        });
        setStoryId(newStoryId); // Update local state to reflect story creation
        queryClient.invalidateQueries({
          queryKey: ["vocabulariesWithStories"],
        });
        queryClient.invalidateQueries({
          queryKey: ["vocabularyWithStory", vocabularyId],
        });
      }
    } catch (error) {
      if (error instanceof StoryGenerationError) {
        toast({
          title: `Story Creation Failed: ${error.code || ""}`,
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Story Creation Failed",
          description: "An unexpected error occurred.",
          variant: "destructive",
        });
      }
      console.error("Story generation failed:", error);
    } finally {
      setIsCreatingStory(false);
    }
  };

  const handleReGenerateStory = async () => {
    if (!vocabularyId || !user || !storyId) {
      toast({
        title: "Error",
        description: "Cannot re-generate story. Essential data missing.",
        variant: "destructive",
      });
      return;
    }

    setIsReGeneratingStory(true);
    try {
      // Call a potentially modified or new utility function that handles deletion of old story first
      // For now, assuming generateAndSaveStory can be adapted or a new one is created in storyUtils
      // that handles deletion. Let's call it regenerateStory.
      // This function would internally call generateAndSaveStory after deleting the old one.
      // Or, we add a flag to generateAndSaveStory.
      // For simplicity, we'll call a new function in storyUtils later.
      // For now, we just log it.

      // Delete existing story and its bits first
      const { error: deleteBitsError } = await supabase
        .from("story_bits")
        .delete()
        .eq("story_id", storyId);

      if (deleteBitsError) {
        throw new StoryGenerationError(`Failed to delete old story bits: ${deleteBitsError.message}`, "DELETE_OLD_BITS_FAILED");
      }

      const { error: deleteStoryError } = await supabase
        .from("stories")
        .delete()
        .eq("id", storyId);

      if (deleteStoryError) {
        throw new StoryGenerationError(`Failed to delete old story: ${deleteStoryError.message}`, "DELETE_OLD_STORY_FAILED");
      }

      toast({ title: "Old story deleted", description: "Proceeding to generate a new one."});

      const newStoryId = await generateAndSaveStory(vocabularyId); // This needs to be the updated one
      if (newStoryId) {
        toast({
          title: "Story Re-generated!",
          description: "Your new story has been successfully generated.",
        });
        setStoryId(newStoryId); // Update local state
        queryClient.invalidateQueries({ queryKey: ["vocabulariesWithStories"] });
        queryClient.invalidateQueries({ queryKey: ["vocabularyWithStory", vocabularyId] });
        queryClient.invalidateQueries({ queryKey: ["storyBits", newStoryId] }); // Invalidate new story bits
        queryClient.invalidateQueries({ queryKey: ["storyBits", storyId] }); // Invalidate old story bits just in case
      }
    } catch (error) {
      if (error instanceof StoryGenerationError) {
        toast({
          title: `Story Re-generation Failed: ${error.code || ""}`,
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Story Re-generation Failed",
          description: "An unexpected error occurred.",
          variant: "destructive",
        });
      }
      console.error("Story re-generation failed:", error);
    } finally {
      setIsReGeneratingStory(false);
    }
  };


  if (isLoadingVocabulary || isLoadingWords) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-2xl font-bold text-gray-900">
          Edit Vocabulary: {title}
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vocabulary Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Form fields disable state includes isReGeneratingStory */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Basic French"
                  required
                  disabled={
                    updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., basic-words"
                  required
                  disabled={
                    updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is-public"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  disabled={
                    updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                  }
                />
                <Label htmlFor="is-public">Make vocabulary public</Label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language to learn</Label>
                <Select
                  value={languageToLearn}
                  onValueChange={setLanguageToLearn}
                  disabled={
                      updateVocabularyMutation.isPending || isCreatingStory || languagesLoading || isReGeneratingStory
                  }
                >
                  <SelectTrigger>
                      {languagesLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <SelectValue placeholder="Select language to learn" />
                      )}
                  </SelectTrigger>
                  <SelectContent>
                       {languagesError && <SelectItem value="error" disabled>{languagesError}</SelectItem>}
                       {!languagesLoading && !languagesError && languages.length === 0 && (
                        <SelectItem value="no-langs" disabled>No languages available</SelectItem>
                       )}
                       {languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                       ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language you know</Label>
                <Select
                  value={languageYouKnow}
                  onValueChange={setLanguageYouKnow}
                  disabled={
                      updateVocabularyMutation.isPending || isCreatingStory || languagesLoading || isReGeneratingStory
                  }
                >
                  <SelectTrigger>
                      {languagesLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <SelectValue placeholder="Select language you know" />
                      )}
                  </SelectTrigger>
                  <SelectContent>
                      {languagesError && <SelectItem value="error" disabled>{languagesError}</SelectItem>}
                      {!languagesLoading && !languagesError && languages.length === 0 && (
                        <SelectItem value="no-langs" disabled>No languages available</SelectItem>
                      )}
                      {languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Word Pairs</Label>
                <div className="flex space-x-2">
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      value={aiWordCount}
                      onChange={(e) => setAiWordCount(Number(e.target.value))}
                      min="5"
                      max="20"
                      className="w-16"
                      disabled={
                        updateVocabularyMutation.isPending ||
                        generateVocabularyMutation.isPending ||
                        isCreatingStory || isReGeneratingStory
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateWithAI}
                      disabled={
                        updateVocabularyMutation.isPending ||
                        generateVocabularyMutation.isPending ||
                        isCreatingStory || isReGeneratingStory
                      }
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {generateVocabularyMutation.isPending
                        ? "Generating..."
                        : "Generate with AI"}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addWordPair}
                    disabled={
                      updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Word
                  </Button>
                </div>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {wordPairs.map((pair, index) => (
                <div key={index} className="flex space-x-2 items-center">
                    <Input
                      placeholder="Word"
                      value={pair.word}
                      onChange={(e) =>
                        updateWordPair(index, "word", e.target.value)
                      }
                      className="flex-1"
                      disabled={
                        updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleTranslateWord(index)}
                      disabled={
                        updateVocabularyMutation.isPending ||
                        isCreatingStory ||
                        isReGeneratingStory ||
                        translatingWords.has(index) ||
                        !pair.word.trim()
                      }
                    >
                      {translatingWords.has(index) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Languages className="h-4 w-4" />
                      )}
                    </Button>
                    <Input
                      placeholder="Translation"
                      value={pair.translation}
                      onChange={(e) =>
                        updateWordPair(index, "translation", e.target.value)
                      }
                      className="flex-1"
                      disabled={
                        updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                      }
                    />
                    {wordPairs.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeWordPair(index)}
                        disabled={
                          updateVocabularyMutation.isPending || isCreatingStory || isReGeneratingStory
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                updateVocabularyMutation.isPending ||
                isCreatingStory || isReGeneratingStory ||
                wordPairs.filter((p) => p.word && p.translation).length === 0
              }
            >
              {updateVocabularyMutation.isPending
                ? "Updating Vocabulary..."
                : "Update Vocabulary"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center pt-6 border-t space-y-4"> {/* Added space-y-4 for button spacing */}
          {!storyId && ( // Show Create Story button only if no storyId
            <Button
              onClick={handleCreateStory}
              className="w-full md:w-auto"
              disabled={
                isCreatingStory || isReGeneratingStory ||
                updateVocabularyMutation.isPending ||
                wordPairs.filter((p) => p.word && p.translation).length === 0
              }
            >
              <BookPlus className="h-4 w-4 mr-2" />
              {isCreatingStory
                ? "Creating Story..."
                : "Create Story for this Vocabulary"}
            </Button>
          )}
          {storyId && ( // Show Re-generate Story button if storyId exists
            <>
              <p className="text-sm text-gray-600">
                A story already exists for this vocabulary.
              </p>
              <Button
                onClick={handleReGenerateStory}
                variant="outline" // Different variant for distinction
                className="w-full md:w-auto"
                disabled={isReGeneratingStory || isCreatingStory || updateVocabularyMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {isReGeneratingStory
                  ? "Re-generating Story..."
                  : "Re-generate Story"}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default EditVocabulary;
