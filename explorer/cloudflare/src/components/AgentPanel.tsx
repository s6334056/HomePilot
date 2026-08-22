import React from 'react';
import { Bot, ArrowLeft } from 'lucide-react';
import { AgentContext } from '../domain/types';

interface AgentPanelProps {
  context: AgentContext | null;
  onReturn: () => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ context, onReturn }) => {
  const target = context?.selectedFile?.path || context?.selectedItem?.path || context?.currentPath || '/home';

  return (
    <div className="agent-panel-card">
      <div className="agent-panel-header">
        <div className="agent-badge">
          <Bot size={18} />
          <span>HomePilot AI Agent (Placeholder)</span>
        </div>
        <button className="btn btn-sm" onClick={onReturn}>
          <ArrowLeft size={14} />
          <span>Return</span>
        </button>
      </div>

      <div className="context-section">
        <h4>Target Context</h4>
        <div className="context-box">
          <div><strong>Active Path:</strong> {target}</div>
          <div><strong>Source Screen:</strong> {context?.sourceScreen ?? 'explorer'}</div>
          <div><strong>Timestamp:</strong> {context?.timestamp ?? new Date().toISOString()}</div>
          {context?.selectedFile && (
            <div><strong>File Name:</strong> {context.selectedFile.name} ({context.selectedFile.mimeType ?? 'File'})</div>
          )}
        </div>
      </div>

      <div className="info-box">
        <p><strong>Integration Note:</strong></p>
        <p>
          In future milestones, this context is passed directly to the OpenCode Agent / Cloud LLM backend to execute commands, perform file edits, and automate tasks triggered via G2 smart glasses or PC/Phone UI.
        </p>
      </div>
    </div>
  );
};
