import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@descope/react-sdk';
import { ApiError as ApiClientError, useApiClient } from '../../../lib/apiClient.js';
import {
  fieldDefinitionsKeys,
  objectDefinitionsKeys,
} from '../../../lib/queryKeys.js';
import { slugify } from '../../../utils.js';
import { buildOptionsPayload, formFromField } from '../helpers.js';
import { EMPTY_FORM } from '../constants.js';
import type {
  FieldDefinition,
  FieldForm,
  ObjectDefinitionDetail,
} from '../types.js';

interface UseFieldMutationsOptions {
  objectId: string | undefined;
  fields: FieldDefinition[];
}

interface CreateFieldVars {
  objectId: string;
  payload: Record<string, unknown>;
}

interface UpdateFieldVars {
  objectId: string;
  fieldId: string;
  payload: Record<string, unknown>;
}

interface DeleteFieldVars {
  objectId: string;
  fieldId: string;
}

interface ReorderFieldsVars {
  objectId: string;
  fieldIds: string[];
}

interface ReorderContext {
  previous: ObjectDefinitionDetail | undefined;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) {
    // Surface the canonical "connection failed" copy for network-level
    // failures — `err.message` in that case is whatever the browser threw
    // (e.g. "Failed to fetch") and isn't user-friendly.
    if (err.isNetwork) {
      return 'Failed to connect to the server. Please try again.';
    }
    return err.message || fallback;
  }
  return fallback;
}

export function useFieldMutations({
  objectId,
  fields,
}: UseFieldMutationsOptions) {
  const { sessionToken } = useSession();
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Key invalidation is driven by the mutation variables (`vars.objectId`)
  // rather than the closed-over hook argument, so a route-param change
  // while a mutation is in-flight can't hit the wrong cache entry.
  const invalidateFieldLists = (targetObjectId: string) => {
    // The field list is currently served by `useFieldDefinitions`, which
    // reads from the object-detail endpoint. Invalidate both that key and
    // the dedicated `fieldDefinitions` namespace so any future hook
    // migrated onto the focused key picks up the change too.
    void queryClient.invalidateQueries({
      queryKey: objectDefinitionsKeys.detail(targetObjectId),
    });
    void queryClient.invalidateQueries({
      queryKey: fieldDefinitionsKeys.byObject(targetObjectId),
    });
  };

  // ── Field modal state ───────────────────────────────────
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldForm>({ ...EMPTY_FORM });
  const [apiNameEdited, setApiNameEdited] = useState(false);
  const [fieldModalError, setFieldModalError] = useState<string | null>(null);

  // ── Delete field state ──────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<FieldDefinition | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Mutations ───────────────────────────────────────────

  const createFieldMutation = useMutation<
    FieldDefinition,
    ApiClientError,
    CreateFieldVars
  >({
    mutationFn: ({ objectId: id, payload }) =>
      api.post<FieldDefinition>(`/api/v1/admin/objects/${id}/fields`, {
        body: payload,
      }),
    onSuccess: (_data, vars) => invalidateFieldLists(vars.objectId),
  });

  const updateFieldMutation = useMutation<
    FieldDefinition,
    ApiClientError,
    UpdateFieldVars
  >({
    mutationFn: ({ objectId: id, fieldId, payload }) =>
      api.put<FieldDefinition>(
        `/api/v1/admin/objects/${id}/fields/${fieldId}`,
        { body: payload },
      ),
    onSuccess: (_data, vars) => invalidateFieldLists(vars.objectId),
  });

  const deleteFieldMutation = useMutation<
    void,
    ApiClientError,
    DeleteFieldVars
  >({
    mutationFn: ({ objectId: id, fieldId }) =>
      api.del<void>(`/api/v1/admin/objects/${id}/fields/${fieldId}`),
    onSuccess: (_data, vars) => invalidateFieldLists(vars.objectId),
  });

  const reorderFieldsMutation = useMutation<
    FieldDefinition[],
    ApiClientError,
    ReorderFieldsVars,
    ReorderContext
  >({
    mutationFn: ({ objectId: id, fieldIds }) =>
      api.patch<FieldDefinition[]>(
        `/api/v1/admin/objects/${id}/fields/reorder`,
        { body: { fieldIds } },
      ),
    onMutate: async ({ objectId: id, fieldIds }) => {
      // Cancel in-flight refetches so they don't overwrite the optimistic
      // patch, then reorder the cached field array to match the requested
      // id sequence before the round-trip.
      const detailKey = objectDefinitionsKeys.detail(id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous =
        queryClient.getQueryData<ObjectDefinitionDetail>(detailKey);
      queryClient.setQueryData<ObjectDefinitionDetail>(detailKey, (prev) => {
        if (!prev) return prev;
        const byId = new Map(prev.fields.map((f) => [f.id, f]));
        const reordered = fieldIds
          .map((fid) => byId.get(fid))
          .filter((f): f is FieldDefinition => Boolean(f));
        return { ...prev, fields: reordered };
      });
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          objectDefinitionsKeys.detail(vars.objectId),
          context.previous,
        );
      }
    },
    onSuccess: (updated, vars) => {
      queryClient.setQueryData<ObjectDefinitionDetail>(
        objectDefinitionsKeys.detail(vars.objectId),
        (prev) => (prev ? { ...prev, fields: updated } : prev),
      );
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({
        queryKey: fieldDefinitionsKeys.byObject(vars.objectId),
      });
    },
  });

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
        await updateFieldMutation.mutateAsync({
          objectId,
          fieldId: editingField.id,
          payload,
        });
      } else {
        payload.apiName = trimmedApiName;
        await createFieldMutation.mutateAsync({ objectId, payload });
      }
      setShowFieldModal(false);
    } catch (err) {
      setFieldModalError(errorMessage(err, 'An unexpected error occurred'));
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

    setDeleteError(null);
    try {
      await deleteFieldMutation.mutateAsync({
        objectId,
        fieldId: deleteTarget.id,
      });
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(errorMessage(err, 'Failed to delete field'));
    }
  };

  // ── Reorder handler ─────────────────────────────────────

  const handleMoveField = async (index: number, direction: 'up' | 'down') => {
    if (!sessionToken || !objectId) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= fields.length) return;

    const newFields = [...fields];
    [newFields[index], newFields[swapIndex]] = [newFields[swapIndex], newFields[index]];

    try {
      await reorderFieldsMutation.mutateAsync({
        objectId,
        fieldIds: newFields.map((f) => f.id),
      });
    } catch {
      // `onError` already rolled the optimistic patch back. Reorder failures
      // are intentionally silent — matching the previous behaviour — so we
      // swallow the rethrow here.
    }
  };

  return {
    // Field modal
    showFieldModal,
    editingField,
    fieldForm,
    fieldModalError,
    saving: createFieldMutation.isPending || updateFieldMutation.isPending,
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
    deleting: deleteFieldMutation.isPending,
    deleteError,
    openDeleteConfirm,
    closeDeleteConfirm,
    handleDelete,
    // Reorder
    reordering: reorderFieldsMutation.isPending,
    handleMoveField,
  };
}
