import React, { useCallback, useEffect, useState } from 'react';
import { Clock, FileText, Check } from 'lucide-react';
import { FileViewHistoryEntry } from '../domain/types';
import { getHistory, removeFromHistory, checkHistoryFilesExist } from '../services/ViewerHistoryStore';
import { GatewayFileSystemService } from '../services/GatewayFileSystemService';
import { ContextActionMenu, ContextActionMenuItem } from './ContextActionMenu';

interface HistoryPageProps {
  gatewayService: GatewayFileSystemService;
  onSelectFile: (path: string) => void;
  onActionMenuReady?: (handler: (event: React.MouseEvent) => void) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  gatewayService,
  onSelectFile,
  onActionMenuReady,
}) => {
  const [history, setHistory] = useState<FileViewHistoryEntry[]>([]);
  const [existenceMap, setExistenceMap] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [actionMenuTriggerRect, setActionMenuTriggerRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const entries = await getHistory(gatewayService);
    setHistory(entries);
    // Check file existence
    const existence = await checkHistoryFilesExist(gatewayService, entries);
    setExistenceMap(existence);
    setLoading(false);
  };

  const handleToggleSelect = (path: string) => {
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleRemoveSelected = async () => {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0 || isRemoving) return;
    setIsRemoving(true);
    try {
      for (const path of paths) {
        await removeFromHistory(gatewayService, path);
      }
      setSelectedPaths(new Set());
      await loadHistory();
    } finally {
      setIsRemoving(false);
    }
  };

  const handleOpenActionMenu = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setActionMenuTriggerRect((event.currentTarget as HTMLElement).getBoundingClientRect());
    setShowActionMenu(true);
  }, []);

  const handleCloseActionMenu = useCallback(() => {
    setShowActionMenu(false);
    setActionMenuTriggerRect(null);
  }, []);

  useEffect(() => {
    onActionMenuReady?.(handleOpenActionMenu);
    return () => onActionMenuReady?.(() => {});
  }, [handleOpenActionMenu, onActionMenuReady]);

  const actionMenuItems: ContextActionMenuItem[] = [
    {
      label: '履歴削除',
      disabled: selectedPaths.size === 0 || isRemoving,
      onClick: handleRemoveSelected,
    },
  ];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="empty-state">
        <Clock size={40} className="icon-muted" />
        <p>Loading history...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="empty-state">
        <Clock size={40} className="icon-muted" />
        <p>(No viewing history)</p>
      </div>
    );
  }

  return (
    <div className="file-table-card">
      <table className="file-table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="col-type" style={{ width: '130px' }}>Status</th>
            <th className="col-modified" style={{ width: '160px' }}>Last Viewed</th>
            <th className="col-select"></th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => {
            const exists = existenceMap.get(entry.path);
            const isUnknown = !existenceMap.has(entry.path);
            const fileName = entry.path.split(/[\/\\]/).pop() || entry.path;
            const isSelected = selectedPaths.has(entry.path);

            return (
              <tr
                key={entry.path}
                className={`file-row ${exists === false ? 'file-deleted' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  if (exists !== false) {
                    onSelectFile(entry.path);
                  }
                }}
              >
                <td className="file-row-main">
                  <div className="file-name-cell">
                    <FileText size={18} className="icon-file" />
                    <span className="file-name-text">{fileName}</span>
                    {exists === false && (
                      <span className="focus-pill" style={{ backgroundColor: '#da3633' }}>
                        Deleted
                      </span>
                    )}
                    {isUnknown && (
                      <span className="focus-pill" style={{ backgroundColor: '#d29922' }}>
                        Checking...
                      </span>
                    )}
                  </div>
                </td>
                <td className="cell-muted col-type">
                  {exists === false ? 'Not found' : exists ? 'Available' : '...'}
                </td>
                <td className="cell-muted col-modified">
                  {formatDate(entry.lastViewedAt)}
                </td>
                <td className="file-row-select">
                  <div
                    className={`file-select-checkbox ${isSelected ? 'checked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(entry.path);
                    }}
                  >
                    {isSelected && <Check size={14} />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ContextActionMenu
        isOpen={showActionMenu}
        items={actionMenuItems}
        onClose={handleCloseActionMenu}
        triggerRect={actionMenuTriggerRect}
      />
    </div>
  );
};
