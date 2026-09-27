import React from 'react';
import {
  formatUsageValue,
  StorageUsageInfo,
} from '../services/StorageUsage';

interface StorageSectionProps {
  /** SettingsModal が開いた時点で取得した値。 */
  info: StorageUsageInfo | null;
}

/**
 * 設定画面の「ストレージ」セクション。
 *
 * A (アプリローカル保存データ) / B (ファイル内容合計) / C (ブラウザ概算の usage) を
 * 表示する。残容量・上限・警告閾値は表示しない。
 */
export const StorageSection: React.FC<StorageSectionProps> = ({ info }) => (
  <section className="settings-section">
    <h3>ストレージ</h3>

    <div className="connection-info storage-info">
      <div className="info-row">
        <span className="info-label">アプリローカル保存データ</span>
        <span className="info-value">
          {info ? formatUsageValue(info.fileSystemBytes) : '取得中...'}
        </span>
        <span className="settings-description">
          Local FileSystem の保存データ（homepilot.localFileSystem）そのもののサイズ
        </span>
      </div>

      <div className="info-row">
        <span className="info-label">保存しているファイルの内容合計</span>
        <span className="info-value">
          {info ? formatUsageValue(info.fileContentBytes) : '取得中...'}
        </span>
        <span className="settings-description">
          Local FileSystem 内のファイルの内容の合計（フォルダは含みません）
        </span>
      </div>

      <div className="info-row">
        <span className="info-label">このサイトのストレージ使用量（ブラウザ概算）</span>
        <span className="info-value">
          {info ? formatUsageValue(info.siteUsageBytes) : '取得中...'}
        </span>
        <span className="settings-description">
          ブラウザが報告するサイト全体の使用量の概算値です。HomePilot固有の容量ではありません。
        </span>
      </div>
    </div>
  </section>
);
