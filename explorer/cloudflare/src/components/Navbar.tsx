import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Settings, Bot, FolderOpen, ArrowLeftRight } from 'lucide-react';
import { truncatePath, computeHeadTailPath } from '../utils/pathUtils';

export type NavbarMode = 'explorer' | 'agent';

interface NavbarBaseProps {
  currentPath: string;
  mode: NavbarMode;
  rootPath?: string;
  title?: string;
  modelId?: string;
  showSettingsButton?: boolean;
  showSwapButton?: boolean;
  onSwapPanes?: () => void;
}

interface ExplorerNavbarProps extends NavbarBaseProps {
  mode: 'explorer';
  onBack: () => void;
  canGoBack: boolean;
  onReload: () => void;
  onOpenSettings: () => void;
  onOpenAgent: () => void;
}

interface AgentNavbarProps extends NavbarBaseProps {
  mode: 'agent';
  onBack: () => void;
  canGoBack?: boolean;
  onReload: () => void;
  onOpenSettings: () => void;
  onOpenExplorer: () => void;
}

type NavbarProps = ExplorerNavbarProps | AgentNavbarProps;

export const Navbar: React.FC<NavbarProps> = (props) => {
  const pathBarRef = useRef<HTMLDivElement>(null);
  const [pathBarWidth, setPathBarWidth] = useState<number>(0);

  useEffect(() => {
    const el = pathBarRef.current;
    if (!el) return;
    let active = true;
    const observer = new ResizeObserver((entries) => {
      if (!active) return;
      for (const entry of entries) {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        setPathBarWidth(w);
      }
    });
    observer.observe(el);
    return () => { active = false; observer.disconnect(); };
  }, []);

  const [displayPath, setDisplayPath] = useState(() => truncatePath(props.currentPath));

  useEffect(() => {
    if (pathBarWidth <= 0) {
      setDisplayPath(truncatePath(props.currentPath));
      return;
    }
    const innerWidth = pathBarWidth - 32;

    const badgeSelector = props.mode === 'explorer' ? '.path-bar-root' : '.path-bar-model';
    const badgeEl = pathBarRef.current?.querySelector(badgeSelector);
    const badgeWidth = badgeEl
      ? badgeEl.getBoundingClientRect().width
        + parseFloat(getComputedStyle(badgeEl).marginRight || '0')
      : 0;

    const available = innerWidth - badgeWidth;
    if (available <= 0) {
      setDisplayPath(truncatePath(props.currentPath));
      return;
    }
    const result = computeHeadTailPath(props.currentPath, available);
    setDisplayPath(result || props.currentPath);
  }, [pathBarWidth, props.currentPath, props.rootPath, props.modelId, props.mode]);

  if (props.mode === 'explorer') {
    return (
      <div className="navbar-container">
        <header className="app-header app-header--explorer">
          <div className="navbar-left">
            <button
              className="btn-icon"
              onClick={props.onBack}
              disabled={!props.canGoBack}
              title="Back (Parent)"
            >
              <ArrowLeft size={18} />
            </button>
            <button className="btn-icon" onClick={props.onReload} title="Reload">
              <RefreshCw size={18} />
            </button>
          </div>
          {props.title && (
            <div className="navbar-center">
              <span className="navbar-title">{props.title}</span>
            </div>
          )}
          <div className="navbar-right">
            <button className="btn-icon navbar-btn-mobile-only" onClick={props.onOpenSettings} title="Settings">
              <Settings size={18} />
            </button>
            <button className="btn-icon btn-icon--agent navbar-btn-mobile-only" onClick={props.onOpenAgent} title="Agent">
              <Bot size={18} />
            </button>
            {props.showSettingsButton && (
              <button className="btn-icon navbar-btn-desktop-only" onClick={props.onOpenSettings} title="Settings">
                <Settings size={18} />
              </button>
            )}
            {props.showSwapButton && (
              <button className="btn-icon btn-swap-panes" onClick={props.onSwapPanes} title="Swap panes">
                <ArrowLeftRight size={18} />
              </button>
            )}
          </div>
        </header>
        <nav className="path-bar" ref={pathBarRef}>
          {props.rootPath && (
            <span className="path-bar-root" title={`Root: ${props.rootPath}`}>
              Root: {truncatePath(props.rootPath)}
            </span>
          )}
          <span className="path-bar-text" title={props.currentPath}>
            {displayPath}
          </span>
        </nav>
      </div>
    );
  }

  // Agent mode
  return (
    <div className="navbar-container">
      <header className="app-header app-header--agent">
        <div className="navbar-left">
          <button
            className="btn-icon"
            onClick={props.onBack}
            disabled={!props.canGoBack}
            title="Back to Sessions"
          >
            <ArrowLeft size={18} />
          </button>
          <button className="btn-icon" onClick={props.onReload} title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
        {props.title && (
          <div className="navbar-center">
            <span className="navbar-title">{props.title}</span>
          </div>
        )}
        <div className="navbar-right">
          <button className="btn-icon navbar-btn-mobile-only" onClick={props.onOpenSettings} title="Settings">
            <Settings size={18} />
          </button>
          <button className="btn-icon navbar-btn-mobile-only" onClick={props.onOpenExplorer} title="Explorer">
            <FolderOpen size={18} />
          </button>
          {props.showSettingsButton && (
            <button className="btn-icon navbar-btn-desktop-only" onClick={props.onOpenSettings} title="Settings">
              <Settings size={18} />
            </button>
          )}
          {props.showSwapButton && (
            <button className="btn-icon btn-swap-panes" onClick={props.onSwapPanes} title="Swap panes">
              <ArrowLeftRight size={18} />
            </button>
          )}
        </div>
      </header>
      <nav className="path-bar" ref={pathBarRef}>
        {props.modelId && (
          <span className="path-bar-model" title={`Model: ${props.modelId}`}>
            {props.modelId}
          </span>
        )}
        <span className="path-bar-text" title={props.currentPath}>
          {displayPath}
        </span>
      </nav>
    </div>
  );
};
