import React from 'react';
import { Folder, FileText } from 'lucide-react';
import { FileSystemItem } from '../domain/types';

interface FileTableProps {
  items: FileSystemItem[];
  selectedIndex: number;
  onSelectItem: (index: number) => void;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (item: FileSystemItem) => void;
}

export const FileTable: React.FC<FileTableProps> = ({
  items,
  selectedIndex,
  onSelectItem,
  onOpenDirectory,
  onOpenFile,
}) => {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <Folder size={40} className="icon-muted" />
        <p>(Empty Directory)</p>
      </div>
    );
  }

  return (
    <div className="file-table-card">
      <table className="file-table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="col-size" style={{ width: '110px' }}>Size</th>
            <th className="col-type" style={{ width: '130px' }}>Type</th>
            <th className="col-modified" style={{ width: '160px' }}>Modified</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isFocused = idx === selectedIndex;
            const isDir = item.type === 'directory';

            return (
              <tr
                key={item.id}
                className={`file-row ${isFocused ? 'focused' : ''}`}
                onClick={() => {
                  onSelectItem(idx);
                  if (isDir) {
                    onOpenDirectory(item.path);
                  } else {
                    onOpenFile(item);
                  }
                }}
              >
                <td>
                  <div className="file-name-cell">
                    {isDir ? (
                      <Folder size={18} className="icon-folder" />
                    ) : (
                      <FileText size={18} className="icon-file" />
                    )}
                    <span className="file-name-text">{item.name}</span>
                    {isFocused && <span className="focus-pill">G2 Focused</span>}
                  </div>
                </td>
                <td className="cell-muted col-size">
                  {item.size !== undefined ? formatBytes(item.size) : (item.childrenCount ? `${item.childrenCount} items` : '-')}
                </td>
                <td className="cell-muted col-type">{isDir ? 'Directory' : (item.mimeType || 'File')}</td>
                <td className="cell-muted col-modified">
                  {item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString('ja-JP') : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
