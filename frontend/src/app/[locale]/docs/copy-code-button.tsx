'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyCodeButton({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onCopy}
      aria-label="Copy code"
      title="Copy code"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <em>{copied ? 'Copied' : 'Copy'}</em>
    </button>
  );
}
