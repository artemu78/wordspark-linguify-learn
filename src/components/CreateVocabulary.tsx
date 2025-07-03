import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Plus, Trash2, Sparkles, BookPlus, Loader2 } from "lucide-react"; // Added BookPlus, Loader2
import { Switch } from "@/components/ui/switch"; // Added Switch
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguageStore } from "@/stores/languageStore"; // Import the language store
import { useEffect } from "react"; // Import useEffect
import { useToast } from "@/hooks/use-toast";
import { generateAndSaveStory, StoryGenerationError } from "@/lib/storyUtils"; // Added

interface CreateVocabularyProps {
  onBack: () => void;
  // Consider if onPlayStory is needed if navigating directly after story creation
  // onPlayStory?: (vocabularyId: string, vocabularyTitle: string, storyId: string) => void;
}

interface WordPair {
  word: string;
  translation: string;
}

const CreateVocabulary = ({ onBack }: CreateVocabularyProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [vocabularyImageUrl, setVocabularyImageUrl] = useState<string | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [languageYouKnow, setLanguageYouKnow] = useState<string | undefined>(undefined); // Renamed from sourceLanguage
  const [languageToLearn, setLanguageToLearn] = useState<string | undefined>(undefined); // Renamed from targetLanguage
  const [isPublic, setIsPublic] = useState(false); // Added isPublic state
  const [wordPairs, setWordPairs] = useState<WordPair[]>([
    { word: "", translation: "" },
  ]);

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

  // Effect to set default for languageYouKnow
  useEffect(() => {
    if (languages.length > 0 && languageYouKnow === undefined) {
      const defaultUserLang = languages.find(lang => lang.code === "en") || languages[0];
      if (defaultUserLang) {
        setLanguageYouKnow(defaultUserLang.code);
      }
    }
  }, [languages]); // Only depends on languages

  // Effect to set default for languageToLearn
  useEffect(() => {
    if (languages.length > 0 && languageYouKnow && languageToLearn === undefined) {
      const preferredLearnLang = languages.find(lang => lang.code === "es");
      if (preferredLearnLang && preferredLearnLang.code !== languageYouKnow) {
        setLanguageToLearn(preferredLearnLang.code);
      } else {
        // Find first available language that is not languageYouKnow
        const fallbackLearnLang = languages.find(lang => lang.code !== languageYouKnow);
        if (fallbackLearnLang) {
          setLanguageToLearn(fallbackLearnLang.code);
        }
        // If no suitable fallback is found, languageToLearn remains undefined.
        // Validation prior to submission will handle this.
      }
    }
  }, [languages, languageYouKnow, languageToLearn]); // Depends on languages, languageYouKnow, and languageToLearn (to check if it's undefined)

  const [aiWordCount, setAiWordCount] = useState(10);
  const [createdVocabularyId, setCreatedVocabularyId] = useState<string | null>(
    null
  );
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [storyCreated, setStoryCreated] = useState(false);

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

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setWordPairs(data?.vocabularyWords);
      setVocabularyImageUrl(data?.coverImageUrl || null); // Set image URL if available
      toast({
        title: "Success!",
        description: `Generated ${data?.vocabularyWords?.length} vocabulary words.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createVocabularyMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");

      // Create vocabulary
      const { data: vocabulary, error: vocabError } = await supabase
        .from("vocabularies")
        .insert({
          title,
          topic,
          source_language: languageYouKnow, // DB column name is still source_language
          target_language: languageToLearn, // DB column name is still target_language
          created_by: user.id,
          cover_image_url: vocabularyImageUrl || null, // Use the image URL if available
          is_public: isPublic, // Added is_public field
        })
        .select()
        .single();

      if (vocabError) throw vocabError;

      // Create word pairs
      const wordsToInsert = wordPairs
        .filter((pair) => pair.word.trim() && pair.translation.trim())
        .map((pair) => ({
          vocabulary_id: vocabulary.id,
          word: pair.word.trim(),
          translation: pair.translation.trim(),
        }));

      if (wordsToInsert.length > 0) {
        const { error: wordsError } = await supabase
          .from("vocabulary_words")
          .insert(wordsToInsert);

        if (wordsError) throw wordsError;
      }

      return vocabulary;
    },
    onSuccess: (newVocabulary) => {
      // Don't navigate away immediately. Allow user to create a story.
      setCreatedVocabularyId(newVocabulary.id);
      setTitle(newVocabulary.title); // Keep title in state for story generation
      toast({
        title: "Vocabulary Saved!",
        description:
          "Your new vocabulary list has been saved. You can now create a story for it.",
      });
      queryClient.invalidateQueries({ queryKey: ["vocabulariesWithStories"] }); // Use the updated query key
      // onBack(); // Removed: User stays on page to optionally create story
    },
    onError: (error: any) => {
      setCreatedVocabularyId(null);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerateWithAI = () => {
    if (!topic.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic before generating with AI.",
        variant: "destructive",
      });
      return;
    }
    if (!languageYouKnow || !languageToLearn) {
      toast({
        title: "Error",
        description: "Please select both 'Language you know' and 'Language to learn'.",
        variant: "destructive",
      });
      return;
    }
    if (languageYouKnow === languageToLearn) {
      toast({
        title: "Error",
        description: "'Language you know' and 'Language to learn' must be different.",
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

    if (!languageYouKnow || !languageToLearn) {
      toast({
        title: "Error",
        description: "Please select both 'Language you know' and 'Language to learn'.",
        variant: "destructive",
      });
      return;
    }

    if (languageYouKnow === languageToLearn) {
      toast({
        title: "Error",
        description: "'Language you know' and 'Language to learn' must be different.",
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

    createVocabularyMutation.mutate();
  };

  const handleCreateStory = async () => {
    if (!createdVocabularyId || !user) {
      toast({
        title: "Error",
        description: "Vocabulary not saved or user not authenticated.",
        variant: "destructive",
      });
      return;
    }
    if (!title) {
      // Ensure title is available for story generation
      toast({
        title: "Error",
        description: "Vocabulary title is missing.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingStory(true);
    try {
      const storyId = await generateAndSaveStory(createdVocabularyId);
      if (storyId) {
        toast({
          title: "Story Created!",
          description: "Your story has been successfully generated.",
        });
        setStoryCreated(true); // Mark story as created
        queryClient.invalidateQueries({
          queryKey: ["vocabulariesWithStories"],
        }); // To update list view if user navigates back
        // Optionally, navigate to play story or disable button further:
        // if (onPlayStory) onPlayStory(createdVocabularyId, title, storyId);
        // else onBack();
      } else {
        // Error toast would have been shown by generateAndSaveStory or its caller based on thrown error
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={createVocabularyMutation.isPending || isCreatingStory}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-2xl font-bold text-gray-900">
          {createdVocabularyId
            ? `Vocabulary: ${title}`
            : "Create New Vocabulary"}
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {createdVocabularyId ? "Vocabulary Saved" : "Vocabulary Details"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!createdVocabularyId ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Form fields for title, topic, languages, word pairs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Basic French"
                    required
                    disabled={createVocabularyMutation.isPending}
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
                    disabled={createVocabularyMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is-public"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    disabled={createVocabularyMutation.isPending}
                  />
                  <Label htmlFor="is-public">Make vocabulary public</Label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Language you know</Label>
                  <Select
                    value={languageYouKnow}
                    onValueChange={setLanguageYouKnow}
                    disabled={createVocabularyMutation.isPending || languagesLoading}
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
                <div className="space-y-2">
                  <Label>Language to learn</Label>
                  <Select
                    value={languageToLearn}
                    onValueChange={setLanguageToLearn}
                    disabled={createVocabularyMutation.isPending || languagesLoading}
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
                          createVocabularyMutation.isPending ||
                          generateVocabularyMutation.isPending
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateWithAI}
                        disabled={
                          createVocabularyMutation.isPending ||
                          generateVocabularyMutation.isPending
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
                      disabled={createVocabularyMutation.isPending}
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
                        disabled={createVocabularyMutation.isPending}
                      />
                      <Input
                        placeholder="Translation"
                        value={pair.translation}
                        onChange={(e) =>
                          updateWordPair(index, "translation", e.target.value)
                        }
                        className="flex-1"
                        disabled={createVocabularyMutation.isPending}
                      />
                      {wordPairs.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeWordPair(index)}
                          disabled={createVocabularyMutation.isPending}
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
                  createVocabularyMutation.isPending ||
                  wordPairs.filter((p) => p.word && p.translation).length === 0
                }
              >
                {createVocabularyMutation.isPending
                  ? "Saving Vocabulary..."
                  : "Save Vocabulary"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-green-600 font-semibold">
                Vocabulary "{title}" saved successfully!
              </p>
              {storyCreated ? (
                <p className="text-blue-600">
                  Story created for this vocabulary.
                </p>
              ) : (
                <Button
                  onClick={handleCreateStory}
                  className="w-full md:w-auto"
                  disabled={isCreatingStory}
                >
                  <BookPlus className="h-4 w-4 mr-2" />
                  {isCreatingStory
                    ? "Creating Story..."
                    : "Create Story for this Vocabulary"}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={onBack}
                className="w-full md:w-auto mt-2"
              >
                Done / Back to List
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateVocabulary;
