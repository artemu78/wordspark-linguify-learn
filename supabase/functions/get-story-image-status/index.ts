import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const storyId = url.searchParams.get('storyId')
    
    if (!storyId) {
      throw new Error('Missing storyId parameter')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            authorization: req.headers.get('authorization') ?? ''
          }
        }
      }
    )

    // Get story bits with their image generation status
    const { data: storyBits, error } = await supabase
      .from('story_bits')
      .select(`
        id,
        sequence_number,
        image_url,
        image_generation_status,
        image_generation_jobs (
          status,
          fal_job_id,
          error_message,
          created_at,
          completed_at
        )
      `)
      .eq('story_id', storyId)
      .order('sequence_number')

    if (error) {
      throw error
    }

    // Calculate overall progress
    const totalBits = storyBits?.length || 0
    const completedBits = storyBits?.filter(bit => 
      bit.image_generation_status === 'completed' || bit.image_url
    ).length || 0
    const failedBits = storyBits?.filter(bit => 
      bit.image_generation_status === 'failed'
    ).length || 0
    const generatingBits = storyBits?.filter(bit => 
      bit.image_generation_status === 'generating'
    ).length || 0

    const progress = totalBits > 0 ? (completedBits / totalBits) * 100 : 0

    return new Response(JSON.stringify({
      storyId,
      totalBits,
      completedBits,
      failedBits,
      generatingBits,
      progress: Math.round(progress),
      storyBits: storyBits?.map(bit => ({
        id: bit.id,
        sequenceNumber: bit.sequence_number,
        hasImage: !!bit.image_url,
        imageUrl: bit.image_url,
        status: bit.image_generation_status,
        job: bit.image_generation_jobs?.[0] || null
      })) || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error getting story image status:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})