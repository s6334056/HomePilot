import React from 'react';
import { FileText } from 'lucide-react';
import { FileSystemItem } from '../domain/types';

interface FileViewerProps {
  file: FileSystemItem;
  content: string;
}

export const FileViewer: React.FC<FileViewerProps> = ({
  file,
  content,
}) => {
  return (
    <div className="file-viewer-card">
      <div className="file-viewer-header">
        <div className="viewer-title">
          <FileText size={18} className="icon-file" />
          <span className="file-title">{file.name}</span>
        </div>
      </div>
      <pre className="file-content-body">{content || '(Empty file)'}</pre>
    </div>
  );
};
