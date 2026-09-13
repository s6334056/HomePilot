import React from 'react';
import { Folder, FileText, Check } from 'lucide-react';
import { FileSystemItem } from '../domain/types';

interface FileTableProps {
  items: FileSystemItem[];
  selectedPaths: Set<string>;
  highlightPath: string | null;
  onSelectItem: (index: number) => void;
  onOpenDirectory: (path: string, index: number) => void;
  onOpenFile: (item: FileSystemItem, index: number) => void;
  onToggleSelect: (path: string) => void;
}

export const FileTable: React.FC<FileTableProps> = ({
  items,
  selectedPaths,
  highlightPath,
  onSelectItem,
  onOpenDirectory,
  onOpenFile,
  onToggleSelect,
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
            <th className="col-select"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isSelected = selectedPaths.has(item.path);
            const isDir = item.type === 'directory';
            const isHighlighted = item.path === highlightPath && !isSelected;

            return (
              <tr
                key={item.id}
                data-path={item.path}
                className={`file-row ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
              >
                <td
                  className="file-row-main"
                  onClick={() => {
                    onSelectItem(idx);
                    if (isDir) {
                      onOpenDirectory(item.path, idx);
                    } else {
                      onOpenFile(item, idx);
                    }
                  }}
                >
                  <div className="file-name-cell">
                    {isDir ? (
                      <Folder size={18} className="icon-folder" />
                    ) : (
                      <FileText size={18} className="icon-file" />
                    )}
                    <span className="file-name-text">{item.name}</span>
                  </div>
                </td>
                <td className="cell-muted col-size">
                  {item.size !== undefined ? formatBytes(item.size) : (item.childrenCount ? `${item.childrenCount} items` : '-')}
                </td>
                <td className="cell-muted col-type">{isDir ? 'Directory' : (item.mimeType || 'File')}</td>
                <td className="cell-muted col-modified">
                  {item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString('ja-JP') : '-'}
                </td>
                <td
                  className="file-row-select"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(item.path);
                  }}
                >
                  <div className={`file-select-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={14} />}
                  </div>
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
