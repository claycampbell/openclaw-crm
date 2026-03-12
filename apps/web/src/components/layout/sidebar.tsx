"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CreateListModal } from "@/components/lists/create-list-modal";
import {
  Home,
  MessageSquare,
  CheckSquare,
  StickyNote,
  Bell,
  Inbox,
  Users,
  Building2,
  Handshake,
  List,
  Plus,
  Settings,
  BookOpen,
  ChevronsUpDown,
  Check,
  Sun,
  Moon,
  BarChart2,
  Swords,
  Mail,
  ClipboardCheck,
  FileText,
  PartyPopper,
  Zap,
  Flame,
  PanelLeft,
  FileCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { LogoMark } from "@/components/brand/logo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_STORAGE_KEY = "sidebar-expanded";

const mainNav = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/inbox", label: "Reviews", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const salesNav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/hot-leads", label: "Hot Leads", icon: Flame },
  { href: "/sequences", label: "Sequences", icon: Mail },
  { href: "/battlecards", label: "Battlecards", icon: Swords },
  { href: "/close", label: "Close", icon: FileCheck },
];

const automationNav = [
  { href: "/automations", label: "Automations", icon: Zap },
];

const objectNav = [
  { href: "/objects/people", label: "People", icon: Users, iconColor: "text-violet-500" },
  { href: "/objects/companies", label: "Companies", icon: Building2, iconColor: "text-blue-500" },
  { href: "/objects/deals", label: "Deals", icon: Handshake, iconColor: "text-emerald-500" },
];



const bottomNav = [
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface ListItem {
  id: string;
  name: string;
  objectName: string;
  entryCount: number;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  type?: string;
  parentWorkspaceId?: string | null;
}

interface WorkspaceGroup {
  type: "standalone" | "agency_group";
  workspace: Workspace;
  children?: Array<{
    workspace: Workspace;
    children?: Workspace[];
  }>;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [lists, setLists] = useState<ListItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceGroups, setWorkspaceGroups] = useState<WorkspaceGroup[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const { theme, setTheme } = useTheme();

  // Load persisted sidebar state
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        setExpanded(stored === "true");
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  useEffect(() => {
    // Load pending draft count for inbox badge
    fetch("/api/v1/assets?status=draft")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.data)) setInboxCount(data.data.length);
      })
      .catch(() => {});

    fetch("/api/v1/lists")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setLists(data.data);
      })
      .catch(() => {});

    // Fetch flat list for active workspace detection
    fetch("/api/v1/workspaces")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setWorkspaces(data.data);
          const cookieId = document.cookie
            .split("; ")
            .find((c) => c.startsWith("active-workspace-id="))
            ?.split("=")[1];
          const active = data.data.find((ws: Workspace) => ws.id === cookieId) || data.data[0];
          if (active) setActiveWorkspace(active);
        }
      })
      .catch(() => {});
    // Fetch grouped hierarchy for dropdown display
    fetch("/api/v1/workspaces?grouped=true")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setWorkspaceGroups(data.data);
      })
      .catch(() => {});
  }, []);

  async function switchWorkspace(ws: Workspace) {
    const res = await fetch("/api/v1/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: ws.id }),
    });
    if (res.ok) {
      window.location.reload();
    }
  }

  async function handleCreateList(name: string, objectSlug: string) {
    const res = await fetch("/api/v1/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, objectSlug }),
    });
    if (res.ok) {
      const listRes = await fetch("/api/v1/lists");
      if (listRes.ok) {
        const data = await listRes.json();
        if (data.data) setLists(data.data);
      }
    }
  }

  // Prevent layout shift on first render — default to expanded, then correct from localStorage
  const isExpanded = mounted ? expanded : true;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar sidebar-glass transition-all duration-200 ease-out overflow-hidden",
        isExpanded ? "w-56" : "w-12"
      )}
    >
      {/* Header: Logo + Toggle */}
      <div className="flex h-14 items-center px-2.5">
        {isExpanded ? (
          <div className="flex w-full items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-sidebar-accent transition-colors min-w-0">
                  <LogoMark size={28} className="shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {activeWorkspace?.name || "Aria"}
                    </span>
                    {activeWorkspace?.type && activeWorkspace.type !== "company" && (
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {activeWorkspace.type === "business_unit" ? "Business Unit" : activeWorkspace.type}
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {workspaceGroups.length > 0 ? (
                  // Hierarchical display
                  workspaceGroups.map((group, gi) => (
                    <div key={group.workspace.id}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <WorkspaceSwitchItem
                        ws={group.workspace}
                        active={activeWorkspace?.id === group.workspace.id}
                        onClick={() => switchWorkspace(group.workspace)}
                        indent={0}
                      />
                      {group.children?.map((child) => (
                        <div key={child.workspace.id}>
                          <WorkspaceSwitchItem
                            ws={child.workspace}
                            active={activeWorkspace?.id === child.workspace.id}
                            onClick={() => switchWorkspace(child.workspace)}
                            indent={1}
                          />
                          {child.children?.map((grandchild) => (
                            <WorkspaceSwitchItem
                              key={grandchild.id}
                              ws={grandchild}
                              active={activeWorkspace?.id === grandchild.id}
                              onClick={() => switchWorkspace(grandchild)}
                              indent={2}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  // Flat fallback
                  workspaces.map((ws) => (
                    <WorkspaceSwitchItem
                      key={ws.id}
                      ws={ws}
                      active={activeWorkspace?.id === ws.id}
                      onClick={() => switchWorkspace(ws)}
                      indent={0}
                    />
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/select-workspace?create=true" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    <span>Create workspace</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={toggleExpanded}
              className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors shrink-0"
              aria-label="Collapse sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleExpanded}
                className="flex w-full items-center justify-center rounded-lg py-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Expand sidebar
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {isExpanded && (
          <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Core
          </div>
        )}
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname === item.href}
              expanded={isExpanded}
              onClick={onNavigate}
              badge={item.href === "/inbox" && inboxCount > 0 ? inboxCount : undefined}
            />
          ))}
        </div>

        <div className="my-3 mx-2 h-px bg-sidebar-border" />

        {isExpanded && (
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Records
          </div>
        )}
        <div className="space-y-0.5">
          {objectNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname.startsWith(item.href)}
              expanded={isExpanded}
              onClick={onNavigate}
            />
          ))}
        </div>

        <div className="my-3 mx-2 h-px bg-sidebar-border" />

        {isExpanded && (
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Sales
          </div>
        )}
        <div className="space-y-0.5">
          {salesNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              expanded={isExpanded}
              onClick={onNavigate}
            />
          ))}
        </div>

        <div className="my-3 mx-2 h-px bg-sidebar-border" />

        {isExpanded && (
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Automation
          </div>
        )}
        <div className="space-y-0.5">
          {automationNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname.startsWith(item.href)}
              expanded={isExpanded}
              onClick={onNavigate}
            />
          ))}
        </div>

        {isExpanded && lists.length > 0 && (
          <>
            <div className="my-3 mx-2 h-px bg-sidebar-border" />
            <div className="space-y-0.5">
              {lists.map((list) => (
                <Link
                  key={list.id}
                  href={`/lists/${list.id}`}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    pathname === `/lists/${list.id}`
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <List className="h-4 w-4 shrink-0" />
                  <span className="truncate">{list.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {list.entryCount}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {isExpanded && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>New list</span>
          </button>
        )}
      </nav>

      {/* Bottom navigation */}
      <div className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
        {bottomNav.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={pathname.startsWith(item.href)}
            expanded={isExpanded}
            onClick={onNavigate}
          />
        ))}

        {/* Theme toggle */}
        {isExpanded ? (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex w-full items-center justify-center rounded-lg py-1.5 text-sm transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 shrink-0" />
                ) : (
                  <Moon className="h-4 w-4 shrink-0" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <CreateListModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateList}
      />
    </aside>
  );
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  agency: { label: "AG", color: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
  company: { label: "CO", color: "bg-blue-500/20 text-blue-600 dark:text-blue-400" },
  business_unit: { label: "BU", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
};

function WorkspaceSwitchItem({
  ws,
  active,
  onClick,
  indent = 0,
}: {
  ws: Workspace;
  active: boolean;
  onClick: () => void;
  indent?: number;
}) {
  const typeInfo = TYPE_LABELS[ws.type || "company"];
  return (
    <DropdownMenuItem
      onClick={() => !active && onClick()}
      className="flex items-center gap-2"
      style={{ paddingLeft: `${8 + indent * 16}px` }}
    >
      <div className={cn(
        "flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold shrink-0",
        typeInfo?.color || "bg-foreground/5 text-foreground"
      )}>
        {typeInfo?.label || ws.name.charAt(0).toUpperCase()}
      </div>
      <span className="truncate flex-1 text-sm">{ws.name}</span>
      {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </DropdownMenuItem>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  onClick,
  badge,
  iconColor,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  expanded: boolean;
  onClick?: () => void;
  badge?: number;
  iconColor?: string;
}) {
  const link = (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center rounded-lg py-1.5 text-sm transition-colors",
        expanded ? "gap-2.5 px-2.5" : "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <div className="relative shrink-0">
        <Icon className={cn("h-4 w-4", iconColor || (active && "text-primary"))} />
        {badge !== undefined && !expanded && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      {expanded && (
        <>
          <span className="flex-1">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (expanded) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
