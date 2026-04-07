import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// NEXT_PUBLIC_SUPABASE_URL=https://hmztjweohbfnbpuidrtl.supabase.co
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_HvMwZ4XO6nZrYwCKs1Kffw_zVyjowBI