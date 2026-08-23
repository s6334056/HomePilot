import React from 'react';
import { ArrowLeft, RefreshCw, Home, Settings, Bot, PanelLeft } from 'lucide-react';
import { truncatePath } from '../utils/pathUtils';

export type NavbarMode = 'explorer' | 'agent';

interface NavbarBaseProps {
  currentPath: string;
  mode: NavbarMode;
}

interface ExplorerNavbarProps extends NavbarBaseProps {
  mode: 'explorer';
  onBack: () => void;
  canGoBack: boolean;
  onReload: () => void;
  onHome: () => void;
  onOpenSettings: () => void;
  onOpenAgent: () => void;
}

interface AgentNavbarProps extends NavbarBaseProps {
  mode: 'agent';
  onOpenSessionList: () => void;
  onOpenSettings: () => void;
  onOpenExplorer: () => void;
}

type NavbarProps = ExplorerNavbarProps | AgentNavbarProps;

export const Navbar: React.FC<NavbarProps> = (props) => {
  const displayPath = truncatePath(props.currentPath);

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
            <button className="btn-icon" onClick={props.onHome} title="Home">
              <Home size={18} />
            </button>
          </div>
          <div className="navbar-right">
            <button className="btn-icon" onClick={props.onOpenSettings} title="Settings">
              <Settings size={18} />
            </button>
            <button className="btn-icon btn-icon--agent" onClick={props.onOpenAgent} title="Agent">
              <Bot size={18} />
            </button>
          </div>
        </header>
        <nav className="path-bar">
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
            onClick={props.onOpenSessionList}
            title="Sessions"
          >
            <PanelLeft size={18} />
          </button>
        </div>
        <div className="navbar-right">
          <button className="btn-icon" onClick={props.onOpenSettings} title="Agent Settings">
            <Settings size={18} />
          </button>
          <button className="btn-icon" onClick={props.onOpenExplorer} title="Explorer">
            <Home size={18} />
          </button>
        </div>
      </header>
      <nav className="path-bar">
        <span className="path-bar-text" title={props.currentPath}>
          {displayPath}
        </span>
      </nav>
    </div>
  );
};
