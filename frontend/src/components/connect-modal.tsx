'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './modal';
import { CLAUDE_CODE_CODE, CLI_SERVER_ENV_CODE, MCP_CONFIG_CODE } from '@/lib/cli-snippets';
import './connect-modal.css';

const TABS = ['cli', 'mcp'] as const;
type Tab = (typeof TABS)[number];

type Step = { label: string; command: string };

function getSteps(tab: Tab, workspaceId: string): Step[] {
  if (tab === 'cli') {
    return [
      { label: 'Install', command: 'npm i -g @layerum-team/cli' },
      { label: 'Server', command: CLI_SERVER_ENV_CODE },
      { label: 'Sign in', command: 'layerum login' },
      { label: 'Select this workspace', command: `layerum use ${workspaceId}` },
    ];
  }
  return [
    { label: 'Claude Code', command: CLAUDE_CODE_CODE },
    { label: 'Other clients', command: MCP_CONFIG_CODE },
  ];
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
}

export function ConnectModal({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const [active, setActive] = useState<Tab>('cli');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ cli: null, mcp: null });

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setActive(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  }

  return (
    <Modal open={open} title="MCP & CLI" onOpenChange={onOpenChange}>
      <div className="connect-modal">
        <div className="connect-modal-tabs" role="tablist" aria-label="MCP & CLI">
          {TABS.map((tab, index) => (
            <button
              key={tab}
              ref={(node) => {
                tabRefs.current[tab] = node;
              }}
              type="button"
              role="tab"
              id={`connect-modal-tab-${tab}`}
              aria-selected={active === tab}
              aria-controls={`connect-modal-panel-${tab}`}
              tabIndex={active === tab ? 0 : -1}
              onClick={() => setActive(tab)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
        {TABS.map((tab) => (
          <ol
            key={tab}
            className="connect-modal-steps"
            role="tabpanel"
            id={`connect-modal-panel-${tab}`}
            aria-labelledby={`connect-modal-tab-${tab}`}
            hidden={active !== tab}
          >
            {getSteps(tab, workspaceId).map((step) => (
              <li key={step.label}>
                <span className="connect-modal-step-label">{step.label}</span>
                <div className="connect-modal-code">
                  <pre>
                    <code>{step.command}</code>
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(step.command)}
                    aria-label={`Copy ${step.label}`}
                    title="Copy"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ))}
        <Link className="connect-modal-docs" href="/docs" target="_blank">
          Documentation
        </Link>
      </div>
    </Modal>
  );
}
