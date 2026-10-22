import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'ai-auto-subsync-zykexe2i',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_Ako28X1FCh4ww96_QMoxvY2bT0NrvQXV',
  authRequired: false,
  auth: { mode: 'managed' },
})
