import { useState } from 'react';
import { useApiClient } from '../../../lib/apiClient.js';
import type { RecordDetail, LayoutSection } from '../types.js';

interface UseRecordEditResult {
  editing: boolean;
  formValues: Record<string, unknown>;
  submitting: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  setSaveError: (error: string | null) => void;
  handleEditClick: () => void;
  handleCancelClick: () => void;
  handleFieldChange: (fieldApiName: string, value: unknown) => void;
  handleSave: (e: React.FormEvent) => Promise<void>;
}

export function useRecordEdit(
  record: RecordDetail | null,
  layoutSections: LayoutSection[] | null,
  apiName: string | undefined,
  loadRecord: () => Promise<void>,
): UseRecordEditResult {
  const api = useApiClient();

  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleEditClick = () => {
    if (!record) return;
    setFormValues({ ...record.fieldValues });
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  };

  const handleCancelClick = () => {
    setEditing(false);
    setSaveError(null);
    setSaveSuccess(false);
    setFormValues({});
  };

  const handleFieldChange = (fieldApiName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldApiName]: value }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;

    // Collect pipeline-managed field api_names so we can skip them
    const pipelineManagedFields = new Set<string>();
    if (layoutSections) {
      for (const section of layoutSections) {
        for (const field of section.fields) {
          if (field.fieldOptions?.pipeline_managed === true) {
            pipelineManagedFields.add(field.fieldApiName);
          }
        }
      }
    }
    // Also check record field options (covers page-layout and fallback paths)
    for (const field of record.fields) {
      if (field.options?.pipeline_managed === true) {
        pipelineManagedFields.add(field.apiName);
      }
    }

    // Client-side required field validation
    if (layoutSections) {
      for (const section of layoutSections) {
        for (const field of section.fields) {
          if (field.fieldRequired && field.fieldType !== 'formula' && !pipelineManagedFields.has(field.fieldApiName)) {
            const val = formValues[field.fieldApiName];
            if (val === undefined || val === null || val === '') {
              setSaveError(`Field '${field.fieldLabel}' is required`);
              return;
            }
          }
        }
      }
    }

    setSubmitting(true);
    setSaveError(null);
    setSaveSuccess(false);

    // Exclude pipeline-managed fields from the save payload
    const saveValues = { ...formValues };
    for (const fieldName of pipelineManagedFields) {
      delete saveValues[fieldName];
    }

    try {
      const response = await api.request(
        `/api/v1/objects/${apiName}/records/${record.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fieldValues: saveValues }),
        },
      );

      if (response.ok) {
        setEditing(false);
        setFormValues({});
        setSaveSuccess(true);
        void loadRecord();
      } else {
        const data = (await response.json()) as { error?: string };
        setSaveError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setSaveError('Failed to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    editing,
    formValues,
    submitting,
    saveError,
    saveSuccess,
    setSaveError,
    handleEditClick,
    handleCancelClick,
    handleFieldChange,
    handleSave,
  };
}
