import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { slugify } from '../../../utils.js';
import { EMPTY_RELATIONSHIP_FORM } from '../constants.js';
import type {
  RelationshipDefinition,
  RelationshipForm,
  ApiError,
  ObjectDefinitionDetail,
} from '../types.js';

interface UseRelationshipMutationsOptions {
  objectId: string | undefined;
  sessionToken: string | undefined;
  api: { request: (url: string, init?: RequestInit) => Promise<Response> };
  objectDef: ObjectDefinitionDetail | null;
  fetchRelationships: () => Promise<void>;
  setPageLayoutsError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useRelationshipMutations({
  objectId,
  sessionToken,
  api,
  objectDef,
  fetchRelationships,
  setPageLayoutsError,
}: UseRelationshipMutationsOptions) {
  const navigate = useNavigate();

  // ── Relationship modal state ────────────────────────────
  const [showRelModal, setShowRelModal] = useState(false);
  const [relForm, setRelForm] = useState<RelationshipForm>({ ...EMPTY_RELATIONSHIP_FORM });
  const [relModalError, setRelModalError] = useState<string | null>(null);
  const [relSaving, setRelSaving] = useState(false);

  // ── Delete relationship state ────────────────���──────────
  const [deleteRelTarget, setDeleteRelTarget] = useState<RelationshipDefinition | null>(null);
  const [deletingRel, setDeletingRel] = useState(false);
  const [deleteRelError, setDeleteRelError] = useState<string | null>(null);

  // ── Page layout state ───────────────────────────────────
  const [creatingLayout, setCreatingLayout] = useState(false);

  // ── Relationship modal handlers ─────────────────────────

  const openRelModal = () => {
    setRelForm({ ...EMPTY_RELATIONSHIP_FORM });
    setRelModalError(null);
    setShowRelModal(true);
  };

  const closeRelModal = () => {
    setShowRelModal(false);
    setRelModalError(null);
  };

  const handleRelFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setRelForm((prev) => ({ ...prev, [name]: value }));
    setRelModalError(null);
  };

  const handleRelToggleRequired = () => {
    setRelForm((prev) => ({ ...prev, required: !prev.required }));
  };

  const handleRelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRelModalError(null);

    if (!sessionToken || !objectId) {
      setRelModalError('Session unavailable. Please refresh and try again.');
      return;
    }

    if (!relForm.targetObjectId) {
      setRelModalError('Target object is required');
      return;
    }

    if (!relForm.label.trim()) {
      setRelModalError('Label is required');
      return;
    }

    if (!relForm.relationshipType) {
      setRelModalError('Relationship type is required');
      return;
    }

    setRelSaving(true);

    const apiName = slugify(relForm.label);

    const payload = {
      source_object_id: objectId,
      target_object_id: relForm.targetObjectId,
      relationship_type: relForm.relationshipType,
      api_name: apiName,
      label: relForm.label.trim(),
      reverse_label: relForm.reverseLabel.trim() || undefined,
      required: relForm.required,
    };

    try {
      const response = await api.request('/api/admin/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowRelModal(false);
        await fetchRelationships();
      } else {
        const data = (await response.json()) as ApiError;
        setRelModalError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setRelModalError('Failed to connect to the server. Please try again.');
    } finally {
      setRelSaving(false);
    }
  };

  // ── Delete relationship handlers ────────────────────────

  const openDeleteRelConfirm = (rel: RelationshipDefinition) => {
    setDeleteRelTarget(rel);
    setDeleteRelError(null);
  };

  const closeDeleteRelConfirm = () => {
    setDeleteRelTarget(null);
    setDeleteRelError(null);
  };

  const handleDeleteRel = async () => {
    if (!deleteRelTarget || !sessionToken) return;

    setDeletingRel(true);
    setDeleteRelError(null);

    try {
      const response = await api.request(`/api/admin/relationships/${deleteRelTarget.id}`, {
        method: 'DELETE',
      });

      if (response.ok || response.status === 204) {
        setDeleteRelTarget(null);
        await fetchRelationships();
      } else {
        const data = (await response.json()) as ApiError;
        setDeleteRelError(data.error ?? 'Failed to delete relationship');
      }
    } catch {
      setDeleteRelError('Failed to connect to the server. Please try again.');
    } finally {
      setDeletingRel(false);
    }
  };

  // ── Page layout creation ────────────────────────────────

  const handleCreateDefaultLayout = async () => {
    if (!sessionToken || !objectId || !objectDef) return;

    setCreatingLayout(true);

    try {
      const response = await api.request(`/api/admin/objects/${objectId}/page-layouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${objectDef.label} - Default` }),
      });

      if (response.ok) {
        void navigate(`/admin/objects/${objectId}/page-builder`);
      } else {
        setPageLayoutsError('Failed to create layout.');
      }
    } catch {
      setPageLayoutsError('Failed to connect to the server. Please try again.');
    } finally {
      setCreatingLayout(false);
    }
  };

  return {
    // Relationship modal
    showRelModal,
    relForm,
    relModalError,
    relSaving,
    openRelModal,
    closeRelModal,
    handleRelFormChange,
    handleRelToggleRequired,
    handleRelSubmit,
    // Relationship delete
    deleteRelTarget,
    deletingRel,
    deleteRelError,
    openDeleteRelConfirm,
    closeDeleteRelConfirm,
    handleDeleteRel,
    // Page layout
    creatingLayout,
    handleCreateDefaultLayout,
  };
}
