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
  BookOpen, // Added for Play Story button
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types"; // Added for type safety
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
  story_id?: string | null; // Added to hold potential story ID
  cover_image_url?: string; // Optional field for cover image URL
}

interface VocabularyListProps {
  onSelectVocabulary: (vocabulary: Vocabulary) => void; // Vocabulary type here will be the enhanced one
  onCreateNew: () => void;
  onEditVocabulary?: (vocabulary: Vocabulary) => void;
  onPlayStory: (
    vocabularyId: string,
    vocabularyTitle: string,
    storyId?: string,
    vocabularyCoverImageUrl?: string // Optional: can be used if needed
  ) => void; // Added prop
}

const VocabularyList = ({
  onSelectVocabulary,
  onCreateNew,
  onEditVocabulary,
  onPlayStory, // Added prop
}: VocabularyListProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const [selectedVocabulary, setSelectedVocabulary] =
    React.useState<Vocabulary | null>(null);
  // const [isGeneratingStory, setIsGeneratingStory] = React.useState<string | null>(null); // No longer needed here

  const { data: vocabularies = [], isLoading } = useQuery<Vocabulary[]>({
    queryKey: ["vocabulariesWithStories", user?.id], // Include user ID in queryKey
    queryFn: async () => {
      if (!user) return []; // Or handle appropriately if user is required

      // Fetch vocabularies and their first story_id if available
      // Also filter by is_public or created_by
      const { data, error } = await supabase
        .from("vocabularies")
        .select(
          `
          *,
          vocabulary_words(count),
          stories(id)
        `
        )
        .or(`is_public.eq.true,created_by.eq.${user.id}`); // Added filter condition

      if (error) {
        console.error("Error fetching vocabularies with stories:", error);
        throw error;
      }

      return data.map((vocab) => ({
        ...vocab,
        word_count: vocab.vocabulary_words?.[0]?.count || 0,
        story_id: vocab.stories?.[0]?.id || null, // Extract story_id
      }));
    },
    enabled: !!user, // Ensure user is loaded before fetching
  });
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
    mutationFn: async (vocabularyToDelete: Vocabulary) => {
      const { id: vocabularyId, cover_image_url, story_id } = vocabularyToDelete;

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

      // Delete story bits and story if a story exists
      if (story_id) {
        const { error: storyBitsError } = await supabase
          .from("story_bits")
          .delete()
          .eq("story_id", story_id);

        if (storyBitsError) {
          console.error("Error deleting story bits:", storyBitsError);
          throw storyBitsError;
        }

        const { error: storyError } = await supabase
          .from("stories")
          .delete()
          .eq("id", story_id);

        if (storyError) {
          console.error("Error deleting story:", storyError);
          throw storyError;
        }
      }

      // Delete cover image if it exists
      if (cover_image_url) {
        try {
          const url = new URL(cover_image_url);
          const pathSegments = url.pathname.split('/');
          // Example Supabase URL: https://<project-ref>.supabase.co/storage/v1/object/public/<bucket-name>/<path/to/file.jpg>
          // pathSegments will be like: ['', 'storage', 'v1', 'object', 'public', <bucket-name>, <path/to/file.jpg>...]
          const bucketNameIndex = pathSegments.indexOf('public') + 1;
          if (bucketNameIndex > 0 && bucketNameIndex < pathSegments.length) {
            const bucketName = pathSegments[bucketNameIndex];
            const filePath = pathSegments.slice(bucketNameIndex + 1).join('/');
            if (bucketName && filePath) {
              const { error: imageError } = await supabase.storage
                .from(bucketName)
                .remove([filePath]);
              if (imageError) {
                console.error(`Error deleting image from bucket ${bucketName}, path ${filePath}:`, imageError);
                // Not throwing error here, as vocab deletion should proceed even if image deletion fails
              }
            } else {
              console.error("Could not determine bucket name or file path from URL:", cover_image_url);
            }
          } else {
            console.error("Could not parse bucket name from URL:", cover_image_url);
          }
        } catch (e) {
          console.error("Error parsing image URL or deleting image:", e);
        }
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
      queryClient.invalidateQueries({ queryKey: ["vocabulariesWithStories", user?.id] });
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
    if (onEditVocabulary) {
      onEditVocabulary(vocabulary);
    }
  };

  const handleDelete = (vocabulary: Vocabulary) => {
    setSelectedVocabulary(vocabulary);
    setDeleteDialogOpen(true);
  };

  const handleResetProgress = (vocabulary: Vocabulary) => {
    setSelectedVocabulary(vocabulary);
    setResetDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedVocabulary) {
      deleteVocabularyMutation.mutate(selectedVocabulary);
    }
  };

  const confirmResetProgress = () => {
    if (selectedVocabulary) {
      try {
        resetProgressMutation.mutate(selectedVocabulary.id);
      } catch (e) {
        console.error("error progress mutation", e);
      }
    }
  };

  // Removed generateDummyStory function from here. It's now in src/lib/storyUtils.ts

  const handlePlayStoryClick = (vocabulary: Vocabulary) => {
    if (vocabulary.story_id) {
      // Call the onPlayStory prop with the necessary
      onPlayStory(
        vocabulary.id,
        vocabulary.title,
        vocabulary.story_id,
        vocabulary.cover_image_url
      );
    } else {
      // This case should ideally not happen if button is only shown when story_id exists.
      // However, as a fallback or if there's a UI delay:
      toast({
        title: "Story Not Available",
        description:
          "This vocabulary does not have a story yet. Please create one first.",
        variant: "default", // Or "destructive" if it's considered an error state
      });
      console.warn(
        "Play Story clicked for vocabulary without a story_id:",
        vocabulary.title
      );
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
            const backgroundImage = vocabulary.cover_image_url;
            const progress = getVocabularyProgress(
              vocabulary.id,
              vocabulary.word_count || 0
            );
            const isCompleted = isVocabularyCompleted(vocabulary.id);
            // const currentlyGenerating = isGeneratingStory === vocabulary.id; // Removed

            return (
              <Card
                key={vocabulary.id}
                className={`transition-shadow ${
                  isCompleted ? "ring-2 ring-green-200 bg-green-50" : ""
                }`}
                style={{
                  backgroundImage: `url(${backgroundImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.85)", // Add pale overlay
                  backgroundBlendMode: "overlay", // Ensure the pale effect applies only to the background
                }}
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
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => onSelectVocabulary(vocabulary)}
                        className="w-full flex items-center space-x-2"
                        variant={isCompleted ? "outline" : "default"}
                      >
                        <Play className="h-4 w-4" />
                        <span>{isCompleted ? "Review" : "Start Learning"}</span>
                      </Button>
                      {vocabulary.story_id && ( // Conditionally render Play Story button
                        <Button
                          onClick={() => handlePlayStoryClick(vocabulary)}
                          className="w-full flex items-center space-x-2"
                          variant="secondary"
                          // Word count check might still be relevant if story exists but vocab somehow became empty
                          // though this scenario is less likely with current story generation logic.
                          disabled={(vocabulary.word_count || 0) === 0}
                        >
                          <BookOpen className="h-4 w-4" />
                          <span>Play Story</span>
                        </Button>
                      )}
                    </div>
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
