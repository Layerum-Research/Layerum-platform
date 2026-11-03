import Image from 'next/image';
import './loading-screen.css';

type LoadingScreenProps = {
  /** 'app' uses --app-* tokens, 'public' uses --pb-* tokens. */
  tone?: 'app' | 'public';
  /** false renders a compact inline block (e.g. inside auth cards). */
  fullScreen?: boolean;
};

export function LoadingScreen({
  tone = 'app',
  fullScreen = true,
  children,
}: LoadingScreenProps & { children?: React.ReactNode }) {
  return (
    <main
      className="loading-screen"
      data-tone={tone}
      data-fullscreen={fullScreen ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      <div className="loading-screen-inner">
        <div className="loading-screen-brand">
          <span className="loading-screen-logo">
            <Image src="/logo.png" alt="" width={30} height={30} priority />
          </span>
          <span className="loading-screen-word">Layerum</span>
        </div>
        <div className="loading-screen-bar" aria-hidden="true">
          <span className="loading-screen-bar-fill" />
        </div>
        {children}
      </div>
    </main>
  );
}
