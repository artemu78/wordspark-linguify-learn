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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const webhook = await req.json()
    console.log('Received fal.ai webhook:', webhook)

    const { request_id, status } = webhook
    
    if (!request_id) {
      throw new Error('Missing request_id in webhook payload')
    }

    // Find the image generation job
    const { data: job, error: jobError } = await supabase
      .from('image_generation_jobs')
      .select('*')
      .eq('fal_job_id', request_id)
      .single()

    if (jobError || !job) {
      console.error('Job not found:', jobError)
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let updateData: any = {
      status,
      completed_at: new Date().toISOString()
    }

    let storyBitUpdate: any = {
      image_generation_status: status
    }

    if (status === 'COMPLETED') {
      // Extract image URL from webhook
      const imageUrl = webhook.result?.images?.[0]?.url || webhook.result?.image?.url
      if (imageUrl) {
        updateData.image_url = imageUrl
        storyBitUpdate.image_url = imageUrl
        storyBitUpdate.image_generation_status = 'completed'
      }
    } else if (status === 'FAILED') {
      updateData.error_message = webhook.error || 'Image generation failed'
      storyBitUpdate.image_generation_status = 'failed'
    }

    // Update the job
    const { error: updateJobError } = await supabase
      .from('image_generation_jobs')
      .update(updateData)
      .eq('id', job.id)

    if (updateJobError) {
      console.error('Error updating job:', updateJobError)
      throw updateJobError
    }

    // Update the story bit
    const { error: updateStoryBitError } = await supabase
      .from('story_bits')
      .update(storyBitUpdate)
      .eq('id', job.story_bit_id)

    if (updateStoryBitError) {
      console.error('Error updating story bit:', updateStoryBitError)
      throw updateStoryBitError
    }

    console.log(`Successfully processed webhook for job ${request_id}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})