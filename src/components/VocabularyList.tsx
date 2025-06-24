import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Plus,
  CheckCircle,
  MoreVertical,
  Edit,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  onEditVocabulary?: (vocabulary: Vocabulary) => void;
}

const VocabularyList = ({
  onSelectVocabulary,
  onCreateNew,
  onEditVocabulary,
}: VocabularyListProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const [selectedVocabulary, setSelectedVocabulary] =
    React.useState<Vocabulary | null>(null);

  const { data: vocabularies = [], isLoading } = useQuery({
    queryKey: ["vocabularies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vocabularies").select(`
          *,
          vocabulary_words(count)
        `);
      console.log("Fetched data:", data);
      if (error) throw error;

      return data.map((vocab) => ({
        ...vocab,
        word_count: vocab.vocabulary_words?.[0]?.count || 0,
      }));
    },
  });
  console.log("Fetched vocabularies:", vocabularies);

  const { data: userProgress = [] } = useQuery({
    queryKey: ["user-progress-all"],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("user_progress")
        .select("vocabulary_id, word_id, is_correct")
        .eq("user_id", user.id);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: completedVocabularies = [] } = useQuery({
    queryKey: ["vocabulary-completion"],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("vocabulary_completion")
        .select("vocabulary_id")
        .eq("user_id", user.id);

      if (error) throw error;
      return data.map((item) => item.vocabulary_id);
    },
    enabled: !!user,
  });

  const getVocabularyProgress = (vocabularyId: string, wordCount: number) => {
    const vocabularyProgress = userProgress.filter(
      (p) => p.vocabulary_id === vocabularyId
    );
    const correctAnswers = vocabularyProgress.filter(
      (p) => p.is_correct
    ).length;
    const progressPercentage =
      wordCount > 0 ? (correctAnswers / wordCount) * 100 : 0;

    return {
      correctAnswers,
      totalWords: wordCount,
      progressPercentage: Math.min(progressPercentage, 100),
    };
  };

  const isVocabularyCompleted = (vocabularyId: string) => {
    return completedVocabularies.includes(vocabularyId);
  };

  const deleteVocabularyMutation = useMutation({
    mutationFn: async (vocabularyId: string) => {
      console.log("Deleting vocabulary:", vocabularyId);

      // Delete user progress first
      const { error: progressError } = await supabase
        .from("user_progress")
        .delete()
        .eq("vocabulary_id", vocabularyId);

      if (progressError) {
        console.error("Error deleting progress:", progressError);
        throw progressError;
      }

      // Delete vocabulary completion records
      const { error: completionError } = await supabase
        .from("vocabulary_completion")
        .delete()
        .eq("vocabulary_id", vocabularyId);

      if (completionError) {
        console.error("Error deleting completion records:", completionError);
        throw completionError;
      }

      // Delete vocabulary words
      const { error: wordsError } = await supabase
        .from("vocabulary_words")
        .delete()
        .eq("vocabulary_id", vocabularyId);

      if (wordsError) {
        console.error("Error deleting vocabulary words:", wordsError);
        throw wordsError;
      }

      // Finally delete the vocabulary
      const { error: vocabError } = await supabase
        .from("vocabularies")
        .delete()
        .eq("id", vocabularyId);

      if (vocabError) {
        console.error("Error deleting vocabulary:", vocabError);
        throw vocabError;
      }
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Vocabulary deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["vocabularies"] });
      queryClient.invalidateQueries({ queryKey: ["user-progress-all"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-completion"] });
      setDeleteDialogOpen(false);
      setSelectedVocabulary(null);
    },
    onError: (error: any) => {
      console.error("Delete vocabulary error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete vocabulary",
        variant: "destructive",
      });
    },
  });

  const resetProgressMutation = useMutation({
    mutationFn: async (vocabularyId: string) => {
      if (!user) throw new Error("User not authenticated");

      console.log(
        "Resetting progress for vocabulary:",
        vocabularyId,
        "user:",
        user.id
      );

      // Delete user progress for this vocabulary
      const { error: progressError } = await supabase
        .from("user_progress")
        .delete()
        .eq("vocabulary_id", vocabularyId)
        .eq("user_id", user.id);

      if (progressError) {
        console.error("Error deleting user progress:", progressError);
        throw progressError;
      }

      // Delete vocabulary completion record
      const { error: completionError } = await supabase
        .from("vocabulary_completion")
        .delete()
        .eq("vocabulary_id", vocabularyId)
        .eq("user_id", user.id);

      if (completionError) {
        console.error("Error deleting completion record:", completionError);
        throw completionError;
      }
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Progress reset successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["user-progress-all"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-completion"] });
      setResetDialogOpen(false);
      setSelectedVocabulary(null);
    },
    onError: (error: any) => {
      console.error("Reset progress error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset progress",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (vocabulary: Vocabulary) => {
    console.log("Edit vocabulary:", vocabulary);
    if (onEditVocabulary) {
      onEditVocabulary(vocabulary);
    }
  };

  const handleDelete = (vocabulary: Vocabulary) => {
    console.log("Delete vocabulary requested:", vocabulary);
    setSelectedVocabulary(vocabulary);
    setDeleteDialogOpen(true);
  };

  const handleResetProgress = (vocabulary: Vocabulary) => {
    console.log("Reset progress requested:", vocabulary);
    setSelectedVocabulary(vocabulary);
    setResetDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedVocabulary) {
      console.log("Confirming delete for:", selectedVocabulary);
      deleteVocabularyMutation.mutate(selectedVocabulary.id);
    }
  };

  const confirmResetProgress = () => {
    if (selectedVocabulary) {
      console.log("Confirming reset progress for:", selectedVocabulary);
      try {
        resetProgressMutation.mutate(selectedVocabulary.id);
      } catch (e) {
        console.error("error progress mutation", e);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <>
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
            const progress = getVocabularyProgress(
              vocabulary.id,
              vocabulary.word_count || 0
            );
            const isCompleted = isVocabularyCompleted(vocabulary.id);

            return (
              <Card
                key={vocabulary.id}
                className={`hover:shadow-lg transition-shadow ${
                  isCompleted ? "ring-2 ring-green-200 bg-green-50" : ""
                }`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <span>{vocabulary.title}</span>
                      {isCompleted && (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-2">
                        {vocabulary.is_default && (
                          <Badge variant="secondary">Default</Badge>
                        )}
                        {isCompleted && (
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            Completed
                          </Badge>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white">
                          <DropdownMenuItem
                            onClick={() => handleEdit(vocabulary)}
                            className="cursor-pointer"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleResetProgress(vocabulary)}
                            className="cursor-pointer"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reset progress
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(vocabulary)}
                            className="text-red-600 focus:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardDescription className="capitalize">
                    Topic: {vocabulary.topic.replace("-", " ")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>
                        From: {vocabulary.source_language.toUpperCase()}
                      </span>
                      <span>
                        To: {vocabulary.target_language.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="text-gray-600">
                          {progress.correctAnswers} / {progress.totalWords}{" "}
                          words
                        </span>
                      </div>
                      <Progress
                        value={progress.progressPercentage}
                        className={`w-full ${
                          isCompleted ? "bg-green-200" : ""
                        }`}
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
                      <span>{isCompleted ? "Review" : "Start Learning"}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vocabulary</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedVocabulary?.title}"?
              This action cannot be undone and will remove all associated words
              and progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteVocabularyMutation.isPending}
            >
              {deleteVocabularyMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Progress Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Progress</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset your progress for "
              {selectedVocabulary?.title}"? This will remove all your learning
              progress and you'll start from the beginning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetProgress}
              disabled={resetProgressMutation.isPending}
            >
              {resetProgressMutation.isPending
                ? "Resetting..."
                : "Reset Progress"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default VocabularyList;
