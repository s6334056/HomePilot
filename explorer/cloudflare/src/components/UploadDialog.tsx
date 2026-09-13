import React, { useState, useRef, useCallback } from 'react';
import { FileText, Folder, X } from 'lucide-react';
import { FileSystemService, UploadItem } from '../services/FileSystemService';

interface UploadDialogProps {
  isOpen: boolean;
  fileService: FileSystemService;
  currentPath: string;
  onComplete: () => void;
  onCancel: () => void;
}

interface QueuedFile {
  id: string;
  file: File;
  relativePath: string;
}

let nextId = 0;
function genId(): string {
  return `up_${++nextId}_${Date.now()}`;
}

export const UploadDialog: React.FC<UploadDialogProps> = ({
  isOpen,
  fileService,
  currentPath,
  onComplete,
  onCancel,
}) => {
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = useCallback((fileList: FileList | null, isFolder: boolean) => {
    if (!fileList) return;
    const newItems: QueuedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const relPath = isFolder ? (f as any).webkitRelativePath || f.name : f.name;
      newItems.push({ id: genId(), file: f, relativePath: relPath });
    }
    setQueuedFiles((prev) => [...prev, ...newItems]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleUpload = useCallback(async () => {
    if (queuedFiles.length === 0) return;
    setIsUploading(true);
    setProgress(0);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;

    const items: UploadItem[] = queuedFiles.map((q) => ({
      file: q.file,
      relativePath: q.relativePath,
    }));

    try {
      await fileService.uploadItems(
        currentPath,
        items,
        (loaded, total) => {
          if (total > 0) setProgress(Math.round((loaded / total) * 100));
        },
        controller.signal,
      );
      setQueuedFiles([]);
      onComplete();
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('アップロードがキャンセルされました。');
      } else {
        setError(e.message || 'アップロードに失敗しました。');
      }
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  }, [queuedFiles, fileService, currentPath, onComplete]);

  const handleCancel = useCallback(() => {
    if (isUploading) {
      abortRef.current?.abort();
      return;
    }
    setQueuedFiles([]);
    setError('');
    onCancel();
  }, [isUploading, onCancel]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files, false);
    e.target.value = '';
  }, [addFiles]);

  const handleFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files, true);
    e.target.value = '';
  }, [addFiles]);

  if (!isOpen) return null;

  return (
    <div className="hp-dialog-overlay" onClick={isUploading ? undefined : handleCancel}>
      <div className="hp-dialog hp-dialog--upload" onClick={(e) => e.stopPropagation()}>
        <div className="hp-dialog-header">
          <span className="hp-dialog-title">アップロード</span>
        </div>
        <div className="hp-dialog-body">
          {!isUploading && (
            <div className="upload-actions">
              <button
                className="hp-dialog-btn upload-add-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                ファイルを追加
              </button>
              <button
                className="hp-dialog-btn upload-add-btn"
                onClick={() => folderInputRef.current?.click()}
              >
                フォルダを追加
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <input
                ref={folderInputRef}
                type="file"
                /* @ts-ignore */
                webkitdirectory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFolderChange}
              />
            </div>
          )}

          {isUploading && (
            <div className="upload-progress">
              <p className="upload-progress-text">アップロード中... {progress}%</p>
              <div className="upload-progress-bar">
                <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {!isUploading && queuedFiles.length > 0 && (
            <>
              <div className="upload-file-list">
                {queuedFiles.map((qf) => (
                  <div key={qf.id} className="upload-file-item">
                    <div className="upload-file-icon">
                      {qf.file.webkitRelativePath && qf.file.webkitRelativePath.includes('/') ? (
                        <Folder size={14} className="icon-folder" />
                      ) : (
                        <FileText size={14} className="icon-file" />
                      )}
                    </div>
                    <span className="upload-file-name">{qf.relativePath}</span>
                    <button
                      className="upload-file-remove"
                      onClick={() => removeFile(qf.id)}
                      title="削除"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="upload-summary">合計 {queuedFiles.length} ファイル</div>
            </>
          )}

          {!isUploading && queuedFiles.length === 0 && (
            <div className="upload-empty">
              ファイルまたはフォルダを選択してください
            </div>
          )}

          {error && <div className="hp-dialog-error">{error}</div>}
        </div>
        <div className="hp-dialog-actions">
          <button className="hp-dialog-btn" onClick={handleCancel} disabled={false}>
            {isUploading ? 'キャンセル' : '閉じる'}
          </button>
          {!isUploading && (
            <button
              className="hp-dialog-btn hp-dialog-btn-primary"
              disabled={queuedFiles.length === 0}
              onClick={handleUpload}
            >
              アップロード
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
