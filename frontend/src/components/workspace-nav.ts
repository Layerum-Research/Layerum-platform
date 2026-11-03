import {
  Activity,
  BarChart3,
  BrainCircuit,
  FolderTree,
  Key,
  Network,
  ScanSearch,
  Shield,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceAccessRequirement } from "@/lib/workspace-access";

export type WorkspaceNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  access: WorkspaceAccessRequirement;
};

export const WORKSPACE_NAV: readonly WorkspaceNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3, href: "dashboard", access: { type: "role", roles: ["owner", "admin"] } },
  { key: "hierarchy", label: "Hierarchy", icon: FolderTree, href: "hierarchy", access: { type: "permission", permission: "query.run" } },
  { key: "providers", label: "Providers", icon: Network, href: "providers", access: { type: "permission", permission: "providers.manage" } },
  { key: "models", label: "Models", icon: BrainCircuit, href: "models", access: { type: "permission", permission: "query.run" } },
  { key: "playground", label: "Playground", icon: ScanSearch, href: "playground", access: { type: "permission", permission: "query.run" } },
  { key: "api-keys", label: "API Keys", icon: Key, href: "api-keys", access: { type: "permission", permission: "api_keys.manage" } },
  { key: "access", label: "Access", icon: Shield, href: "access", access: { type: "permission", permission: "members.manage" } },
  { key: "audit", label: "Audit", icon: Activity, href: "audit", access: { type: "permission", permission: "audit.read" } },
] as const;
