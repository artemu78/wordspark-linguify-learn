
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Sparkles } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface CreateVocabularyProps {
  onBack: () => void;
}

interface WordPair {
  word: string;
  translation: string;
}

const CreateVocabulary = ({ onBack }: CreateVocabularyProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [wordPairs, setWordPairs] = useState<WordPair[]>([
    { word: '', translation: '' }
  ]);
  const [aiWordCount, setAiWordCount] = useState(10);

  const generateVocabularyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-vocabulary', {
        body: {
          topic,
          sourceLanguage,
          targetLanguage,
          wordCount: aiWordCount
        }
      });

      if (error) throw error;
      return data.vocabularyWords;
    },
    onSuccess: (vocabularyWords) => {
      setWordPairs(vocabularyWords);
      toast({
        title: "Success!",
        description: `Generated ${vocabularyWords.length} vocabulary words.`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const createVocabularyMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      // Create vocabulary
      const { data: vocabulary, error: vocabError } = await supabase
        .from('vocabularies')
        .insert({
          title,
          topic,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          created_by: user.id
        })
        .select()
        .single();
      
      if (vocabError) throw vocabError;
      
      // Create word pairs
      const wordsToInsert = wordPairs
        .filter(pair => pair.word.trim() && pair.translation.trim())
        .map(pair => ({
          vocabulary_id: vocabulary.id,
          word: pair.word.trim(),
          translation: pair.translation.trim()
        }));
      
      if (wordsToInsert.length > 0) {
        const { error: wordsError } = await supabase
          .from('vocabulary_words')
          .insert(wordsToInsert);
        
        if (wordsError) throw wordsError;
      }
      
      return vocabulary;
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Vocabulary list created successfully."
      });
      queryClient.invalidateQueries({ queryKey: ['vocabularies'] });
      onBack();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleGenerateWithAI = () => {
    if (!topic.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic before generating with AI.",
        variant: "destructive"
      });
      return;
    }
    generateVocabularyMutation.mutate();
  };

  const addWordPair = () => {
    setWordPairs([...wordPairs, { word: '', translation: '' }]);
  };

  const removeWordPair = (index: number) => {
    if (wordPairs.length > 1) {
      setWordPairs(wordPairs.filter((_, i) => i !== index));
    }
  };

  const updateWordPair = (index: number, field: 'word' | 'translation', value: string) => {
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
        variant: "destructive"
      });
      return;
    }
    
    const validPairs = wordPairs.filter(pair => pair.word.trim() && pair.translation.trim());
    if (validPairs.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one word pair.",
        variant: "destructive"
      });
      return;
    }
    
    createVocabularyMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-2xl font-bold text-gray-900">Create New Vocabulary</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vocabulary Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Basic French"
                  required
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
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Language</Label>
                <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Language</Label>
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
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
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGenerateWithAI}
                      disabled={generateVocabularyMutation.isPending}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {generateVocabularyMutation.isPending ? 'Generating...' : 'Generate with AI'}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addWordPair}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Word
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3">
                {wordPairs.map((pair, index) => (
                  <div key={index} className="flex space-x-2 items-center">
                    <Input
                      placeholder="Word"
                      value={pair.word}
                      onChange={(e) => updateWordPair(index, 'word', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Translation"
                      value={pair.translation}
                      onChange={(e) => updateWordPair(index, 'translation', e.target.value)}
                      className="flex-1"
                    />
                    {wordPairs.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeWordPair(index)}
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
              disabled={createVocabularyMutation.isPending}
            >
              {createVocabularyMutation.isPending ? 'Creating...' : 'Create Vocabulary'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateVocabulary;
