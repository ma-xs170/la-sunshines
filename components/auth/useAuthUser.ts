'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { supabaseConfigured } from '@/lib/supabase/config';

export interface NavUser {
  email: string;
  firstName: string;
  /** admin ou membre d'un organisateur : sert UNIQUEMENT à afficher l'entrée « Organisateur » du menu. */
  isOrganizer: boolean;
}

// AFFICHAGE uniquement (menu du header). Ne sert JAMAIS à autoriser quoi que ce
// soit : chaque page / route serveur revérifie l'identité avec getUser().
export function useAuthUser(): { ready: boolean; user: NavUser | null } {
  const [state, setState] = useState<{ ready: boolean; user: NavUser | null }>({
    ready: false,
    user: null,
  });

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = createSupabaseBrowserClient();
    let alive = true;

    async function load(userId: string | undefined, email: string | undefined) {
      if (!userId) {
        if (alive) setState({ ready: true, user: null });
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('first_name, role')
        .eq('id', userId)
        .maybeSingle();
      let isOrganizer = data?.role === 'admin';
      if (!isOrganizer) {
        // RLS : un utilisateur ne voit que ses propres appartenances
        const { count } = await supabase.from('organizer_members').select('organizer_id', { count: 'exact', head: true });
        isOrganizer = (count ?? 0) > 0;
      }
      if (alive) {
        setState({ ready: true, user: { email: email ?? '', firstName: data?.first_name ?? '', isOrganizer } });
      }
    }

    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id, data.session?.user.email));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      // hors du callback : évite un blocage connu de supabase-js si on await dedans
      setTimeout(() => load(session?.user.id, session?.user.email), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
