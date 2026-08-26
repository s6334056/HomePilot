import React, { useState, useEffect, useCallback } from 'react';
import { X, Globe, Folder, Cpu, Loader2, RefreshCw } from 'lucide-react';
import { AgentSettings, OpenCodeProject, OpenCodeProviderModel } from '../domain/types';
import { SessionService } from '../services/SessionService';
import { OpenCodeClient } from '../services/OpenCodeClient';

const OPENCODE_URL_KEY = 'homepilot-opencode-url';
const DEFAULT_OPENCODE_URL = 'http://localhost:4096';

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionService: SessionService;
  onOpenCodeUrlChange?: (url: string) => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  sessionService,
  onOpenCodeUrlChange,
}) => {
  const [settings, setSettings] = useState<AgentSettings>(() => sessionService.getSettings());
  const [openCodeUrl, setOpenCodeUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(OPENCODE_URL_KEY) || DEFAULT_OPENCODE_URL;
    } catch {
      return DEFAULT_OPENCODE_URL;
    }
  });

  const [projects, setProjects] = useState<OpenCodeProject[]>([]);
  const [models, setModels] = useState<OpenCodeProviderModel[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [errorProjects, setErrorProjects] = useState<string | null>(null);
  const [errorModels, setErrorModels] = useState<string | null>(null);

  const fetchData = useCallback(async (url: string) => {
    const client = new OpenCodeClient({ baseUrl: url });

    setIsLoadingProjects(true);
    setErrorProjects(null);
    try {
      const fetchedProjects = await client.getProjects();
      setProjects(fetchedProjects);
    } catch (e: unknown) {
      setErrorProjects(e instanceof Error ? e.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }

    setIsLoadingModels(true);
    setErrorModels(null);
    try {
      const providers = await client.getProviders();
      const freeModels = client.extractFreeModels(providers);
      setModels(freeModels);
    } catch (e: unknown) {
      setErrorModels(e instanceof Error ? e.message : 'Failed to load models');
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSettings(sessionService.getSettings());
      try {
        setOpenCodeUrl(localStorage.getItem(OPENCODE_URL_KEY) || DEFAULT_OPENCODE_URL);
      } catch {
        setOpenCodeUrl(DEFAULT_OPENCODE_URL);
      }
      fetchData(openCodeUrl);
    }
  }, [isOpen, sessionService, openCodeUrl, fetchData]);

  const handleSelectProject = (projectID: string) => {
    const updated = { ...settings, selectedProjectID: projectID };
    setSettings(updated);
    sessionService.updateSettings({ selectedProjectID: projectID });
  };

  const handleSelectModel = (providerID: string, modelID: string) => {
    const updated = { ...settings, selectedProviderID: providerID, selectedModelID: modelID };
    setSettings(updated);
    sessionService.updateSettings({ selectedProviderID: providerID, selectedModelID: modelID });
  };

  const handleOpenCodeUrlChange = (url: string) => {
    setOpenCodeUrl(url);
    try {
      localStorage.setItem(OPENCODE_URL_KEY, url);
    } catch {
      // localStorage unavailable
    }
    if (onOpenCodeUrlChange) {
      onOpenCodeUrlChange(url);
    }
  };

  const handleRefresh = () => {
    fetchData(openCodeUrl);
  };

  if (!isOpen) return null;

  const getProjectDisplayName = (project: OpenCodeProject): string => {
    const worktree = project.worktree || '';
    const parts = worktree.split(/[/\\]/).filter(Boolean);
    const folderName = parts[parts.length - 1] || worktree || project.id;
    if (project.id === 'global') {
      return `global/${folderName}`;
    }
    return folderName;
  };

  const getModelDisplayName = (model: OpenCodeProviderModel): string => {
    return model.name || model.modelID;
  };

  const selectedProject = projects.find((p) => p.id === settings.selectedProjectID);
  const selectedModel = models.find(
    (m) => m.providerID === settings.selectedProviderID && m.modelID === settings.selectedModelID
  );

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
            <h3>OpenCode Server</h3>
            <div className="settings-input-group">
              <label className="settings-label">
                <Globe size={14} />
                <span>Server URL</span>
              </label>
              <input
                type="text"
                className="settings-input"
                value={openCodeUrl}
                onChange={(e) => handleOpenCodeUrlChange(e.target.value)}
                placeholder="http://localhost:4096"
              />
              <p className="settings-hint">
                URL of the OpenCode Server (default: http://localhost:4096)
              </p>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <h3>Project</h3>
              <button
                className="settings-refresh-btn"
                onClick={handleRefresh}
                disabled={isLoadingProjects}
                title="Refresh projects"
              >
                <RefreshCw size={12} className={isLoadingProjects ? 'oc-spinning' : ''} />
              </button>
            </div>
            {errorProjects && (
              <p className="settings-error">{errorProjects}</p>
            )}
            <select
              className="settings-select"
              value={settings.selectedProjectID}
              onChange={(e) => handleSelectProject(e.target.value)}
              disabled={isLoadingProjects || projects.length === 0}
            >
              {projects.length === 0 && !isLoadingProjects && (
                <option value="">No projects available</option>
              )}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {getProjectDisplayName(project)}
                </option>
              ))}
            </select>
            {selectedProject && (
              <p className="settings-hint">
                <Folder size={10} /> {selectedProject.worktree}
              </p>
            )}
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <h3>Model</h3>
              <button
                className="settings-refresh-btn"
                onClick={handleRefresh}
                disabled={isLoadingModels}
                title="Refresh models"
              >
                <RefreshCw size={12} className={isLoadingModels ? 'oc-spinning' : ''} />
              </button>
            </div>
            {errorModels && (
              <p className="settings-error">{errorModels}</p>
            )}
            <select
              className="settings-select"
              value={`${settings.selectedProviderID}:${settings.selectedModelID}`}
              onChange={(e) => {
                const [providerID, modelID] = e.target.value.split(':');
                if (providerID && modelID) {
                  handleSelectModel(providerID, modelID);
                }
              }}
              disabled={isLoadingModels || models.length === 0}
            >
              {models.length === 0 && !isLoadingModels && (
                <option value="">No free models available</option>
              )}
              {models.map((model) => (
                <option key={`${model.providerID}:${model.modelID}`} value={`${model.providerID}:${model.modelID}`}>
                  {getModelDisplayName(model)}
                </option>
              ))}
            </select>
            {selectedModel && (
              <p className="settings-hint">
                <Cpu size={10} /> {selectedModel.providerID}/{selectedModel.modelID}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
