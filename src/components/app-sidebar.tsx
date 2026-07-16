import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Search,
  KanbanSquare,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";

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

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Buscar empresas", url: "/search", icon: Search },
  { title: "CRM", url: "/crm", icon: KanbanSquare },
  { title: "Mensagens IA", url: "/messages", icon: MessageSquare },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="size-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold">LeadFinder</div>
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
              {items.map((item) => (
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
      </SidebarContent>
      <SidebarFooter>
        {!collapsed && (
          <div className="rounded-lg border border-border/60 bg-card/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Etapa 1 · Fundação</div>
            Conecte o Supabase em <code className="text-primary">.env.local</code> para
            habilitar auth e dados.
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}