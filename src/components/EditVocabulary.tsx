import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'; // Added CardFooter
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Sparkles, BookPlus } from 'lucide-react'; // Added BookPlus
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { generateAndSaveStory, StoryGenerationError } from '@/lib/storyUtils'; // Added

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
  
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);
  const [aiWordCount, setAiWordCount] = useState(10);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [isCreatingStory, setIsCreatingStory] = useState(false);

  // Fetch vocabulary details including story
  const { data: vocabularyData, isLoading: isLoadingVocabulary } = useQuery({
    queryKey: ['vocabularyWithStory', vocabularyId], // Updated queryKey
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vocabularies')
        .select(`
          *,
          stories (id)
        `)
        .eq('id', vocabularyId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch vocabulary words
  const { data: words = [], isLoading: isLoadingWords } = useQuery({
    queryKey: ['vocabularyWords', vocabularyId], // Consistent key
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vocabulary_words')
        .select('*')
        .eq('vocabulary_id', vocabularyId);
      
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
      setSourceLanguage(vocabularyData.source_language);
      setTargetLanguage(vocabularyData.target_language);
      setStoryId(vocabularyData.stories?.[0]?.id || null);
    }
  }, [vocabularyData]);

  useEffect(() => {
    if (words.length > 0) {
      setWordPairs(words.map(word => ({
        id: word.id,
        word: word.word,
        translation: word.translation
      })));
    } else {
      setWordPairs([{ word: '', translation: '' }]);
    }
  }, [words]);

  const generateVocabularyMutation = useMutation({
    mutationFn: async () => {
      console.log('Generating vocabulary with AI for topic:', topic);
      const { data, error } = await supabase.functions.invoke('generate-vocabulary', {
        body: {
          topic,
          sourceLanguage,
          targetLanguage,
          wordCount: aiWordCount
        }
      });

      if (error) {
        console.error('AI generation error:', error);
        throw error;
      }
      console.log('AI generated vocabulary:', data);
      return data.vocabularyWords;
    },
    onSuccess: (vocabularyWords) => {
      console.log('Setting AI generated words:', vocabularyWords);
      setWordPairs(vocabularyWords.map((word: any) => ({ word: word.word, translation: word.translation })));
      toast({
        title: "Success!",
        description: `Generated ${vocabularyWords.length} vocabulary words.`
      });
    },
    onError: (error: any) => {
      console.error('AI generation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate vocabulary",
        variant: "destructive"
      });
    }
  });

  const updateVocabularyMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Updating vocabulary:', vocabularyId);
      console.log('Update data:', { title, topic, sourceLanguage, targetLanguage });
      console.log('Word pairs to save:', wordPairs);
      
      // Update vocabulary
      const { error: vocabError } = await supabase
        .from('vocabularies')
        .update({
          title,
          topic,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          updated_at: new Date().toISOString()
        })
        .eq('id', vocabularyId)
        .eq('created_by', user.id); // Ensure user owns this vocabulary
      
      if (vocabError) {
        console.error('Error updating vocabulary:', vocabError);
        throw vocabError;
      }
      
      // Delete existing words
      const { error: deleteError } = await supabase
        .from('vocabulary_words')
        .delete()
        .eq('vocabulary_id', vocabularyId);
      
      if (deleteError) {
        console.error('Error deleting existing words:', deleteError);
        throw deleteError;
      }
      
      // Insert new word pairs
      const wordsToInsert = wordPairs
        .filter(pair => pair.word.trim() && pair.translation.trim())
        .map(pair => ({
          vocabulary_id: vocabularyId,
          word: pair.word.trim(),
          translation: pair.translation.trim()
        }));
      
      console.log('Words to insert:', wordsToInsert);
      
      if (wordsToInsert.length > 0) {
        const { error: wordsError } = await supabase
          .from('vocabulary_words')
          .insert(wordsToInsert);
        
        if (wordsError) {
          console.error('Error inserting new words:', wordsError);
          throw wordsError;
        }
      }
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Vocabulary updated successfully."
      });
      // Invalidate queries that would show this vocabulary, including its story status
      queryClient.invalidateQueries({ queryKey: ['vocabulariesWithStories'] });
      queryClient.invalidateQueries({ queryKey: ['vocabularyWithStory', vocabularyId] });
      queryClient.invalidateQueries({ queryKey: ['vocabularyWords', vocabularyId] });
      // Potentially stay on page if we want to allow story creation immediately after edit.
      // For now, matching original behavior of going back.
      // If staying, ensure 'storyId' state is updated or re-fetched.
      onBack();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vocabulary",
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
    
    console.log('Form submitted');
    console.log('Form data:', { title, topic, sourceLanguage, targetLanguage });
    console.log('Word pairs:', wordPairs);
    
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
    
    updateVocabularyMutation.mutate();
  };

  const handleCreateStory = async () => {
    if (!vocabularyId || !user) {
      toast({ title: "Error", description: "Vocabulary ID missing or user not authenticated.", variant: "destructive" });
      return;
    }
    if (!title) { // Ensure title is available (it should be from vocabularyData)
        toast({ title: "Error", description: "Vocabulary title is missing.", variant: "destructive" });
        return;
    }

    setIsCreatingStory(true);
    try {
      const newStoryId = await generateAndSaveStory(vocabularyId, title); // title is from state, kept in sync with vocabularyData
      if (newStoryId) {
        toast({ title: "Story Created!", description: "Your story has been successfully generated." });
        setStoryId(newStoryId); // Update local state to reflect story creation
        queryClient.invalidateQueries({ queryKey: ['vocabulariesWithStories'] });
        queryClient.invalidateQueries({ queryKey: ['vocabularyWithStory', vocabularyId] });
      }
    } catch (error) {
      if (error instanceof StoryGenerationError) {
        toast({ title: `Story Creation Failed: ${error.code || ''}`, description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Story Creation Failed", description: "An unexpected error occurred.", variant: "destructive" });
      }
      console.error("Story generation failed:", error);
    } finally {
      setIsCreatingStory(false);
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
        <Button variant="outline" onClick={onBack} disabled={updateVocabularyMutation.isPending || isCreatingStory}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-2xl font-bold text-gray-900">Edit Vocabulary: {title}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vocabulary Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Form fields remain largely the same, ensure they are disabled during mutations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Basic French"
                  required
                  disabled={updateVocabularyMutation.isPending || isCreatingStory}
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
                  disabled={updateVocabularyMutation.isPending || isCreatingStory}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Language</Label>
                <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={updateVocabularyMutation.isPending || isCreatingStory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                    <SelectItem value="tr">Turkish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Language</Label>
                <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={updateVocabularyMutation.isPending || isCreatingStory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                    <SelectItem value="tr">Turkish</SelectItem>
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
                      disabled={updateVocabularyMutation.isPending || generateVocabularyMutation.isPending || isCreatingStory}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGenerateWithAI}
                      disabled={updateVocabularyMutation.isPending || generateVocabularyMutation.isPending || isCreatingStory}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {generateVocabularyMutation.isPending ? 'Generating...' : 'Generate with AI'}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addWordPair} disabled={updateVocabularyMutation.isPending || isCreatingStory}>
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
                      onChange={(e) => updateWordPair(index, 'word', e.target.value)}
                      className="flex-1"
                      disabled={updateVocabularyMutation.isPending || isCreatingStory}
                    />
                    <Input
                      placeholder="Translation"
                      value={pair.translation}
                      onChange={(e) => updateWordPair(index, 'translation', e.target.value)}
                      className="flex-1"
                      disabled={updateVocabularyMutation.isPending || isCreatingStory}
                    />
                    {wordPairs.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeWordPair(index)}
                        disabled={updateVocabularyMutation.isPending || isCreatingStory}
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
              disabled={updateVocabularyMutation.isPending || isCreatingStory || wordPairs.filter(p=>p.word && p.translation).length === 0}
            >
              {updateVocabularyMutation.isPending ? 'Updating Vocabulary...' : 'Update Vocabulary'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center pt-6 border-t">
          {storyId ? (
            <p className="text-blue-600 font-semibold">A story already exists for this vocabulary.</p>
          ) : (
            <Button
              onClick={handleCreateStory}
              className="w-full md:w-auto"
              disabled={isCreatingStory || updateVocabularyMutation.isPending || wordPairs.filter(p=>p.word && p.translation).length === 0}
            >
              <BookPlus className="h-4 w-4 mr-2" />
              {isCreatingStory ? 'Creating Story...' : 'Create Story for this Vocabulary'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default EditVocabulary;
