-- Adicionar políticas para administradores na tabela subscriptions
DROP POLICY IF EXISTS "subscriptions_admin_all" ON public.subscriptions;
CREATE POLICY "subscriptions_admin_all" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Adicionar políticas para administradores na tabela trial_usage
DROP POLICY IF EXISTS "trial_usage_admin_all" ON public.trial_usage;
CREATE POLICY "trial_usage_admin_all" ON public.trial_usage
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
