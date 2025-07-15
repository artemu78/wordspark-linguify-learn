import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { corsHeaders, getEnvVariable } from "../_shared/common-lib.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { storyId } = await req.json()
    
    if (!storyId) {
      throw new Error('Missing storyId')
    }

    const supabase = createClient(
      getEnvVariable('SUPABASE_URL') ?? '',
      getEnvVariable('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const falApiKey = getEnvVariable('FAL_API_KEY')
    if (!falApiKey) {
      throw new Error('FAL_API_KEY not configured')
    }

    // Get story bits that need image generation
    const { data: storyBits, error: storyBitsError } = await supabase
      .from('story_bits')
      .select('id, image_prompt, sequence_number')
      .eq('story_id', storyId)
      .is('image_url', null)
      .order('sequence_number')

    if (storyBitsError) {
      throw storyBitsError
    }

    if (!storyBits || storyBits.length === 0) {
      return new Response(JSON.stringify({ message: 'No story bits need image generation' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const webhookUrl = `${getEnvVariable('SUPABASE_URL')}/functions/v1/fal-webhook-handler`
    const results: {
      storyBitId: string,
      status: 'error' | 'submitted',
      error?: string,
      requestId?: string
    }[] = []

    // Generate images for each story bit
    for (const storyBit of storyBits) {
      try {
        // Submit job to fal.ai
        const falResponse = await fetch('https://queue.fal.run/fal-ai/flux/dev?fal_webhook=https://mlitptrnqpsnqjciskxg.supabase.co/functions/v1/fal-webhook-handler', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${falApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: storyBit.image_prompt,
          }),
        })

        if (!falResponse.ok) {
          const errorText = await falResponse.text()
          console.error(`Failed to submit job for story bit ${storyBit.id}:`, errorText)
          continue
        }

        const falResult = await falResponse.json()
        const requestId = falResult.request_id

        if (!requestId) {
          console.error('No request_id received from fal.ai for story bit:', storyBit.id)
          continue
        }

        // Create job tracking record
        const { error: jobError } = await supabase
          .from('image_generation_jobs')
          .insert({
            story_bit_id: storyBit.id,
            fal_job_id: requestId,
            status: 'IN_QUEUE',
            webhook_url: webhookUrl
          })

        if (jobError) {
          console.error('Error creating job record:', jobError)
          continue
        }

        // Update story bit status
        const { error: updateError } = await supabase
          .from('story_bits')
          .update({ image_generation_status: 'generating' })
          .eq('id', storyBit.id)

        if (updateError) {
          console.error('Error updating story bit status:', updateError)
        }

        results.push({
          storyBitId: storyBit.id,
          requestId,
          status: 'submitted'
        })

        console.log(`Submitted image generation job for story bit ${storyBit.id}: ${requestId}`)

      } catch (error) {
        console.error(`Error processing story bit ${storyBit.id}:`, error)
        results.push({
          storyBitId: storyBit.id,
          status: 'error',
          error: error.message
        })

        // Mark story bit as failed
        await supabase
          .from('story_bits')
          .update({ image_generation_status: 'failed' })
          .eq('id', storyBit.id)
      }
    }

    return new Response(JSON.stringify({ 
      message: 'Image generation jobs submitted',
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in generate-images-for-story:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})