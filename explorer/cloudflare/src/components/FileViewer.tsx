import React from 'react';

interface FileViewerProps {
  content: string;
}

export const FileViewer: React.FC<FileViewerProps> = ({
  content,
}) => {
  return (
    <div className="file-viewer-container">
      <div className="file-viewer-content">
        <pre className="file-content-body">{content || '(Empty file)'}</pre>
      </div>
    </div>
  );
};
