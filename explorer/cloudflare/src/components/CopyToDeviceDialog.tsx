import React from 'react';

interface CopyToDeviceDialogProps {
  isOpen: boolean;
  /** Names of the files that already exist on this device. */
  conflictingNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
  isCopying?: boolean;
}

export const CopyToDeviceDialog: React.FC<CopyToDeviceDialogProps> = ({
  isOpen,
  conflictingNames,
  onConfirm,
  onCancel,
  isCopying,
}) => {
  if (!isOpen) return null;

  return (
    <div className="hp-dialog-overlay" onClick={isCopying ? undefined : onCancel}>
      <div className="hp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="hp-dialog-header">
          <span className="hp-dialog-title">この端末へコピー</span>
        </div>
        <div className="hp-dialog-body">
          <p className="hp-dialog-message">この端末に同名ファイルがあります。上書きしますか？</p>
          <ul className="hp-dialog-file-list">
            {conflictingNames.map((name, idx) => (
              <li key={`${name}-${idx}`} title={name}>{name}</li>
            ))}
          </ul>
          <p className="hp-dialog-message hp-dialog-message-warning">
            ※ 上書きすると、この端末の内容は置き換えられます。
          </p>
        </div>
        <div className="hp-dialog-actions">
          <button className="hp-dialog-btn" onClick={onCancel} disabled={isCopying}>
            キャンセル
          </button>
          <button
            className="hp-dialog-btn hp-dialog-btn-primary"
            onClick={onConfirm}
            disabled={isCopying}
          >
            {isCopying ? 'コピー中...' : '上書きしてコピー'}
          </button>
        </div>
      </div>
    </div>
  );
};
