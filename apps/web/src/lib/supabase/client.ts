'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * The browser client. `createBrowserClient` memoises internally, so calling
 * this per component is cheap and every caller shares one auth session.
 */
export const createClient = () => createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabase = createClient();
