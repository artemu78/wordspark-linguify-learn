import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, BookOpen } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tables } from "@/integrations/supabase/types";

type StoryBit = Tables<"story_bits">;
type VocabularyWord = Tables<"vocabulary_words">; // For translations
type Story = Tables<"stories">; // For getting vocabulary_id

interface PlayStoryInterfaceProps {
  storyId: string;
  vocabularyTitle: string;
  onBack: () => void;
}

const PlayStoryInterface: React.FC<PlayStoryInterfaceProps> = ({
  storyId,
  vocabularyTitle, // This might become redundant if fetched with story details, but keep for now
  onBack,
}) => {
  const [currentBitIndex, setCurrentBitIndex] = useState(0);

  // 1. Fetch the story to get vocabulary_id
  const { data: storyData, isLoading: isLoadingStory } = useQuery<{id: string, vocabulary_id: string} | null, Error>({
    queryKey: ["story", storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("id, vocabulary_id")
        .eq("id", storyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!storyId,
  });
  const vocabularyId = storyData?.vocabulary_id;

  // 2. Fetch all words and translations for the vocabulary
  const { data: vocabularyWords, isLoading: isLoadingVocabWords } = useQuery<{id: string, word: string, translation: string}[], Error>({
    queryKey: ["vocabularyWords", vocabularyId],
    queryFn: async () => {
      if (!vocabularyId) return []; // Should not happen if story loads and has vocab_id
      const { data, error } = await supabase
        .from("vocabulary_words")
        .select("id, word, translation")
        .eq("vocabulary_id", vocabularyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!vocabularyId, // Only run if vocabularyId is fetched
  });

  // Helper function to render the description with the target word bolded
  const renderDescriptionWithBoldWord = (description: string, wordToBold: string) => {
    if (!description || !wordToBold) {
      return description;
    }
    // Regex to find the whole word, case-insensitive.
    // \b matches word boundaries to avoid matching parts of other words.
    const parts = description.split(new RegExp(`(\\b${wordToBold}\\b)`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === wordToBold.toLowerCase() ? (
        <strong key={index} className="text-indigo-700">{part}</strong>
      ) : (
        part
      )
    );
  };

  const {
    data: storyBits,
    isLoading: isLoadingStoryBits,
    error: storyBitsError,
  } = useQuery<StoryBit[], Error>({
    queryKey: ["storyBits", storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_bits")
        .select("*")
        .eq("story_id", storyId)
        .order("sequence_number", { ascending: true });

      if (error) {
        console.error("Error fetching story bits:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!storyId,
  });

  const currentBit = storyBits?.[currentBitIndex];

  const handleNext = () => {
    if (storyBits && currentBitIndex < storyBits.length - 1) {
      setCurrentBitIndex(currentBitIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentBitIndex > 0) {
      setCurrentBitIndex(currentBitIndex - 1);
    }
  };

  const handleRestart = () => {
    setCurrentBitIndex(0);
  };

  // Combined loading state
  if (isLoadingStory || isLoadingVocabWords || isLoadingStoryBits) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-lg text-gray-700">Loading story data...</p>
      </div>
    );
  }

  // Error handling for story bits fetch, can be combined with other errors if needed
  if (storyBitsError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
        <h2 className="text-xl font-semibold text-red-600 mb-2">Error Loading Story</h2>
        <p className="text-gray-700 mb-4">
          There was a problem fetching the story. Please try again later.
        </p>
        <p className="text-sm text-gray-500 mb-6">Error: {storyBitsError.message}</p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!storyBits || storyBits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
         <BookOpen className="h-16 w-16 text-gray-400 mb-6" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Story Not Found</h2>
        <p className="text-gray-600 mb-6">
          No bits found for this story, or the story is empty.
        </p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Button onClick={onBack} variant="outline" className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <Card className="shadow-xl">
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-2xl font-bold text-center text-gray-800">
            Story: {vocabularyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center">
          {currentBit && (
            <div className="space-y-6">
              <div className="flex justify-center items-center h-64 bg-gray-100 rounded-lg overflow-hidden">
                {currentBit.image_url ? (
                  <img
                    src={currentBit.image_url}
                    alt={`Story bit for ${currentBit.word}`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-gray-500">No image available</div>
                )}
              </div>
              <div>
                <p className="text-3xl font-semibold text-indigo-600 mb-3"> {/* Adjusted mb here for overall spacing */}
                  {currentBit.word}
                  {vocabularyWords && vocabularyWords.length > 0 && (
                    <span className="text-xl text-gray-500 ml-2">
                      ({vocabularyWords.find(vw => vw.word === currentBit.word)?.translation || "Translation not found"})
                    </span>
                  )}
                </p>
                <p className="text-lg text-gray-700 leading-relaxed mb-2"> {/* mb-2 to add space before the next language bit */}
                  {renderDescriptionWithBoldWord(currentBit.sentence, currentBit.word)}
                </p>
                {currentBit.sentence_language_you_know && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500 mb-1">In language you know:</p> {/* Simple label */}
                    <p className="text-md text-gray-600 leading-relaxed">
                      {/* We might not need to bold the word here, or use its translation if available */}
                      {renderDescriptionWithBoldWord(currentBit.sentence_language_you_know, currentBit.word)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-4 p-6 bg-gray-50">
          <div className="flex w-full items-center justify-between space-x-3">
            <Button
              onClick={handlePrevious}
              disabled={currentBitIndex === 0}
              variant="outline"
              className="flex-1" // Allow button to grow
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm text-gray-600 px-2 whitespace-nowrap"> {/* Page counter */}
              {currentBitIndex + 1} of {storyBits.length}
            </div>
            <Button
              onClick={handleNext}
              disabled={currentBitIndex === storyBits.length - 1}
              variant="outline"
              className="flex-1" // Allow button to grow
            >
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <Button onClick={handleRestart} variant="ghost" className="text-indigo-600 hover:text-indigo-700 mt-4">
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart Story
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default PlayStoryInterface;
