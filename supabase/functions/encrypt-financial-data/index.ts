import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Verify user authentication and permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check if user has appropriate role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!profile || !['Super-Admin', 'HR'].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient privileges' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const { action, employeeUserId, data: requestData } = await req.json()

    // SECURITY FIX: Use proper key derivation instead of hardcoded keys
    const baseKey = Deno.env.get('FINANCIAL_ENCRYPTION_KEY')
    if (!baseKey) {
      return new Response(
        JSON.stringify({ error: 'Encryption service unavailable' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
      )
    }

    const encoder = new TextEncoder()

    // Helper to derive key from salt
    const deriveKey = async (salt: Uint8Array) => {
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(baseKey + '_' + employeeUserId),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      )
      return crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
    }

    if (action === 'encrypt') {
      const encryptedResults: Record<string, string> = {}
      
      for (const [field, value] of Object.entries(requestData)) {
        if (value && typeof value === 'string') {
          // Generate unique random salt and IV for each field
          const salt = crypto.getRandomValues(new Uint8Array(16))
          const iv = crypto.getRandomValues(new Uint8Array(12))
          const derivedKey = await deriveKey(salt)
          const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            derivedKey,
            encoder.encode(value)
          )
          
          // Combine salt + IV + encrypted data
          const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
          combined.set(salt)
          combined.set(iv, salt.length)
          combined.set(new Uint8Array(encrypted), salt.length + iv.length)
          
          encryptedResults[field] = btoa(String.fromCharCode(...combined))
        }
      }

      return new Response(
        JSON.stringify({ encryptedData: encryptedResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } 
    
    if (action === 'decrypt') {
      const decryptedResults: Record<string, string> = {}
      
      for (const [field, encryptedValue] of Object.entries(requestData)) {
        if (encryptedValue && typeof encryptedValue === 'string') {
          try {
            const combined = new Uint8Array(atob(encryptedValue).split('').map(c => c.charCodeAt(0)))
            
            // Try new format first (salt[16] + iv[12] + ciphertext)
            let salt: Uint8Array, iv: Uint8Array, encrypted: Uint8Array
            if (combined.length > 28) {
              // New format: 16-byte salt + 12-byte IV + ciphertext
              salt = combined.slice(0, 16)
              iv = combined.slice(16, 28)
              encrypted = combined.slice(28)
            } else {
              // Fallback won't work for very short data, throw
              throw new Error('Invalid encrypted data format')
            }

            const derivedKey = await deriveKey(salt)
            const decrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv },
              derivedKey,
              encrypted
            )

            decryptedResults[field] = new TextDecoder().decode(decrypted)
          } catch (error) {
            console.error(`SECURITY: Failed to decrypt field ${field} for user ${user.email}:`, error)
            decryptedResults[field] = '[DECRYPTION_ERROR]'
          }
        }
      }

      // Enhanced audit logging for decryption
      await supabase
        .from('financial_data_audit_enhanced')
        .insert({
          accessed_by: user.id,
          employee_user_id: employeeUserId,
          access_type: 'DECRYPT_VIA_EDGE_FUNCTION',
          access_reason: `Secure decryption request by ${user.email} via edge function`,
          fields_accessed: Object.keys(requestData),
          risk_score: 5, // Medium risk for edge function access
          suspicious_flags: [],
          data_classification: 'HIGHLY_CONFIDENTIAL'
        })

      console.log(`SECURITY: Financial data decryption completed for employee ${employeeUserId} by ${user.email}`)

      return new Response(
        JSON.stringify({ decryptedData: decryptedResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error) {
    console.error('Encryption service error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})