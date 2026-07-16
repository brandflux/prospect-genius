import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase compartilhado.
 *
 * ESTE PROJETO USA UM SUPABASE EXTERNO (não o backend interno do Lovable).
 * Preencha .env.local com:
 *   VITE_SUPABASE_URL="https://xxxx.supabase.co"
 *   VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..." (ou a anon key)
 *
 * Enquanto as variáveis não estão preenchidas, criamos um stub que
 * lança ao ser usado — assim a UI carrega e mostra claramente o que falta.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

function makeStub(): SupabaseClient {
  const err = () => {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em .env.local",
    );
  };
  return new Proxy({} as SupabaseClient, {
    get() {
      return err;
    },
  });
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : makeStub();