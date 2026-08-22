import React from 'react';
import { ArrowLeft, Bot, FileText } from 'lucide-react';
import { FileSystemItem } from '../domain/types';

interface FileViewerProps {
  file: FileSystemItem;
  content: string;
  onBack: () => void;
  onOpenAgent: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({
  file,
  content,
  onBack,
  onOpenAgent,
}) => {
  return (
    <div className="file-viewer-card">
      <div className="file-viewer-header">
        <div className="viewer-title">
          <FileText size={18} className="icon-file" />
          <span className="file-title">{file.name}</span>
          <span className="file-path-sub">({file.path})</span>
        </div>
        <div className="toolbar">
          <button className="btn btn-sm" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <button className="btn btn-sm btn-primary" onClick={onOpenAgent}>
            <Bot size={14} />
            <span>Ask Agent</span>
          </button>
        </div>
      </div>
      <pre className="file-content-body">{content || '(Empty file)'}</pre>
    </div>
  );
};
