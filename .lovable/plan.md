## Etapa 1 — Fundação (esta entrega)

Foco: design system + shell navegável + schema SQL pronto para você rodar no seu Supabase. Sem integrações externas ainda (Google Places / IA entram nas próximas etapas quando você tiver as chaves).

### O que vou construir

1. **Design system dark violeta** em `src/styles.css`
   - Background `#0B0B10`, surface `#141420`, primary violeta `#8B5CF6`, foreground `#E5E7EB`
   - Tokens semânticos (oklch) para bg, surface, border, primary, muted, success/warn/danger
   - Dark-first (sem toggle claro nesta etapa)

2. **Shell da aplicação** com sidebar shadcn colapsável
   - Rotas placeholder: `/` (landing/login CTA), `/dashboard`, `/search`, `/crm`, `/messages`, `/settings`
   - Layout `_authenticated` já preparado (gate desativado enquanto Supabase não está conectado — TODO marcado)
   - Header com trigger de sidebar, breadcrumbs e menu de usuário

3. **Páginas em estado inicial (sem dados reais ainda)**
   - **Dashboard**: cards de KPI (Total pesquisas, Empresas, Sem site, Score >80, Clientes, Mensagens) com valores 0 e skeletons
   - **Search**: formulário (palavra-chave, cidade, estado, país, raio) + tabela de resultados vazia
   - **CRM**: kanban com colunas Novo / Contatado / Respondeu / Negociação / Cliente / Perdido
   - **Messages**: lista de templates e preview
   - **Settings**: placeholder para chaves de API

4. **Schema SQL** em `supabase/migrations/0001_init.sql` (você roda no seu projeto)
   - Tabelas: `profiles`, `searches`, `companies`, `messages`, `notes`, `activities`, `favorites`, `campaigns`, `user_roles`
   - UUIDs, FKs, timestamps, índices
   - **RLS habilitada em todas** + policies por `auth.uid()`
   - `GRANT`s corretos para `authenticated` / `service_role`
   - Enum `app_role` + função `has_role` (security definer, sem recursão)
   - Enum `lead_status` (novo/contatado/respondeu/negociacao/cliente/perdido)
   - Função `calculate_lead_score(company_id)` com regras: sem site +50, rating>4.5 +20, reviews>100 +15, telefone +10, whatsapp +10
   - Trigger `handle_new_user` cria `profile` no signup

5. **Client Supabase stub** em `src/integrations/supabase/client.ts`
   - Lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do `.env`
   - Comentário claro: "cole a URL e a publishable key do seu Supabase em `.env.local`"

6. **SEO básico + sitemap + robots**

### O que fica para próximas etapas (não faço agora)

- **Etapa 2**: Edge Function `google-places-search` + persistência dos resultados + cálculo de score no server
- **Etapa 3**: CRM funcional (drag-and-drop, notas, atividades, favoritos)
- **Etapa 4**: Geração de mensagens com IA (WhatsApp/Email/DM), campanhas, export CSV/XLSX

### Detalhes técnicos

- Stack respeitando o template: TanStack Start + TanStack Router + Query, Tailwind v4, shadcn.
- Auth: `supabase.auth` com email/senha + Google (pré-fiado no UI, ativa quando você conectar).
- Nada de banco interno / storage do Lovable — 100% Supabase (client-side + edge functions futuras).
- Nenhuma chave hardcoded; `.env.example` documentando variáveis.

### Passos que você fará depois desta entrega

1. Conectar seu Supabase: colocar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em `.env.local`.
2. Rodar `supabase/migrations/0001_init.sql` no SQL editor do seu projeto.
3. Me avisar para começar a Etapa 2 (Google Places).
