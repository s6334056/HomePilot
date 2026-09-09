import React, { useEffect, useState } from 'react';
import { Clock, FileText, Trash2, AlertCircle } from 'lucide-react';
import { FileViewHistoryEntry } from '../domain/types';
import { getHistory, removeFromHistory, checkHistoryFilesExist } from '../services/ViewerHistoryStore';
import { GatewayFileSystemService } from '../services/GatewayFileSystemService';

interface HistoryPageProps {
  gatewayService: GatewayFileSystemService;
  onSelectFile: (path: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  gatewayService,
  onSelectFile,
}) => {
  const [history, setHistory] = useState<FileViewHistoryEntry[]>([]);
  const [existenceMap, setExistenceMap] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);

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

  const handleRemove = async (path: string) => {
    await removeFromHistory(gatewayService, path);
    await loadHistory();
  };

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
            <th style={{ width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => {
            const exists = existenceMap.get(entry.path);
            const isUnknown = !existenceMap.has(entry.path);
            const fileName = entry.path.split(/[\/\\]/).pop() || entry.path;

            return (
              <tr
                key={entry.path}
                className={`file-row ${exists === false ? 'file-deleted' : ''}`}
                onClick={() => {
                  if (exists !== false) {
                    onSelectFile(entry.path);
                  }
                }}
              >
                <td>
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
                <td>
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(entry.path);
                    }}
                    title="Remove from history"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
