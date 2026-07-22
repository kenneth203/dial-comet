import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY FIX: Authenticate user and verify role instead of using service role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create authenticated client with user JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Verify user role - only Super-Admin can perform this operation
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'Super-Admin') {
      console.error('Role verification failed:', profileError);
      return new Response(
        JSON.stringify({ error: 'Access denied: Super-Admin role required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log('Authorized Super-Admin user starting Kate Campbell request reassignment...')

    // Get Kate Campbell's user details
    const { data: kateDetails, error: kateError } = await supabaseClient
      .rpc('get_user_details_for_reassignment', { user_name: 'Kate Campbell' })

    if (kateError) {
      console.error('Error getting Kate Campbell details:', kateError)
      throw kateError
    }

    if (!kateDetails || kateDetails.length === 0) {
      throw new Error('Kate Campbell not found in system')
    }

    const kate = kateDetails[0]
    console.log('Found Kate Campbell:', kate)

    // Find all requests that belong to Kate but are assigned to Kenneth
    const { data: wrongRequests, error: wrongError } = await supabaseClient
      .from('holiday_requests')
      .select('id, user_id, system_user_id, start_date, end_date, absence_type')
      .neq('user_id', kate.auth_user_id)
      .eq('system_user_id', kate.system_user_id)

    if (wrongError) {
      console.error('Error finding wrong requests:', wrongError)
      throw wrongError
    }

    console.log('Found misassigned requests:', wrongRequests?.length || 0)

    if (wrongRequests && wrongRequests.length > 0) {
      // Reassign these requests to Kate
      const requestIds = wrongRequests.map(r => r.id)
      
      const { data: reassignResult, error: reassignError } = await supabaseClient
        .rpc('reassign_holiday_requests_admin', {
          request_ids: requestIds,
          target_user_id: kate.auth_user_id,
          target_system_user_id: kate.system_user_id
        })

      if (reassignError) {
        console.error('Error reassigning requests:', reassignError)
        throw reassignError
      }

      console.log('Successfully reassigned', requestIds.length, 'requests to Kate Campbell')
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          reassignedCount: requestIds.length,
          reassignedRequests: wrongRequests
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    } else {
      return new Response(
        JSON.stringify({ 
          success: true, 
          reassignedCount: 0,
          message: 'No misassigned requests found'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

  } catch (error) {
    console.error('Error in reassign-kate-requests:', error)
    return new Response(
      JSON.stringify({ error: 'Request reassignment failed. Contact support.' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})