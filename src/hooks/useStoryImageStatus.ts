import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StoryBitStatus {
  id: string;
  sequenceNumber: number;
  hasImage: boolean;
  imageUrl: string | null;
  status: string;
  job: any;
}

interface StoryImageStatus {
  storyId: string;
  totalBits: number;
  completedBits: number;
  failedBits: number;
  generatingBits: number;
  progress: number;
  storyBits: StoryBitStatus[];
}

export const useStoryImageStatus = (storyId: string | null) => {
  const [status, setStatus] = useState<StoryImageStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!storyId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `https://mlitptrnqpsnqjciskxg.supabase.co/functions/v1/get-story-image-status?storyId=${storyId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      setStatus(data);
    } catch (err) {
      console.error('Error fetching story image status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll for updates if there are generating images
    let interval: NodeJS.Timeout | null = null;
    
    if (status && status.generatingBits > 0) {
      interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [storyId, status?.generatingBits]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus
  };
};