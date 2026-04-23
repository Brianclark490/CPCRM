import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { useApiClient } from '../../../lib/apiClient.js';
import { objectDefinitionsKeys } from '../../../lib/queryKeys.js';
import { slugify } from '../../../utils.js';
import { buildOptionsPayload, formFromField } from '../helpers.js';
import { EMPTY_FORM } from '../constants.js';
import type {
  FieldDefinition,
  FieldForm,
  ApiError,
  ObjectDefinitionDetail,
} from '../types.js';

interface UseFieldMutationsOptions {
  objectId: string | undefined;
  fields: FieldDefinition[];
}

export function useFieldMutations({
  objectId,
  fields,
}: UseFieldMutationsOptions) {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const objectDetailKey = objectDefinitionsKeys.detail(objectId ?? '');

  // ── Field modal state ───────────────────────────────────
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldForm>({ ...EMPTY_FORM });
  const [apiNameEdited, setApiNameEdited] = useState(false);
  const [fieldModalError, setFieldModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Delete field state ──────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<FieldDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Reorder state ───────────────────────────────────────
  const [reordering, setReordering] = useState(false);

  // ── Field modal handlers ────────────────────────────────

  const openAddFieldModal = () => {
    setEditingField(null);
    setFieldForm({ ...EMPTY_FORM });
    setApiNameEdited(false);
    setFieldModalError(null);
    setShowFieldModal(true);
  };

  const openEditFieldModal = (field: FieldDefinition) => {
    setEditingField(field);
    setFieldForm(formFromField(field));
    setApiNameEdited(true);
    setFieldModalError(null);
    setShowFieldModal(true);
  };

  const closeFieldModal = () => {
    setShowFieldModal(false);
    setFieldModalError(null);
  };

  const handleFieldFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setFieldForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === 'label' && !apiNameEdited) {
        next.apiName = slugify(value);
      }

      // Reset type-specific options when field_type changes
      if (name === 'fieldType') {
        next.choices = [''];
        next.min = '';
        next.max = '';
        next.precision = '';
        next.maxLength = '';
        next.expression = '';
        next.outputType = 'number';
      }

      return next;
    });

    if (name === 'apiName') {
      setApiNameEdited(true);
    }

    setFieldModalError(null);
  };

  const handleToggleRequired = () => {
    setFieldForm((prev) => ({ ...prev, required: !prev.required }));
  };

  // ── Choices handlers ────────────────────────────────────

  const handleChoiceChange = (index: number, value: string) => {
    setFieldForm((prev) => {
      const choices = [...prev.choices];
      choices[index] = value;
      return { ...prev, choices };
    });
  };

  const handleAddChoice = () => {
    setFieldForm((prev) => ({ ...prev, choices: [...prev.choices, ''] }));
  };

  const handleRemoveChoice = (index: number) => {
    setFieldForm((prev) => {
      const choices = prev.choices.filter((_, i) => i !== index);
      return { ...prev, choices: choices.length === 0 ? [''] : choices };
    });
  };

  // ── Submit field form ───────────────────────────────────

  const handleFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldModalError(null);

    if (!sessionToken || !objectId) {
      setFieldModalError('Session unavailable. Please refresh and try again.');
      return;
    }

    const trimmedLabel = fieldForm.label.trim();
    if (!trimmedLabel) {
      setFieldModalError('Label is required');
      return;
    }

    const trimmedApiName = fieldForm.apiName.trim();
    if (!trimmedApiName) {
      setFieldModalError('API name is required');
      return;
    }

    if (!fieldForm.fieldType) {
      setFieldModalError('Field type is required');
      return;
    }

    if (fieldForm.fieldType === 'dropdown' || fieldForm.fieldType === 'multi_select') {
      const validChoices = fieldForm.choices.map((c) => c.trim()).filter(Boolean);
      if (validChoices.length === 0) {
        setFieldModalError('At least one choice is required for this field type');
        return;
      }
    }

    if (fieldForm.fieldType === 'formula') {
      if (!fieldForm.expression.trim()) {
        setFieldModalError('Expression is required for formula fields');
        return;
      }
    }

    setSaving(true);

    const options = buildOptionsPayload(fieldForm);

    const payload: Record<string, unknown> = {
      label: trimmedLabel,
      description: fieldForm.description.trim() || undefined,
      required: fieldForm.required,
      defaultValue: fieldForm.defaultValue.trim() || undefined,
    };

    if (!editingField?.isSystem) {
      payload.fieldType = fieldForm.fieldType;
    }

    if (options) {
      payload.options = options;
    }

    try {
      if (editingField) {
        const response = await api.request(
          `/api/v1/admin/objects/${objectId}/fields/${editingField.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );

        if (response.ok) {
          setShowFieldModal(false);
          await queryClient.invalidateQueries({ queryKey: objectDetailKey });
        } else {
          const data = (await response.json()) as ApiError;
          setFieldModalError(data.error ?? 'An unexpected error occurred');
        }
      } else {
        payload.apiName = trimmedApiName;

        const response = await api.request(`/api/v1/admin/objects/${objectId}/fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          setShowFieldModal(false);
          await queryClient.invalidateQueries({ queryKey: objectDetailKey });
        } else {
          const data = (await response.json()) as ApiError;
          setFieldModalError(data.error ?? 'An unexpected error occurred');
        }
      }
    } catch {
      setFieldModalError('Failed to connect to the server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete field handlers ───────────────────────────────

  const openDeleteConfirm = (field: FieldDefinition) => {
    setDeleteTarget(field);
    setDeleteError(null);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !sessionToken || !objectId) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await api.request(
        `/api/v1/admin/objects/${objectId}/fields/${deleteTarget.id}`,
        { method: 'DELETE' },
      );

      if (response.ok || response.status === 204) {
        setDeleteTarget(null);
        await queryClient.invalidateQueries({ queryKey: objectDetailKey });
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteError(data.error ?? 'Failed to delete field');
      }
    } catch {
      setDeleteError('Failed to connect to the server. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Reorder handler ─────────────────────────────────────

  const handleMoveField = async (index: number, direction: 'up' | 'down') => {
    if (!sessionToken || !objectId) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= fields.length) return;

    const newFields = [...fields];
    [newFields[index], newFields[swapIndex]] = [newFields[swapIndex], newFields[index]];

    // Optimistically patch the cached object detail so the reorder is
    // reflected immediately — reverting on failure below.
    const previousDetail = queryClient.getQueryData<ObjectDefinitionDetail>(objectDetailKey);
    queryClient.setQueryData<ObjectDefinitionDetail>(objectDetailKey, (prev) =>
      prev ? { ...prev, fields: newFields } : prev,
    );

    setReordering(true);
    try {
      const response = await api.request(`/api/v1/admin/objects/${objectId}/fields/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldIds: newFields.map((f) => f.id) }),
      });

      if (response.ok) {
        const updated = (await response.json()) as FieldDefinition[];
        queryClient.setQueryData<ObjectDefinitionDetail>(objectDetailKey, (prev) =>
          prev ? { ...prev, fields: updated } : prev,
        );
      } else if (previousDetail) {
        queryClient.setQueryData(objectDetailKey, previousDetail);
      }
    } catch {
      if (previousDetail) {
        queryClient.setQueryData(objectDetailKey, previousDetail);
      }
    } finally {
      setReordering(false);
    }
  };

  return {
    // Field modal
    showFieldModal,
    editingField,
    fieldForm,
    fieldModalError,
    saving,
    openAddFieldModal,
    openEditFieldModal,
    closeFieldModal,
    handleFieldFormChange,
    handleToggleRequired,
    handleChoiceChange,
    handleAddChoice,
    handleRemoveChoice,
    handleFieldSubmit,
    // Field delete
    deleteTarget,
    deleting,
    deleteError,
    openDeleteConfirm,
    closeDeleteConfirm,
    handleDelete,
    // Reorder
    reordering,
    handleMoveField,
  };
}
