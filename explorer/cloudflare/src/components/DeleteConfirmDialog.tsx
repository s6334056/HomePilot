import React from 'react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  count: number;
  hasFolders: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  count,
  hasFolders,
  onConfirm,
  onCancel,
  isDeleting,
}) => {
  if (!isOpen) return null;

  return (
    <div className="hp-dialog-overlay" onClick={isDeleting ? undefined : onCancel}>
      <div className="hp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="hp-dialog-header">
          <span className="hp-dialog-title">アイテムを削除</span>
        </div>
        <div className="hp-dialog-body">
          <p className="hp-dialog-message">選択した{count}件を削除しますか？</p>
          {hasFolders && (
            <p className="hp-dialog-message hp-dialog-message-warning">
              ※ フォルダを削除すると、その中のファイル・サブフォルダもすべて削除されます。
            </p>
          )}
        </div>
        <div className="hp-dialog-actions">
          <button className="hp-dialog-btn" onClick={onCancel} disabled={isDeleting}>キャンセル</button>
          <button
            className="hp-dialog-btn hp-dialog-btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
