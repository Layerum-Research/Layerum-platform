'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <article className="dr-code-block">
      <div className="dr-code-head">
        <span>{lang}</span>
        <button type="button" className="dr-code-copy" onClick={onCopy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <em>{copied ? 'Copied' : 'Copy'}</em>
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </article>
  );
}
