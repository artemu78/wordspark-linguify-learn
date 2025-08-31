import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  BookOpen,
  Volume2,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tables } from "@/integrations/supabase/types";
import { useStoryImageStatus } from "@/hooks/useStoryImageStatus";

type StoryBit = Tables<"story_bits">;
type VocabularyWord = Tables<"vocabulary_words">; // For translations
type Story = Tables<"stories">; // For getting vocabulary_id

interface PlayStoryInterfaceProps {
  storyId: string;
  vocabularyTitle: string;
  onBack: () => void;
  onStartLearning: (vocabularyId: string, vocabularyTitle: string) => void;
}

const PlayStoryInterface: React.FC<PlayStoryInterfaceProps> = ({
  storyId,
  vocabularyTitle, // This might become redundant if fetched with story details, but keep for now
  onBack,
  onStartLearning,
}) => {
  const queryClient = useQueryClient();
  const [currentBitIndex, setCurrentBitIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  // Track image generation status
  const { status: imageStatus } = useStoryImageStatus(storyId);

  // 1. Fetch the story to get vocabulary_id
  const { data: storyData, isLoading: isLoadingStory } = useQuery<
    { id: string; vocabulary_id: string } | null,
    Error
  >({
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
  const { data: vocabularyWords, isLoading: isLoadingVocabWords } = useQuery<
    {
      id: string;
      word: string;
      translation: string;
      audio_url?: string | null;
    }[],
    Error
  >({
    queryKey: ["vocabularyWords", vocabularyId],
    queryFn: async () => {
      if (!vocabularyId) return []; // Should not happen if story loads and has vocab_id
      const { data, error } = await supabase
        .from("vocabulary_words")
        .select("id, word, translation, audio_url")
        .eq("vocabulary_id", vocabularyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!vocabularyId, // Only run if vocabularyId is fetched
  });

  // 3. Fetch story bits for the current story
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

  // Helper function to render the description with the target word bolded
  const renderDescriptionWithBoldWord = (
    description: string,
    wordToBold: string
  ) => {
    if (!description || !wordToBold) {
      return description;
    }
    // Regex to find the whole word, case-insensitive.
    // \b matches word boundaries to avoid matching parts of other words.
    const parts = description.split(new RegExp(`(\\b${wordToBold}\\b)`, "gi"));
    return parts.map((part, index) =>
      part.toLowerCase() === wordToBold.toLowerCase() ? (
        <strong key={index} className="text-indigo-700">
          {part}
        </strong>
      ) : (
        part
      )
    );
  };

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

  const handleListen = async () => {
    if (!currentBit || isAudioLoading) return;

    setIsAudioLoading(true);
    setAudioUrl(null);

    // Check if the vocabulary word already has audio_url
    const vocabularyWord = vocabularyWords?.find(
      (vw) => vw.word === currentBit.word
    );
    let urlToPlay = vocabularyWord?.audio_url;

    try {
      if (!urlToPlay) {
        // Get languageYouKnow from vocabulary details
        const { data: vocabularyData, error: vocabError } = await supabase
          .from("vocabularies")
          .select("source_language")
          .eq("id", vocabularyId)
          .single();

        if (vocabError || !vocabularyData) {
          throw new Error(
            vocabError?.message ||
              "Could not fetch vocabulary details for language code."
          );
        }
        const languageCode = vocabularyData.source_language;

        const { data, error } = await supabase.functions.invoke(
          "generate-audio",
          {
            body: { word: currentBit.word, languageCode: languageCode },
          }
        );

        if (error) throw error;
        if (!data || !data.audioUrl)
          throw new Error("Audio URL not found in response");

        urlToPlay = data.audioUrl;

        // Update the vocabulary_words table with the new audio_url if we have the word ID
        if (vocabularyWord?.id) {
          const updateResponse = await supabase
            .from("vocabulary_words")
            .update({ audio_url: urlToPlay })
            .eq("id", vocabularyWord.id);

          if (updateResponse.error) {
            console.error(
              "Error updating word with audio_url:",
              updateResponse.error
            );
          }
          queryClient.invalidateQueries({
            queryKey: ["vocabularyWords", vocabularyId],
          }); // Invalidate the vocabularyWords query to refresh data
        }
      }

      setAudioUrl(urlToPlay);
      await playWordAudio(urlToPlay, audioRef);
    } catch (err: any) {
      console.error("Error generating or fetching audio:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to play audio.",
        variant: "destructive",
      });
    } finally {
      setIsAudioLoading(false);
    }
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
        <h2 className="text-xl font-semibold text-red-600 mb-2">
          Error Loading Story
        </h2>
        <p className="text-gray-700 mb-4">
          There was a problem fetching the story. Please try again later.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Error: {storyBitsError.message}
        </p>
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
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          Story Not Found
        </h2>
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
          {imageStatus && imageStatus.generatingBits > 0 && (
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">
                Generating images: {imageStatus.completedBits}/{imageStatus.totalBits} complete
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${imageStatus.progress}%` }}
                ></div>
              </div>
            </div>
          )}
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
                ) : currentBit.image_generation_status === 'generating' ? (
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <p className="text-sm">Generating image...</p>
                  </div>
                ) : currentBit.image_generation_status === 'failed' ? (
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <ImageIcon className="h-8 w-8 mb-2" />
                    <p className="text-sm">Image generation failed</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <ImageIcon className="h-8 w-8 mb-2" />
                    <p className="text-sm">No image available</p>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <p className="text-3xl font-semibold text-indigo-600">
                    {currentBit.word}
                    {vocabularyWords && vocabularyWords.length > 0 && (
                      <span className="text-xl text-gray-500 ml-2">
                        (
                        {vocabularyWords.find(
                          (vw) => vw.word === currentBit.word
                        )?.translation || "Translation not found"}
                        )
                      </span>
                    )}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleListen}
                    disabled={isAudioLoading || !currentBit}
                    aria-label="Listen to word"
                  >
                    <Volume2
                      className={`h-6 w-6 ${
                        isAudioLoading ? "animate-spin" : ""
                      }`}
                    />
                  </Button>
                </div>
                <p className="text-lg text-gray-700 leading-relaxed mb-2">
                  {" "}
                  {/* mb-2 to add space before the next language bit */}
                  {renderDescriptionWithBoldWord(
                    currentBit.sentence,
                    currentBit.word
                  )}
                </p>
                {currentBit.sentence_language_you_know && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500 mb-1">
                      In language you know:
                    </p>{" "}
                    {/* Simple label */}
                    <p className="text-md text-gray-600 leading-relaxed">
                      {/* We might not need to bold the word here, or use its translation if available */}
                      {renderDescriptionWithBoldWord(
                        currentBit.sentence_language_you_know,
                        currentBit.word
                      )}
                    </p>
                  </div>
                )}
              </div>
              <audio ref={audioRef} src={audioUrl} className="hidden" />
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
            <div className="text-sm text-gray-600 px-2 whitespace-nowrap">
              {" "}
              {/* Page counter */}
              {currentBitIndex + 1} of {storyBits.length}
            </div>
            {currentBitIndex === storyBits.length - 1 ? (
              <Button
                onClick={() => {
                  if (vocabularyId) {
                    onStartLearning(vocabularyId, vocabularyTitle);
                  }
                }}
                disabled={!vocabularyId}
                className="flex-1"
              >
                Learn
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={currentBitIndex === storyBits.length - 1}
                variant="outline"
                className="flex-1" // Allow button to grow
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            onClick={handleRestart}
            variant="ghost"
            className="text-indigo-600 hover:text-indigo-700 mt-4"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart Story
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

async function playWordAudio(
  audioUrl: string,
  audioRef: React.MutableRefObject<HTMLAudioElement>
) {
  if (audioUrl && audioRef.current) {
    // Ensure the audio is loaded before attempting to play
    audioRef.current.src = audioUrl;
    await audioRef.current.load(); // Preload the audio file
    audioRef.current.play().catch((e) => {
      console.error("Error playing audio:", e);
      // Retry playing after 1 second
      setTimeout(() => {
        audioRef.current
          ?.play()
          .catch((retryError) =>
            console.error("Retry failed to play audio:", retryError)
          );
      }, 1000);
    });
  }
}

export default PlayStoryInterface;
