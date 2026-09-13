import React, { useState, useEffect, useRef } from 'react';

interface CreateFolderDialogProps {
  isOpen: boolean;
  currentPath: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  error?: string;
  isCreating?: boolean;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  isOpen,
  currentPath: _currentPath,
  onConfirm,
  onCancel,
  error,
  isCreating,
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && trimmed !== '.' && trimmed !== '..' && !/[\/\\]/.test(trimmed);

  return (
    <div className="hp-dialog-overlay" onClick={isCreating ? undefined : onCancel}>
      <div className="hp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="hp-dialog-header">
          <span className="hp-dialog-title">フォルダを作成</span>
        </div>
        <div className="hp-dialog-body">
          <input
            ref={inputRef}
            className="hp-dialog-input"
            type="text"
            placeholder="フォルダ名"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid && !isCreating) {
                onConfirm(trimmed);
              } else if (e.key === 'Escape' && !isCreating) {
                onCancel();
              }
            }}
            disabled={isCreating}
          />
          {error && <div className="hp-dialog-error">{error}</div>}
        </div>
        <div className="hp-dialog-actions">
          <button className="hp-dialog-btn" onClick={onCancel} disabled={isCreating}>キャンセル</button>
          <button
            className="hp-dialog-btn hp-dialog-btn-primary"
            disabled={!isValid || isCreating}
            onClick={() => onConfirm(trimmed)}
          >
            {isCreating ? '作成中...' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
};
