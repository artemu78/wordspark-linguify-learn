import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, RotateCcw, Volume2, RefreshCw, Home } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FireworkAnimation } from "./FireworkAnimation";

interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
  audio_url?: string | null; // Added audio_url
}

interface LearningInterfaceProps {
  vocabularyId: string;
  vocabularyTitle: string;
  vocabularyCoverImageUrl?: string; // Optional: cover image URL for learning interface
  onBack: () => void;
  onGoToDashboard?: () => void;
}

interface ChoiceOption {
  id: string;
  translation: string;
  isCorrect: boolean;
}

const LearningInterface = ({
  vocabularyId,
  vocabularyTitle,
  vocabularyCoverImageUrl,
  onBack,
  onGoToDashboard,
}: LearningInterfaceProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  // const [completedWords, setCompletedWords] = useState<Set<string>>(new Set()); // Will be derived from progress
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showFireworks, setShowFireworks] = useState(false);
  const [vocabularyCompleted, setVocabularyCompleted] = useState(false);

  // New state for typing challenge
  const [challengeType, setChallengeType] = useState<"choice" | "typing">(
    "choice"
  );
  const [typedAnswer, setTypedAnswer] = useState("");
  const [displayWord, setDisplayWord] = useState(""); // For partially hidden word
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
    queryKey: ["user-progress", vocabularyId, user?.id],
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
      challengeType,
      isCorrectAttempt,
    }: {
      wordId: string;
      challengeType: "choice" | "typing";
      isCorrectAttempt: boolean;
    }) => {
      if (!user) throw new Error("User not authenticated");

      const existingProgress = progress.find((p) => p.word_id === wordId);
      const newProgressData: any = {
        attempts: (existingProgress?.attempts || 0) + 1,
        last_attempted: new Date().toISOString(),
      };

      if (challengeType === "choice") {
        newProgressData.choice_correct = isCorrectAttempt;
      } else {
        newProgressData.typing_correct = isCorrectAttempt;
      }

      // Determine overall is_correct
      const currentChoiceCorrect =
        challengeType === "choice"
          ? isCorrectAttempt
          : existingProgress?.choice_correct;
      const currentTypingCorrect =
        challengeType === "typing"
          ? isCorrectAttempt
          : existingProgress?.typing_correct;

      newProgressData.is_correct = !!(
        currentChoiceCorrect && currentTypingCorrect
      );

      if (existingProgress) {
        const { error } = await supabase
          .from("user_progress")
          .update(newProgressData)
          .eq("id", existingProgress.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_progress").insert({
          user_id: user.id,
          vocabulary_id: vocabularyId,
          word_id: wordId,
          ...newProgressData,
          // Ensure initial values for the other challenge type if not set
          choice_correct:
            newProgressData.choice_correct !== undefined
              ? newProgressData.choice_correct
              : false,
          typing_correct:
            newProgressData.typing_correct !== undefined
              ? newProgressData.typing_correct
              : false,
          is_correct: newProgressData.is_correct, // Already calculated
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user-progress", vocabularyId, user?.id],
      });
      // Potentially refetch words if progress affects word list directly
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
    onSuccess: () => {
      setShowFireworks(true);
      setVocabularyCompleted(true);
    },
  });

  const currentWord = words[currentIndex];

  const fullyCompletedCount = progress.filter((p) => p.is_correct).length;
  const progressPercentage =
    words.length > 0 ? (fullyCompletedCount / words.length) * 100 : 0;

  // Logic to decide challenge type and prepare for it
  useEffect(() => {
    if (currentWord) {
      const wordProgress = progress.find((p) => p.word_id === currentWord.id);
      // Removed duplicate: const wordProgress = progress.find((p) => p.word_id === currentWord.id);
      const choiceDone = !!wordProgress?.choice_correct; // Ensure boolean
      const typingDone = !!wordProgress?.typing_correct; // Ensure boolean

      let newType: "choice" | "typing";
      // Store previous challenge type to detect if it changes
      const previousChallengeType = challengeTypeRef.current;

      if (!choiceDone) {
        newType = "choice";
        // Only generate choices if the type is actually changing to 'choice' or word changed
        if (
          challengeType !== "choice" ||
          currentWord.id !== previousDisplayWordForRef.current
        ) {
          if (words.length >= 4) generateChoices();
          setDisplayWord("");
        }
      } else if (!typingDone) {
        newType = "typing";
        // Only update display word if the type is actually changing to 'typing' or word changed
        if (
          challengeType !== "typing" ||
          currentWord.id !== previousDisplayWordForRef.current
        ) {
          setDisplayWord(generateDisplayWord(currentWord.translation));
          setChoices([]);
        }
      } else {
        // Word is fully done. handleNext will move. If we are here, it's likely after completion & restart.
        newType = "choice";
        if (
          challengeType !== "choice" ||
          currentWord.id !== previousDisplayWordForRef.current
        ) {
          if (words.length >= 4) generateChoices();
          setDisplayWord("");
        }
      }

      if (
        previousChallengeType !== newType ||
        currentWord.id !== previousDisplayWordForRef.current
      ) {
        setChallengeType(newType); // Set the new type
        setShowResult(false);
        setTypedAnswer("");
        setSelectedChoice(null);
      }

      // Update refs for the next run
      challengeTypeRef.current = newType; // newType is the type determined for current state
      previousDisplayWordForRef.current = currentWord.id;
    }
  }, [currentWord, words, progress]); // challengeType removed from deps, using ref instead

  // Refs to track previous values for useEffect logic
  const challengeTypeRef = useRef(challengeType);
  const previousDisplayWordForRef = useRef<string | undefined>();

  // Update ref when challengeType state changes from outside the effect (e.g. initial state)
  useEffect(() => {
    challengeTypeRef.current = challengeType;
  }, [challengeType]);

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

  // Function to generate partially hidden word
  const generateDisplayWord = (word: string) => {
    const length = word.length;
    const halfLength = Math.ceil(length / 2);
    const indicesToHide = new Set<number>();
    while (indicesToHide.size < halfLength) {
      indicesToHide.add(Math.floor(Math.random() * length));
    }
    return word
      .split("")
      .map((char, i) => (indicesToHide.has(i) ? "*" : char))
      .join("");
  };

  const handleChoiceSelect = (choiceId: string) => {
    if (showResult) return;

    const selectedOption = choices.find((c) => c.id === choiceId);
    if (!selectedOption) return;

    setSelectedChoice(choiceId);
    const correct = selectedOption.isCorrect;
    setIsCorrect(correct);
    setShowResult(true);

    updateProgressMutation.mutate({
      wordId: currentWord.id,
      challengeType: "choice",
      isCorrectAttempt: correct,
    });

    // Note: completedWords logic will need to change.
    // A word is completed if BOTH choice and typing are correct.
    // This will be handled by checking progress data.
  };

  const handleTypingSubmit = () => {
    if (showResult || !currentWord) return;

    const isAttemptCorrect =
      typedAnswer.trim().toLowerCase() ===
      currentWord.translation.toLowerCase();
    setIsCorrect(isAttemptCorrect);
    setShowResult(true);

    updateProgressMutation.mutate({
      wordId: currentWord.id,
      challengeType: "typing",
      isCorrectAttempt: isAttemptCorrect,
    });
  };

  const handleNext = () => {
    // Reset UI states for the next word/challenge presentation
    setShowResult(false);
    setSelectedChoice(null);
    setTypedAnswer("");
    setAudioUrl(null); // Reset audio URL on next word
    setIsCorrect(false); // Reset correctness state

    if (words.length === 0) {
      setCurrentIndex(0); // Should not happen if component guards against empty words
      return;
    }

    // Try to find the next word that is not fully completed (is_correct is false)
    // Start searching from the word *after* the current one.
    for (let i = 1; i <= words.length; i++) {
      // Iterate through all words once, starting from next
      const nextPotentialWordIndex = (currentIndex + i) % words.length;
      const word = words[nextPotentialWordIndex];
      const wordProgress = progress.find((p) => p.word_id === word.id);

      if (!wordProgress || !wordProgress.is_correct) {
        setCurrentIndex(nextPotentialWordIndex);
        return; // Found the next word to work on
      }
    }

    // If the loop completes, it means all words are is_correct: true
    // Or there's only one word and it's now complete.
    // Check for overall completion.
    const allFullyCompleted = words.every((word) => {
      const p = progress.find((pr) => pr.word_id === word.id);
      return p && p.is_correct;
    });

    if (allFullyCompleted && words.length > 0) {
      checkCompletionMutation.mutate();
      return; // Don't restart automatically, let user choose
    }
    setCurrentIndex(0); // Restart the vocabulary
  };

  const handleRetry = () => {
    setSelectedChoice(null);
    setShowResult(false);
    setTypedAnswer(""); // Clear typed answer on retry
    if (challengeType === "choice" && words.length >= 4) {
      generateChoices();
    } else if (challengeType === "typing" && currentWord) {
      // Optionally regenerate display word if it should change on retry, or keep it same
      // setDisplayWord(generateDisplayWord(currentWord.translation));
    }
  };

  const handleListen = async () => {
    if (!currentWord || isAudioLoading) return;

    setIsAudioLoading(true);
    setAudioUrl(null); // Clear previous audio
    let urlToPlay = currentWord.audio_url;
    try {
      if (!urlToPlay) {
        // Get languageYouKnow from vocabulary details
        const { data: vocabularyData, error: vocabError } = await supabase
          .from("vocabularies")
          .select("source_language") // Still 'source_language' in DB
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
      audioRef.current.src = audioUrl;
      await audioRef.current.load(); // Preload the audio file
      playWordAudio(urlToPlay, audioRef);
    }
  };

  const handleRepeat = async () => {
    if (!user) return;
    
    // Clear all progress for this vocabulary
    const { error } = await supabase
      .from("user_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("vocabulary_id", vocabularyId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to reset progress",
        variant: "destructive",
      });
      return;
    }

    // Remove completion record
    await supabase
      .from("vocabulary_completion")
      .delete()
      .eq("user_id", user.id)
      .eq("vocabulary_id", vocabularyId);

    // Reset component state
    setVocabularyCompleted(false);
    setShowFireworks(false);
    setCurrentIndex(0);
    setShowResult(false);
    setSelectedChoice(null);
    setTypedAnswer("");
    
    // Invalidate queries to refetch fresh data
    queryClient.invalidateQueries({
      queryKey: ["user-progress", vocabularyId, user?.id],
    });

    toast({
      title: "Progress Reset",
      description: "Starting vocabulary from the beginning!",
    });
  };

  const handleLearnMore = () => {
    if (onGoToDashboard) {
      onGoToDashboard();
    } else {
      onBack();
    }
  };

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

  if (vocabularyCompleted) {
    return (
      <>
        {showFireworks && (
          <FireworkAnimation onComplete={() => setShowFireworks(false)} />
        )}
        <div className="max-w-4xl mx-auto space-y-6 text-center py-12">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-green-600 animate-fade-in">
              🎉 Congratulations! 🎉
            </h1>
            <p className="text-xl text-gray-600">
              You've mastered the "{vocabularyTitle}" vocabulary!
            </p>
            <div className="flex justify-center space-x-4 mt-8">
              <Button
                onClick={handleRepeat}
                variant="outline"
                size="lg"
                className="px-8"
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                Repeat
              </Button>
              <Button
                onClick={handleLearnMore}
                size="lg"
                className="px-8"
              >
                <Home className="h-5 w-5 mr-2" />
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </>
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

      <Card
        style={{
          backgroundImage: `url(${vocabularyCoverImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "rgba(255, 255, 255, 0.85)", // Add pale overlay
          backgroundBlendMode: "overlay", // Ensure the pale effect applies only to the background
        }}
      >
        <CardHeader>
          <CardTitle className="text-center">{vocabularyTitle}</CardTitle>
          <Progress value={progressPercentage} className="w-full" />
          <p className="text-sm text-center text-gray-600">
            {fullyCompletedCount} of {words.length} words completed
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
                  className={`h-6 w-6 ${isAudioLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            <p className="text-gray-600">
              {challengeType === "choice"
                ? "Choose the correct translation"
                : "Type the translation (half hidden below)"}
            </p>
            {challengeType === "typing" && !showResult && (
              <p className="text-2xl font-semibold text-center text-blue-600 tracking-wider">
                {displayWord}
              </p>
            )}
          </div>
          <audio ref={audioRef} src={audioUrl} className="hidden" />

          {/* Challenge Area */}
          {!showResult ? (
            challengeType === "choice" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {choices.map((choice) => (
                  <Card
                    key={choice.id}
                    className="cursor-pointer hover:shadow-lg transition-all border-2 hover:border-indigo-300"
                    onClick={() => handleChoiceSelect(choice.id)}
                  >
                    <CardContent className="p-6 text-center">
                      <p className="text-lg font-medium">
                        {choice.translation}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              // Typing challenge UI
              <div className="space-y-4 flex flex-col items-center">
                <input
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  placeholder="Type the translation"
                  className="input input-bordered w-full max-w-md p-3 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  onKeyPress={(e) => e.key === "Enter" && handleTypingSubmit()}
                />
                <Button
                  onClick={handleTypingSubmit}
                  className="max-w-md w-full"
                >
                  Submit Answer
                </Button>
              </div>
            )
          ) : (
            // Result Display Area (common for both challenge types)
            <div className="space-y-4">
              {challengeType === "choice" && ( // Show choices only if it was a choice question
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {choices.map((choice) => {
                    const isSelected = selectedChoice === choice.id;
                    const isCorrectChoice = choice.isCorrect;
                    let cardStyle = "border-2 ";
                    if (isSelected && isCorrectChoice)
                      cardStyle += "bg-green-50 border-green-500";
                    else if (isSelected && !isCorrectChoice)
                      cardStyle += "bg-red-50 border-red-500";
                    else if (isCorrectChoice)
                      cardStyle += "bg-green-50 border-green-500";
                    else cardStyle += "border-gray-200";
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
              )}

              {/* Feedback Message */}
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
