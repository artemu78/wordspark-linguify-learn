
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
        {vocabularies.map((vocabulary) => (
          <Card key={vocabulary.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{vocabulary.title}</CardTitle>
                {vocabulary.is_default && (
                  <Badge variant="secondary">Default</Badge>
                )}
              </div>
              <CardDescription className="capitalize">
                Topic: {vocabulary.topic.replace('-', ' ')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>From: {vocabulary.source_language.toUpperCase()}</span>
                  <span>To: {vocabulary.target_language.toUpperCase()}</span>
                </div>
                <div className="text-sm text-gray-600">
                  {vocabulary.word_count} words
                </div>
                <Button 
                  onClick={() => onSelectVocabulary(vocabulary)}
                  className="w-full flex items-center space-x-2"
                >
                  <Play className="h-4 w-4" />
                  <span>Start Learning</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default VocabularyList;
