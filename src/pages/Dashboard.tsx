import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import VocabularyList from "@/components/VocabularyList";
import LearningInterface from "@/components/LearningInterface";
import CreateVocabulary from "@/components/CreateVocabulary";
import EditVocabulary from "@/components/EditVocabulary";
import PlayStoryInterface from "@/components/PlayStoryInterface";

interface Vocabulary {
  id: string;
  title: string;
  cover_image_url?: string;
}

type View = "list" | "learn" | "create" | "edit" | "playStory"; // Added 'playStory'

interface SelectedVocabularyInfo {
  // Renamed for clarity
  id: string; // This can be vocabularyId
  title: string; // This can be vocabularyTitle
  storyId?: string; // Optional: storyId if navigating to playStory
  vocabularyCoverImageUrl?: string; // Optional: cover image URL for learning interface
}

const Dashboard = () => {
  const { loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>("list");
  const [selectedInfo, setSelectedInfo] =
    useState<SelectedVocabularyInfo | null>(null); // Renamed state

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const handleSelectVocabulary = (vocabulary: {
    id: string;
    title: string;
    cover_image_url?: string; // Optional: cover image URL
  }) => {
    setSelectedInfo({
      id: vocabulary.id,
      title: vocabulary.title,
      vocabularyCoverImageUrl: vocabulary.cover_image_url || "",
    });
    setCurrentView("learn");
  };

  const handleCreateNew = () => {
    setCurrentView("create");
    setSelectedInfo(null); // Clear selection when going to create
  };

  const handleEditVocabulary = (vocabulary: Vocabulary) => {
    setSelectedInfo({
      id: vocabulary.id,
      title: vocabulary.title,
      vocabularyCoverImageUrl: vocabulary.cover_image_url || "",
    });
    setCurrentView("edit");
  };

  const handlePlayStory = (
    vocabularyId: string,
    vocabularyTitle: string,
    storyId?: string,
    vocabularyCoverImageUrl?: string // Optional: can be used if needed
  ) => {
    if (!storyId) {
      // This case should ideally be handled by VocabularyList generating a story first
      // or showing an error if generation fails.
      console.warn(
        "handlePlayStory called without a storyId. This might indicate an issue."
      );
      // Optionally, navigate back or show a message
      // setCurrentView('list');
      return;
    }
    setSelectedInfo({
      id: vocabularyId,
      title: vocabularyTitle,
      storyId: storyId,
      vocabularyCoverImageUrl,
    });
    setCurrentView("playStory");
  };

  const handleStartLearning = (vocabularyId: string, vocabularyTitle: string) => {
    handleSelectVocabulary({
      id: vocabularyId,
      title: vocabularyTitle,
    });
  };

  const handlePlayStoryFromCreate = (vocabularyId: string, vocabularyTitle: string, storyId: string) => {
    handlePlayStory(vocabularyId, vocabularyTitle, storyId);
  };

  const handleBackToList = () => {
    setCurrentView("list");
    setSelectedInfo(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === "list" && (
          <VocabularyList
            onSelectVocabulary={handleSelectVocabulary}
            onCreateNew={handleCreateNew}
            onEditVocabulary={handleEditVocabulary}
            onPlayStory={handlePlayStory} // Pass the new handler
          />
        )}

        {currentView === "learn" && selectedInfo && (
          <LearningInterface
            vocabularyId={selectedInfo.id}
            vocabularyTitle={selectedInfo.title}
            vocabularyCoverImageUrl={selectedInfo.vocabularyCoverImageUrl}
            onBack={handleBackToList}
            onGoToDashboard={handleBackToList}
          />
        )}

        {currentView === "create" && (
          <CreateVocabulary 
            onBack={handleBackToList}
            onStartLearning={handleStartLearning}
            onPlayStory={handlePlayStoryFromCreate}
          />
        )}

        {currentView === "edit" && selectedInfo && (
          <EditVocabulary
            vocabularyId={selectedInfo.id}
            onBack={handleBackToList}
          />
        )}

        {currentView === "playStory" &&
          selectedInfo &&
          selectedInfo.storyId && (
            <PlayStoryInterface
              storyId={selectedInfo.storyId}
              vocabularyTitle={selectedInfo.title}
              onBack={handleBackToList}
              onStartLearning={handleStartLearning}
            />
          )}
      </main>
    </div>
  );
};

export default Dashboard;
