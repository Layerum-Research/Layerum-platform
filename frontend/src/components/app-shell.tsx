"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Plus,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { WORKSPACE_NAV } from "./workspace-nav";
import { ConnectModal } from "./connect-modal";
import { WorkspaceAccessProvider, useWorkspaceAccess } from "./workspace-access";
import "./app-shell.css";

const SIDEBAR_COLLAPSED_KEY = "layerum:sidebar-collapsed";

export function WorkspaceShell({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceAccessProvider workspaceId={workspaceId}>
      <WorkspaceShellContent workspaceId={workspaceId}>{children}</WorkspaceShellContent>
    </WorkspaceAccessProvider>
  );
}

function WorkspaceShellContent({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const access = useWorkspaceAccess();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") {
        setIsCollapsed(true);
      }
    } finally {
      setHasLoadedPreference(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedPreference) return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");
  }, [isCollapsed, hasLoadedPreference]);

  if (access.loading) {
    return (
      <div className="shell shell-loading">
        <aside className="shell-aside">
          <div className="shell-brand-wrap">
            <span className="shell-skeleton shell-skeleton-title" />
            <span className="shell-skeleton shell-skeleton-caption" />
          </div>
          <div className="shell-nav" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="shell-skeleton shell-skeleton-nav" key={index} />
            ))}
          </div>
          <div className="shell-bottom">
            <div className="shell-skeleton shell-skeleton-button" />
            <div className="shell-footer-links">
              <div className="shell-skeleton shell-skeleton-footer" />
              <div className="shell-skeleton shell-skeleton-footer" />
            </div>
          </div>
        </aside>

        <main className="shell-main">
          <div className="shell-page-skeleton">
            <div className="shell-page-skeleton-head">
              <span className="shell-skeleton shell-skeleton-title large" />
              <span className="shell-skeleton shell-skeleton-caption wide" />
            </div>
            <div className="shell-page-skeleton-row">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="shell-skeleton shell-skeleton-card" key={index} />
              ))}
            </div>
            <div className="shell-page-skeleton-row tall">
              <div className="shell-skeleton shell-skeleton-panel" />
              <div className="shell-skeleton shell-skeleton-panel" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`shell ${isCollapsed ? "collapsed" : ""}`}>
      <aside className="shell-aside">
        <div className="shell-brand-wrap">
          <Link
            className="shell-brand-link"
            href="/workspaces"
            title="Go to workspaces"
          >
            <Image src="/logo.png" alt="" width={18} height={18} priority className="shell-brand-logo" />
            <span className="shell-brand">Layerum</span>
          </Link>
          <button
            type="button"
            className="shell-collapse-toggle"
            onClick={() => setIsCollapsed((current) => !current)}
            aria-pressed={isCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="shell-nav" aria-label="Workspace navigation">
          {WORKSPACE_NAV.filter((item) => access.can(item.access)).map((item) => {
            const Icon = item.icon;
            const active = pathname?.includes(`/${item.href}`) ?? false;
            return (
              <Link
                key={item.key}
                href={`/w/${workspaceId}/${item.href}`}
                className={`shell-nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={item.label}
              >
                <Icon size={16} />
                <span className="shell-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shell-bottom">
          <Link className="shell-new-project" href="/workspaces" title="New Workspace">
            <Plus size={16} />
            <span className="shell-nav-label">New Workspace</span>
          </Link>
          <div className="shell-footer-links">
            <button
              type="button"
              className="shell-nav-link shell-footer-link"
              onClick={() => setConnectOpen(true)}
              title="MCP & CLI"
              aria-label="MCP & CLI"
            >
              <Terminal size={16} />
              <span className="shell-nav-label">MCP & CLI</span>
              <span className="shell-nav-label shell-new-tag">NEW</span>
            </button>
            {/* <Link href="/account" className="shell-nav-link shell-footer-link">
              <Settings size={16} />
              <span>Settings</span>
            </Link> */}
            <Link href="/docs" className="shell-nav-link shell-footer-link" title="Support">
              <CircleHelp size={16} />
              <span className="shell-nav-label">Support</span>
            </Link>
          </div>
        </div>
      </aside>

      <main className="shell-main">{children}</main>
      <ConnectModal open={connectOpen} onOpenChange={setConnectOpen} workspaceId={workspaceId} />
    </div>
  );
}
