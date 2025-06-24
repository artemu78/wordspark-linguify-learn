
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import VocabularyList from '@/components/VocabularyList';
import LearningInterface from '@/components/LearningInterface';
import CreateVocabulary from '@/components/CreateVocabulary';
import EditVocabulary from '@/components/EditVocabulary';

type View = 'list' | 'learn' | 'create' | 'edit';

interface SelectedVocabulary {
  id: string;
  title: string;
}

const Dashboard = () => {
  const { loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedVocabulary, setSelectedVocabulary] = useState<SelectedVocabulary | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const handleSelectVocabulary = (vocabulary: any) => {
    setSelectedVocabulary({ id: vocabulary.id, title: vocabulary.title });
    setCurrentView('learn');
  };

  const handleCreateNew = () => {
    setCurrentView('create');
  };

  const handleEditVocabulary = (vocabulary: any) => {
    setSelectedVocabulary({ id: vocabulary.id, title: vocabulary.title });
    setCurrentView('edit');
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedVocabulary(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'list' && (
          <VocabularyList 
            onSelectVocabulary={handleSelectVocabulary}
            onCreateNew={handleCreateNew}
            onEditVocabulary={handleEditVocabulary}
          />
        )}
        
        {currentView === 'learn' && selectedVocabulary && (
          <LearningInterface
            vocabularyId={selectedVocabulary.id}
            vocabularyTitle={selectedVocabulary.title}
            onBack={handleBackToList}
          />
        )}
        
        {currentView === 'create' && (
          <CreateVocabulary onBack={handleBackToList} />
        )}

        {currentView === 'edit' && selectedVocabulary && (
          <EditVocabulary 
            vocabularyId={selectedVocabulary.id}
            onBack={handleBackToList}
          />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
