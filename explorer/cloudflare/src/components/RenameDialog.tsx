import React, { useState, useEffect, useRef } from 'react';

interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
  error?: string;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  currentName,
  onConfirm,
  onCancel,
  error,
}) => {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(currentName);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && trimmed !== '.' && trimmed !== '..' && !/[\/\\]/.test(trimmed);
  const hasChanged = trimmed !== currentName;

  return (
    <div className="hp-dialog-overlay" onClick={onCancel}>
      <div className="hp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="hp-dialog-header">
          <span className="hp-dialog-title">名前を変更</span>
        </div>
        <div className="hp-dialog-body">
          <input
            ref={inputRef}
            className="hp-dialog-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid && hasChanged) {
                onConfirm(trimmed);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
          />
          {error && <div className="hp-dialog-error">{error}</div>}
        </div>
        <div className="hp-dialog-actions">
          <button className="hp-dialog-btn" onClick={onCancel}>キャンセル</button>
          <button
            className="hp-dialog-btn hp-dialog-btn-primary"
            disabled={!isValid || !hasChanged}
            onClick={() => onConfirm(trimmed)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
