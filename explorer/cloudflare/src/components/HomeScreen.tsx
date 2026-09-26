import React from 'react';
import { House, HardDrive, Monitor, FlaskConical, Settings } from 'lucide-react';
import {
  FileSystemMode,
  FILE_SYSTEM_LABELS,
  shouldShowMockOption,
} from '../services/FileSystemSelection';

interface HomeOption {
  mode: FileSystemMode;
  icon: React.ReactNode;
  description: string;
}

interface HomeScreenProps {
  onSelect: (mode: FileSystemMode) => void;
  onOpenSettings: () => void;
  error?: string | null;
  isConnecting?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelect,
  onOpenSettings,
  error,
  isConnecting,
}) => {
  const options: HomeOption[] = [
    {
      mode: 'local',
      icon: <HardDrive size={24} />,
      description: 'このPWAに保存されたファイルを表示します。ネットワーク接続は不要です。',
    },
    {
      mode: 'gateway',
      icon: <Monitor size={24} />,
      description: 'ホームネットワーク上の自宅PC（Gateway）に接続します。',
    },
  ];

  if (shouldShowMockOption()) {
    options.push({
      mode: 'mock',
      icon: <FlaskConical size={24} />,
      description: 'サンプルデータを表示する開発用モックです。',
    });
  }

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="brand-group">
          <House size={18} />
          <span className="brand-title">HomePilot</span>
        </div>
        <button className="btn-icon" onClick={onOpenSettings} title="Settings">
          <Settings size={18} />
        </button>
      </header>

      <main className="home-body">
        <h1 className="home-title">ファイルを表示する場所を選択してください</h1>

        <div className="home-options">
          {options.map((option) => (
            <button
              key={option.mode}
              className="home-option"
              onClick={() => onSelect(option.mode)}
              disabled={isConnecting}
            >
              <span className="home-option-icon">{option.icon}</span>
              <span className="home-option-label">{FILE_SYSTEM_LABELS[option.mode]}</span>
              <span className="home-option-description">{option.description}</span>
            </button>
          ))}
        </div>

        {error && <div className="home-error">{error}</div>}
      </main>
    </div>
  );
};
