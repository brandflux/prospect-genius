import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Search,
  KanbanSquare,
  Sparkles,
  Shield,
  User,
  CreditCard,
  Cpu,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (r) => r.location.searchStr });
  const activeTab = new URLSearchParams(searchStr).get("tab") || "profile";
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-admin-check"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    }
  });

  const { data: subData } = useQuery({
    queryKey: ["user-subscription-status"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { isPro: false };
      const { data } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      return {
        isPro: data?.status === "active" || userData.user.email === "brandfluxsm@gmail.com",
      };
    }
  });

  const menuItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Buscar empresas", url: "/search", icon: Search },
    { title: "CRM", url: "/crm", icon: KanbanSquare },
    ...(isAdmin ? [{ title: "Painel Adm", url: "/admin", icon: Shield }] : []),
  ];

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="size-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                LeadFinder
                {subData?.isPro ? (
                  <span className="text-[8px] bg-primary/20 text-primary border border-primary/30 rounded px-1 font-bold">
                    PRO
                  </span>
                ) : (
                  <span className="text-[8px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded px-1 font-medium">
                    TRIAL
                  </span>
                )}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                AI Prospecting
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/settings" && activeTab === "profile"}>
                  <Link to="/settings" search={{ tab: "profile" }} className="flex items-center gap-2">
                    <User className="size-4" />
                    {!collapsed && <span>Profile</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/settings" && activeTab === "billing"}>
                  <Link to="/settings" search={{ tab: "billing" }} className="flex items-center gap-2">
                    <CreditCard className="size-4" />
                    {!collapsed && <span>Billing</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/settings" && activeTab === "providers"}>
                  <Link to="/settings" search={{ tab: "providers" }} className="flex items-center gap-2">
                    <Cpu className="size-4" />
                    {!collapsed && <span>API Providers</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 gap-2">
        {!collapsed && subData && !subData.isPro && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center space-y-2 mb-2">
            <p className="text-[10px] text-muted-foreground leading-normal">
              Obtenha buscas ilimitadas e remova o blur dos leads.
            </p>
            <Button 
              size="sm" 
              className="w-full text-[10px] font-bold h-7 bg-primary hover:bg-primary/95 text-white"
              onClick={() => navigate({ to: "/pricing" })}
            >
              Upgrade to Pro
            </Button>
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
          <LogOut className="size-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}