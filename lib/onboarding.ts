import { supabase } from './supabase'

export const getOnboardingKey = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  return userId 
    ? `ai_wallet_onboarding_${userId}` 
    : 'ai_wallet_onboarding'
}

export const getOnboardingData = async () => {
  const key = await getOnboardingKey()
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : {}
}
