"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Copy, Minus, Terminal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PublicThemeToggle } from "@/components/public/theme-toggle";

const ALLOWED = [
  {
    title: "View your profile and workspaces",
    detail: "Name, email and the workspaces you belong to",
  },
  {
    title: "Read entities, documents and models",
    detail: "Including model configurations",
  },
  {
    title: "Add documents and create entities",
    detail: "Upload content to your workspaces",
  },
  { title: "Delete documents", detail: "Remove documents you can manage" },
  { title: "Run queries", detail: "Search and ask across your knowledge" },
];

const DENIED = [
  {
    title: "Manage your account",
    detail: "Password and two-factor settings",
  },
  {
    title: "Manage workspace settings",
    detail: "Members, roles, API keys and providers",
  },
  { title: "Delete workspaces", detail: "Workspaces stay intact" },
];

export function Shell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className="oa-main">
      <div className={wide ? "oa-wrap wide" : "oa-wrap"}>
        <article className="ap-auth-card oa-card">
          <div className="ap-card-body">{children}</div>
        </article>
        <footer className="oa-footer">
          <nav className="oa-footer-links" aria-label="Legal">
            <Link href="/license">License</Link>
          </nav>
          <PublicThemeToggle label="Toggle theme" />
        </footer>
      </div>
    </section>
  );
}

export function Brand() {
  return (
    <div className="oa-brand">
      <Image src="/logo.png" alt="" width={24} height={24} priority />
      <span>Layerum</span>
    </div>
  );
}

export function ConnectionRow() {
  return (
    <div className="oa-connection" aria-hidden="true">
      <span className="oa-tile">
        <Image src="/logo.png" alt="" width={28} height={28} />
      </span>
      <span className="oa-connector" />
      <span className="oa-tile">
        <Terminal size={24} />
      </span>
    </div>
  );
}

function ScopeList({
  label,
  items,
  denied,
}: {
  label: string;
  items: { title: string; detail: string }[];
  denied?: boolean;
}) {
  return (
    <section className="oa-section">
      <h2 className="oa-section-label">{label}</h2>
      <ul className={`oa-scopes${denied ? " denied" : ""}`}>
        {items.map((item) => (
          <li key={item.title}>
            <span className="oa-scope-icon" aria-hidden="true">
              {denied ? <Minus size={13} /> : <Check size={13} />}
            </span>
            <span className="oa-scope-text">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Permissions() {
  return (
    <>
      <div className="oa-permissions">
        <ScopeList label="This will allow Layerum CLI to:" items={ALLOWED} />
        <ScopeList label="It will not be able to:" items={DENIED} denied />
      </div>
      <p className="oa-note">Always limited by your role in each workspace.</p>
    </>
  );
}

export function CodeView({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Brand />
      <header className="ap-head">
        <h1>Paste this code into your terminal</h1>
      </header>
      <div className="oa-code-box">
        <code className="oa-code">{code}</code>
        <button className="oa-copy" type="button" onClick={() => void onCopy()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="oa-note">It expires in 5 minutes and works once.</p>
      <p className="oa-note">You can close this tab after pasting it.</p>
    </>
  );
}
