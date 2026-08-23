import React, { useState, useEffect } from 'react';
import { X, Check, Folder, Cpu } from 'lucide-react';
import { AgentSettings } from '../domain/types';
import { SessionService } from '../services/SessionService';

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionService: SessionService;
}

const AVAILABLE_PROJECTS = ['HomePilot', 'Other Project'];
const AVAILABLE_MODELS = ['Big Pickle', 'MiMo V2.5 Free', 'Muse Spark 1.2 Free'];

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  sessionService,
}) => {
  const [settings, setSettings] = useState<AgentSettings>(() => sessionService.getSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(sessionService.getSettings());
    }
  }, [isOpen, sessionService]);

  const handleSelectProject = (project: string) => {
    const updated = { ...settings, selectedProject: project };
    setSettings(updated);
    sessionService.updateSettings({ selectedProject: project });
  };

  const handleSelectModel = (model: string) => {
    const updated = { ...settings, selectedModel: model };
    setSettings(updated);
    sessionService.updateSettings({ selectedModel: model });
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Agent Settings</h2>
          <button className="settings-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Project Select</h3>
            <div className="settings-select-list">
              {AVAILABLE_PROJECTS.map((project) => (
                <button
                  key={project}
                  className={`settings-select-item ${settings.selectedProject === project ? 'selected' : ''}`}
                  onClick={() => handleSelectProject(project)}
                >
                  <Folder size={14} />
                  <span>{project}</span>
                  {settings.selectedProject === project && (
                    <Check size={14} className="settings-check" />
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Model Select</h3>
            <div className="settings-select-list">
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model}
                  className={`settings-select-item ${settings.selectedModel === model ? 'selected' : ''}`}
                  onClick={() => handleSelectModel(model)}
                >
                  <Cpu size={14} />
                  <span>{model}</span>
                  {settings.selectedModel === model && (
                    <Check size={14} className="settings-check" />
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
