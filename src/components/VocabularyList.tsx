
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Play, Plus, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Vocabulary {
  id: string;
  title: string;
  topic: string;
  source_language: string;
  target_language: string;
  is_default: boolean;
  word_count?: number;
}

interface VocabularyListProps {
  onSelectVocabulary: (vocabulary: Vocabulary) => void;
  onCreateNew: () => void;
}

const VocabularyList = ({ onSelectVocabulary, onCreateNew }: VocabularyListProps) => {
  const { user } = useAuth();

  const { data: vocabularies = [], isLoading } = useQuery({
    queryKey: ['vocabularies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vocabularies')
        .select(`
          *,
          vocabulary_words(count)
        `);
      
      if (error) throw error;
      
      return data.map(vocab => ({
        ...vocab,
        word_count: vocab.vocabulary_words?.[0]?.count || 0
      }));
    }
  });

  const { data: userProgress = [] } = useQuery({
    queryKey: ['user-progress-all'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('user_progress')
        .select('vocabulary_id, word_id, is_correct')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const { data: completedVocabularies = [] } = useQuery({
    queryKey: ['vocabulary-completion'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('vocabulary_completion')
        .select('vocabulary_id')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data.map(item => item.vocabulary_id);
    },
    enabled: !!user
  });

  const getVocabularyProgress = (vocabularyId: string, wordCount: number) => {
    const vocabularyProgress = userProgress.filter(p => p.vocabulary_id === vocabularyId);
    const correctAnswers = vocabularyProgress.filter(p => p.is_correct).length;
    const progressPercentage = wordCount > 0 ? (correctAnswers / wordCount) * 100 : 0;
    
    return {
      correctAnswers,
      totalWords: wordCount,
      progressPercentage: Math.min(progressPercentage, 100)
    };
  };

  const isVocabularyCompleted = (vocabularyId: string) => {
    return completedVocabularies.includes(vocabularyId);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Vocabulary Lists</h2>
        <Button onClick={onCreateNew} className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Create New</span>
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vocabularies.map((vocabulary) => {
          const progress = getVocabularyProgress(vocabulary.id, vocabulary.word_count || 0);
          const isCompleted = isVocabularyCompleted(vocabulary.id);
          
          return (
            <Card key={vocabulary.id} className={`hover:shadow-lg transition-shadow ${isCompleted ? 'ring-2 ring-green-200 bg-green-50' : ''}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <span>{vocabulary.title}</span>
                    {isCompleted && <CheckCircle className="h-5 w-5 text-green-600" />}
                  </CardTitle>
                  <div className="flex space-x-2">
                    {vocabulary.is_default && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                    {isCompleted && (
                      <Badge className="bg-green-100 text-green-800 border-green-300">Completed</Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="capitalize">
                  Topic: {vocabulary.topic.replace('-', ' ')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>From: {vocabulary.source_language.toUpperCase()}</span>
                    <span>To: {vocabulary.target_language.toUpperCase()}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Progress</span>
                      <span className="text-gray-600">
                        {progress.correctAnswers} / {progress.totalWords} words
                      </span>
                    </div>
                    <Progress 
                      value={progress.progressPercentage} 
                      className={`w-full ${isCompleted ? 'bg-green-200' : ''}`}
                    />
                    <div className="text-xs text-center text-gray-500">
                      {Math.round(progress.progressPercentage)}% complete
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => onSelectVocabulary(vocabulary)}
                    className="w-full flex items-center space-x-2"
                    variant={isCompleted ? "outline" : "default"}
                  >
                    <Play className="h-4 w-4" />
                    <span>{isCompleted ? 'Review' : 'Start Learning'}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default VocabularyList;
