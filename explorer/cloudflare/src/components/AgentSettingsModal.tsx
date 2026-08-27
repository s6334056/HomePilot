import React, { useState, useEffect, useCallback } from 'react';
import { X, Cpu, Loader2, RefreshCw } from 'lucide-react';
import { AgentSettings, OpenCodeProviderModel } from '../domain/types';
import { SessionService } from '../services/SessionService';
import { OpenCodeClient } from '../services/OpenCodeClient';

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionService: SessionService;
  gatewayUrl: string;
  gatewayToken: string;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  sessionService,
  gatewayUrl,
  gatewayToken,
}) => {
  const [settings, setSettings] = useState<AgentSettings>(() => sessionService.getSettings());
  const [models, setModels] = useState<OpenCodeProviderModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [errorModels, setErrorModels] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!gatewayUrl || !gatewayToken) {
      setErrorModels('Gateway not connected');
      return;
    }

    const client = new OpenCodeClient({ gatewayUrl, gatewayToken });

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
  }, [gatewayUrl, gatewayToken]);

  useEffect(() => {
    if (isOpen) {
      setSettings(sessionService.getSettings());
      fetchData();
    }
  }, [isOpen, sessionService, fetchData]);

  const handleSelectModel = (providerID: string, modelID: string) => {
    const updated = { ...settings, selectedProviderID: providerID, selectedModelID: modelID };
    setSettings(updated);
    sessionService.updateSettings({ selectedProviderID: providerID, selectedModelID: modelID });
  };

  const handleRefresh = () => {
    fetchData();
  };

  if (!isOpen) return null;

  const getModelDisplayName = (model: OpenCodeProviderModel): string => {
    return model.name || model.modelID;
  };

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
