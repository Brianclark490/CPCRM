import { useState } from 'react';
import { useApiClient } from '../../../lib/apiClient.js';
import type { RecordDetail } from '../types.js';

interface UseRecordDeleteResult {
  showDeleteConfirm: boolean;
  deleting: boolean;
  handleDeleteClick: () => void;
  handleDeleteConfirm: () => Promise<void>;
  handleDeleteCancel: () => void;
}

export function useRecordDelete(
  record: RecordDetail | null,
  apiName: string | undefined,
  navigate: (path: string) => void,
  onError: (error: string) => void,
): UseRecordDeleteResult {
  const api = useApiClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!record) return;

    setDeleting(true);

    try {
      const response = await api.request(
        `/api/v1/objects/${apiName}/records/${record.id}`,
        {
          method: 'DELETE',
        },
      );

      if (response.ok || response.status === 204) {
        void navigate(`/objects/${apiName}`);
      } else {
        onError('Failed to delete record.');
        setShowDeleteConfirm(false);
      }
    } catch {
      onError('Failed to connect to the server. Please try again.');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return {
    showDeleteConfirm,
    deleting,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
  };
}
