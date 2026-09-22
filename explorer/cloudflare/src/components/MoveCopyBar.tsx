import React from 'react';

export type MoveCopyMode = 'move' | 'copy';

interface MoveCopyBarProps {
  mode: MoveCopyMode;
  count: number;
  sourceNames: string[];
  destPath: string;
  /** Destination is a source folder / its subtree → confirm is disabled. */
  destBlocked?: boolean;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const verbOf = (mode: MoveCopyMode) => (mode === 'move' ? '移動' : '複製');

export const MoveCopyBar: React.FC<MoveCopyBarProps> = ({
  mode,
  count,
  sourceNames,
  destPath,
  destBlocked,
  isBusy,
  onCancel,
  onConfirm,
}) => {
  const verb = verbOf(mode);
  const preview =
    sourceNames.length <= 2
      ? sourceNames.join(', ')
      : `${sourceNames.slice(0, 2).join(', ')} 他${sourceNames.length - 2}件`;

  return (
    <div className="hp-movecopy-bar">
      <div className="hp-movecopy-info">
        <div className="hp-movecopy-title">
          {count}件を{verb}先を選択中
        </div>
        <div className="hp-movecopy-sources" title={sourceNames.join('\n')}>
          {preview}
        </div>
        <div className="hp-movecopy-dest" title={destPath}>
          {verb}先: {destPath}
        </div>
      </div>
      <div className="hp-movecopy-actions">
        <button className="hp-dialog-btn" onClick={onCancel} disabled={isBusy}>
          キャンセル
        </button>
        <button
          className="hp-dialog-btn primary"
          onClick={onConfirm}
          disabled={isBusy || destBlocked}
          title={
            destBlocked
              ? 'フォルダ自身またはその配下へは移動・複製できません。'
              : undefined
          }
        >
          {destBlocked ? '移動先が不正です' : mode === 'move' ? '移動' : '複製'}
        </button>
      </div>
    </div>
  );
};
