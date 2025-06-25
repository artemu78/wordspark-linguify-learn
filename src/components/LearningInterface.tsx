import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, RotateCcw, Volume2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
  audio_url?: string | null; // Added audio_url
}

interface LearningInterfaceProps {
  vocabularyId: string;
  vocabularyTitle: string;
  onBack: () => void;
}

interface ChoiceOption {
  id: string;
  translation: string;
  isCorrect: boolean;
}

const LearningInterface = ({
  vocabularyId,
  vocabularyTitle,
  onBack,
}: LearningInterfaceProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [completedWords, setCompletedWords] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data: words = [], refetch: refetchWords } = useQuery({
    queryKey: ["vocabulary-words", vocabularyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vocabulary_words")
        .select("*")
        .eq("vocabulary_id", vocabularyId);

      if (error) throw error;
      return data;
    },
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["user-progress", vocabularyId],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", user.id)
        .eq("vocabulary_id", vocabularyId);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async ({
      wordId,
      isCorrect,
    }: {
      wordId: string;
      isCorrect: boolean;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const existingProgress = progress.find((p) => p.word_id === wordId);

      if (existingProgress) {
        const { error } = await supabase
          .from("user_progress")
          .update({
            is_correct: isCorrect,
            attempts: existingProgress.attempts + 1,
            last_attempted: new Date().toISOString(),
          })
          .eq("id", existingProgress.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_progress").insert({
          user_id: user.id,
          vocabulary_id: vocabularyId,
          word_id: wordId,
          is_correct: isCorrect,
          attempts: 1,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user-progress", vocabularyId],
      });
    },
  });

  const checkCompletionMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase.from("vocabulary_completion").upsert({
        user_id: user.id,
        vocabulary_id: vocabularyId,
      });

      if (error) throw error;
    },
  });

  const currentWord = words[currentIndex];
  const progressPercentage =
    words.length > 0 ? (completedWords.size / words.length) * 100 : 0;

  // Generate multiple choice options when current word changes
  useEffect(() => {
    if (currentWord && words.length >= 4) {
      generateChoices();
    }
  }, [currentWord, words]);

  const generateChoices = () => {
    if (!currentWord || words.length < 4) return;

    // Get 3 random incorrect translations
    const incorrectWords = words.filter((w) => w.id !== currentWord.id);
    const shuffledIncorrect = incorrectWords
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    // Create choice options
    const choiceOptions: ChoiceOption[] = [
      {
        id: currentWord.id,
        translation: currentWord.translation,
        isCorrect: true,
      },
      ...shuffledIncorrect.map((word) => ({
        id: word.id,
        translation: word.translation,
        isCorrect: false,
      })),
    ];

    // Randomize the position of all choices
    const shuffledChoices = choiceOptions.sort(() => Math.random() - 0.5);
    setChoices(shuffledChoices);
  };

  const handleChoiceSelect = (choiceId: string) => {
    if (showResult) return;

    const selectedOption = choices.find((c) => c.id === choiceId);
    if (!selectedOption) return;

    setSelectedChoice(choiceId);
    setIsCorrect(selectedOption.isCorrect);
    setShowResult(true);

    updateProgressMutation.mutate({
      wordId: currentWord.id,
      isCorrect: selectedOption.isCorrect,
    });

    if (selectedOption.isCorrect) {
      setCompletedWords((prev) => new Set([...prev, currentWord.id]));
    }
  };

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Check if vocabulary is completed
      if (completedWords.size === words.length) {
        checkCompletionMutation.mutate();
        toast({
          title: "Congratulations!",
          description: "You've completed this vocabulary list!",
        });
      }
      setCurrentIndex(0);
    }

    setSelectedChoice(null);
    setShowResult(false);
    setAudioUrl(null); // Reset audio URL on next word
  };

  const handleRetry = () => {
    setSelectedChoice(null);
    setShowResult(false);
    generateChoices();
  };

  const handleListen = async () => {
    if (!currentWord || isAudioLoading) return;

    setIsAudioLoading(true);
    setAudioUrl(null); // Clear previous audio

    try {
      let urlToPlay = currentWord.audio_url;

      if (!urlToPlay) {
        // Get source language from vocabulary details (assuming it's available or can be fetched)
        // For this example, I'll hardcode 'en-US'. You might need to fetch vocabulary details.
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
            body: { word: currentWord.word, languageCode: languageCode },
          }
        );

        if (error) throw error;
        if (!data || !data.audioUrl)
          throw new Error("Audio URL not found in response");

        urlToPlay = data.audioUrl;

        // Update the vocabulary_words table with the new audio_url
        const updateResponse = await supabase
          .from("vocabulary_words")
          .update({ audio_url: urlToPlay })
          .eq("id", currentWord.id);

        console.log("Update response:", updateResponse);
        if (updateResponse.error) {
          console.error(
            "Error updating word with audio_url:",
            updateResponse.error
          );
          // Potentially notify user, but proceed with playing audio if generated
        } else {
          // Refetch words to get the updated audio_url in the local cache
          refetchWords();
        }
      }

      setAudioUrl(urlToPlay);
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

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current
        .play()
        .catch((e) => console.error("Error playing audio:", e));
    }
  }, [audioUrl]);

  if (words.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No words found in this vocabulary.</p>
        <Button onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Vocabularies
        </Button>
      </div>
    );
  }

  if (words.length < 4) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">
          This vocabulary needs at least 4 words for the card game.
        </p>
        <Button onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Vocabularies
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Badge variant="outline">
          {currentIndex + 1} of {words.length}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-center">{vocabularyTitle}</CardTitle>
          <Progress value={progressPercentage} className="w-full" />
          <p className="text-sm text-center text-gray-600">
            {completedWords.size} of {words.length} words completed
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <h3 className="text-3xl font-bold text-indigo-600">
                {currentWord?.word}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleListen}
                disabled={isAudioLoading || !currentWord}
                aria-label="Listen to word"
              >
                <Volume2
                  className={`h-6 w-6 ${isAudioLoading ? "animate-pulse" : ""}`}
                />
              </Button>
            </div>
            <p className="text-gray-600">Choose the correct translation</p>
          </div>
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} className="hidden" />
          )}
          {!showResult ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {choices.map((choice) => (
                <Card
                  key={choice.id}
                  className="cursor-pointer hover:shadow-lg transition-all border-2 hover:border-indigo-300"
                  onClick={() => handleChoiceSelect(choice.id)}
                >
                  <CardContent className="p-6 text-center">
                    <p className="text-lg font-medium">{choice.translation}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {choices.map((choice) => {
                  const isSelected = selectedChoice === choice.id;
                  const isCorrectChoice = choice.isCorrect;

                  let cardStyle = "border-2 ";
                  if (isSelected && isCorrectChoice) {
                    cardStyle += "bg-green-50 border-green-500";
                  } else if (isSelected && !isCorrectChoice) {
                    cardStyle += "bg-red-50 border-red-500";
                  } else if (isCorrectChoice) {
                    cardStyle += "bg-green-50 border-green-500";
                  } else {
                    cardStyle += "border-gray-200";
                  }

                  return (
                    <Card key={choice.id} className={cardStyle}>
                      <CardContent className="p-6 text-center relative">
                        <p className="text-lg font-medium">
                          {choice.translation}
                        </p>
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            {isCorrectChoice ? (
                              <Check className="h-5 w-5 text-green-600" />
                            ) : (
                              <X className="h-5 w-5 text-red-600" />
                            )}
                          </div>
                        )}
                        {!isSelected && isCorrectChoice && (
                          <div className="absolute top-2 right-2">
                            <Check className="h-5 w-5 text-green-600" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div
                className={`p-4 rounded-lg text-center ${
                  isCorrect
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center justify-center space-x-2 mb-2">
                  {isCorrect ? (
                    <Check className="h-6 w-6 text-green-600" />
                  ) : (
                    <X className="h-6 w-6 text-red-600" />
                  )}
                  <span
                    className={`font-semibold ${
                      isCorrect ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {isCorrect ? "Correct!" : "Incorrect"}
                  </span>
                </div>
                <p className="text-gray-700">
                  <span className="font-medium">Correct answer:</span>{" "}
                  {currentWord?.translation}
                </p>
              </div>

              <div className="flex space-x-3">
                {!isCorrect && (
                  <Button
                    variant="outline"
                    onClick={handleRetry}
                    className="flex-1"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                )}
                <Button onClick={handleNext} className="flex-1">
                  {currentIndex < words.length - 1 ? "Next Word" : "Restart"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LearningInterface;
