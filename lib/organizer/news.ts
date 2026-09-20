// Lecture des actualités côté serveur (fonctions SQL news_*, service role) : pastille « non lus » et liste.
import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { NewsCategory } from '@/lib/news/text';

export interface NewsItem { id: string; title: string; category: NewsCategory; body: string; image_url: string | null; pinned: boolean; published_at: string; read: boolean }

export async function unreadNewsCount(userId: string): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc('news_unread_count', { p_actor: userId });
  return error ? 0 : Number(data ?? 0);   // la pastille ne doit jamais casser une page
}

export async function newsFor(userId: string): Promise<NewsItem[] | null> {
  const { data, error } = await createSupabaseAdminClient().rpc('news_list', { p_actor: userId });
  return error ? null : (data as NewsItem[]);
}
