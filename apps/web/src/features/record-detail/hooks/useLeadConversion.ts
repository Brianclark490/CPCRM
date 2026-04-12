import { useState } from 'react';
import { useApiClient } from '../../../lib/apiClient.js';
import type { RecordDetail } from '../types.js';

interface ConvertOptions {
  create_account: boolean;
  account_id: string | null;
  create_opportunity: boolean;
}

interface UseLeadConversionResult {
  showConvertModal: boolean;
  converting: boolean;
  convertError: string | null;
  openConvertModal: () => void;
  closeConvertModal: () => void;
  handleConvert: (options: ConvertOptions) => Promise<void>;
}

export function useLeadConversion(
  record: RecordDetail | null,
  navigate: (path: string) => void,
): UseLeadConversionResult {
  const api = useApiClient();

  const [showConvertModal, setShowConvertModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const openConvertModal = () => {
    setConvertError(null);
    setShowConvertModal(true);
  };

  const closeConvertModal = () => {
    setShowConvertModal(false);
  };

  const handleConvert = async (options: ConvertOptions) => {
    if (!record) return;

    setConverting(true);
    setConvertError(null);

    try {
      const response = await api.request(
        `/api/objects/lead/records/${record.id}/convert`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(options),
        },
      );

      if (response.ok) {
        const result = (await response.json()) as {
          account: { id: string; name: string };
          contact: { id: string; name: string };
          opportunity: { id: string; name: string } | null;
        };
        setShowConvertModal(false);
        void navigate(`/objects/account/${result.account.id}`);
      } else {
        const data = (await response.json()) as { error?: string };
        setConvertError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setConvertError('Failed to connect to the server. Please try again.');
    } finally {
      setConverting(false);
    }
  };

  return {
    showConvertModal,
    converting,
    convertError,
    openConvertModal,
    closeConvertModal,
    handleConvert,
  };
}
