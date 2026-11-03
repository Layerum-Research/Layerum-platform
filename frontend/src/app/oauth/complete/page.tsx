"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Terminal, X } from "lucide-react";
import Image from "next/image";
import { LoadingScreen } from "@/components/loading-screen";
import { Brand, Shell } from "../authorize/parts";

const STATES = {
  success: {
    title: "You're logged in",
    text: "Layerum CLI is connected to your account. You can close this tab and return to your terminal.",
  },
  cancelled: {
    title: "Login cancelled",
    text: "Nothing was authorized. You can close this tab.",
  },
  error: {
    title: "Login failed",
    text: "Return to your terminal and run layerum login again.",
  },
} as const;

type Status = keyof typeof STATES;

function statusFrom(value: string | null): Status {
  return value === "success" || value === "cancelled" ? value : "error";
}

export default function OAuthCompletePage() {
  return (
    <Suspense fallback={<LoadingScreen tone="app" />}>
      <OAuthCompleteContent />
    </Suspense>
  );
}

function OAuthCompleteContent() {
  const status = statusFrom(useSearchParams().get("status"));
  const { title, text } = STATES[status];

  return (
    <Shell>
      <Brand />
      <div className={`oa-connection oa-result ${status}`} aria-hidden="true">
        <span className="oa-tile">
          <Image src="/logo.png" alt="" width={28} height={28} />
        </span>
        <span className="oa-result-badge">
          {status === "success" ? <Check size={16} /> : <X size={16} />}
        </span>
        <span className="oa-tile">
          <Terminal size={24} />
        </span>
      </div>
      <header className="ap-head oa-head">
        <h1>{title}</h1>
        <p>{text}</p>
      </header>
    </Shell>
  );
}
