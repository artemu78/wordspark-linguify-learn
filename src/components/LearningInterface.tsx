
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, X, RotateCcw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
}

interface LearningInterfaceProps {
  vocabularyId: string;
  vocabularyTitle: string;
  onBack: () => void;
}

const LearningInterface = ({ vocabularyId, vocabularyTitle, onBack }: LearningInterfaceProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [completedWords, setCompletedWords] = useState<Set<string>>(new Set());

  const { data: words = [] } = useQuery({
    queryKey: ['vocabulary-words', vocabularyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vocabulary_words')
        .select('*')
        .eq('vocabulary_id', vocabularyId);
      
      if (error) throw error;
      return data;
    }
  });

  const { data: progress = [] } = useQuery({
    queryKey: ['user-progress', vocabularyId],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('vocabulary_id', vocabularyId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const updateProgressMutation = useMutation({
    mutationFn: async ({ wordId, isCorrect }: { wordId: string; isCorrect: boolean }) => {
      if (!user) throw new Error('User not authenticated');
      
      const existingProgress = progress.find(p => p.word_id === wordId);
      
      if (existingProgress) {
        const { error } = await supabase
          .from('user_progress')
          .update({
            is_correct: isCorrect,
            attempts: existingProgress.attempts + 1,
            last_attempted: new Date().toISOString()
          })
          .eq('id', existingProgress.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_progress')
          .insert({
            user_id: user.id,
            vocabulary_id: vocabularyId,
            word_id: wordId,
            is_correct: isCorrect,
            attempts: 1
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-progress', vocabularyId] });
    }
  });

  const checkCompletionMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('vocabulary_completion')
        .upsert({
          user_id: user.id,
          vocabulary_id: vocabularyId
        });
      
      if (error) throw error;
    }
  });

  const currentWord = words[currentIndex];
  const progressPercentage = words.length > 0 ? (completedWords.size / words.length) * 100 : 0;

  const handleSubmit = () => {
    if (!currentWord) return;
    
    const correct = userAnswer.toLowerCase().trim() === currentWord.translation.toLowerCase().trim();
    setIsCorrect(correct);
    setShowResult(true);
    
    updateProgressMutation.mutate({
      wordId: currentWord.id,
      isCorrect: correct
    });

    if (correct) {
      setCompletedWords(prev => new Set([...prev, currentWord.id]));
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
          description: "You've completed this vocabulary list!"
        });
      }
      setCurrentIndex(0);
    }
    
    setUserAnswer('');
    setShowResult(false);
  };

  const handleRetry = () => {
    setUserAnswer('');
    setShowResult(false);
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
            <h3 className="text-3xl font-bold text-indigo-600 mb-2">
              {currentWord?.word}
            </h3>
            <p className="text-gray-600">Translate this word</p>
          </div>

          {!showResult ? (
            <div className="space-y-4">
              <Input
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Enter your translation..."
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                className="text-center text-lg"
              />
              <Button 
                onClick={handleSubmit} 
                className="w-full"
                disabled={!userAnswer.trim()}
              >
                Check Answer
              </Button>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center justify-center space-x-2 mb-2">
                  {isCorrect ? (
                    <Check className="h-6 w-6 text-green-600" />
                  ) : (
                    <X className="h-6 w-6 text-red-600" />
                  )}
                  <span className={`font-semibold ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                    {isCorrect ? 'Correct!' : 'Incorrect'}
                  </span>
                </div>
                <p className="text-gray-700">
                  <span className="font-medium">Correct answer:</span> {currentWord?.translation}
                </p>
                {!isCorrect && (
                  <p className="text-gray-600 text-sm mt-1">
                    <span className="font-medium">Your answer:</span> {userAnswer}
                  </p>
                )}
              </div>
              
              <div className="flex space-x-3">
                {!isCorrect && (
                  <Button variant="outline" onClick={handleRetry} className="flex-1">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                )}
                <Button onClick={handleNext} className="flex-1">
                  {currentIndex < words.length - 1 ? 'Next Word' : 'Restart'}
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
