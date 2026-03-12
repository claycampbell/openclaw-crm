"use client";

import { useState, useEffect } from "react";
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
  TrendingUp,
  UserCheck,
  Swords,
  Mail,
  ClipboardCheck,
  FileText,
  PartyPopper,
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

const mainNav = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/sequences", label: "Sequences", icon: Mail },
  { href: "/battlecards", label: "Battlecards", icon: Swords },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/contracts", label: "Contracts", icon: FileText },
  { href: "/handoff", label: "Handoff", icon: PartyPopper },
];

const objectNav = [
  { href: "/objects/people", label: "People", icon: Users },
  { href: "/objects/companies", label: "Companies", icon: Building2 },
  { href: "/objects/deals", label: "Deals", icon: Handshake },
];

const analyticsNav = [
  { href: "/analytics/win-loss", label: "Win/Loss", icon: BarChart2 },
  { href: "/analytics/rep-coaching", label: "Rep Coaching", icon: UserCheck },
  { href: "/analytics/forecast", label: "Forecast", icon: TrendingUp },
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
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [lists, setLists] = useState<ListItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const { theme, setTheme } = useTheme();

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

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar sidebar-glass transition-all duration-200 ease-out overflow-hidden",
        expanded ? "w-56" : "w-12"
      )}
    >
      {/* Workspace switcher */}
      <div className="flex h-14 items-center px-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-sidebar-accent transition-colors">
              <LogoMark size={28} className="shrink-0" />
              {expanded && (
                <>
                  <span className="text-sm font-medium text-foreground truncate flex-1">
                    {activeWorkspace?.name || "Aria"}
                  </span>
                  <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => {
                  if (ws.id !== activeWorkspace?.id) {
                    switchWorkspace(ws);
                  }
                }}
                className="flex items-center gap-2"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground/5 text-xs font-semibold text-foreground shrink-0">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate flex-1">{ws.name}</span>
                {ws.id === activeWorkspace?.id && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/select-workspace?create=true" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Create workspace</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {expanded && (
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
              expanded={expanded}
              onClick={onNavigate}
              badge={item.href === "/inbox" && inboxCount > 0 ? inboxCount : undefined}
            />
          ))}
        </div>

        <div className="my-3 mx-2 h-px bg-sidebar-border" />

        {expanded && (
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
              expanded={expanded}
              onClick={onNavigate}
            />
          ))}
        </div>

        <div className="my-3 mx-2 h-px bg-sidebar-border" />

        {expanded && (
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Analytics
          </div>
        )}
        <div className="space-y-0.5">
          {analyticsNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname.startsWith(item.href)}
              expanded={expanded}
              onClick={onNavigate}
            />
          ))}
        </div>

        {expanded && lists.length > 0 && (
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

        {expanded && (
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
            expanded={expanded}
            onClick={onNavigate}
          />
        ))}

        {/* Theme toggle */}
        {expanded ? (
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

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  onClick,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  expanded: boolean;
  onClick?: () => void;
  badge?: number;
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
        <Icon className={cn("h-4 w-4", active && "text-primary")} />
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
