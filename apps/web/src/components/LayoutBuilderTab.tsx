import { useState, useEffect, useCallback, useRef } from 'react';
import { useApiClient, unwrapList } from '../lib/apiClient.js';
import { PrimaryButton } from './PrimaryButton.js';
import styles from './LayoutBuilderTab.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDefinition {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: Record<string, unknown>;
  sortOrder: number;
  isSystem: boolean;
}

interface LayoutDefinition {
  id: string;
  objectId: string;
  name: string;
  layoutType: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LayoutFieldWithMetadata {
  id: string;
  layoutId: string;
  fieldId: string;
  section: number;
  sectionLabel?: string;
  sortOrder: number;
  width: string;
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  fieldRequired: boolean;
  fieldOptions: Record<string, unknown>;
}

interface LayoutDefinitionDetail extends LayoutDefinition {
  fields: LayoutFieldWithMetadata[];
}

interface LayoutSection {
  label: string;
  fields: SectionField[];
}

interface SectionField {
  fieldId: string;
  label: string;
  apiName: string;
  fieldType: string;
  width: 'full' | 'half';
}

interface ApiError {
  error: string;
}

interface LayoutBuilderTabProps {
  objectId: string;
  fields: FieldDefinition[];
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M3 4h8M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M4.5 4v7a1 1 0 001 1h3a1 1 0 001-1V4"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GripIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <circle cx="4" cy="3" r="1" fill="currentColor" />
    <circle cx="8" cy="3" r="1" fill="currentColor" />
    <circle cx="4" cy="6" r="1" fill="currentColor" />
    <circle cx="8" cy="6" r="1" fill="currentColor" />
    <circle cx="4" cy="9" r="1" fill="currentColor" />
    <circle cx="8" cy="9" r="1" fill="currentColor" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detailToSections(detail: LayoutDefinitionDetail): LayoutSection[] {
  const sectionMap = new Map<number, LayoutSection>();

  for (const field of detail.fields) {
    if (!sectionMap.has(field.section)) {
      sectionMap.set(field.section, {
        label: field.sectionLabel ?? `Section ${field.section + 1}`,
        fields: [],
      });
    }
    sectionMap.get(field.section)!.fields.push({
      fieldId: field.fieldId,
      label: field.fieldLabel,
      apiName: field.fieldApiName,
      fieldType: field.fieldType,
      width: field.width === 'half' ? 'half' : 'full',
    });
  }

  if (sectionMap.size === 0) {
    return [{ label: 'General', fields: [] }];
  }

  const sortedKeys = [...sectionMap.keys()].sort((a, b) => a - b);
  return sortedKeys.map((key) => sectionMap.get(key)!);
}

function sectionsToPayload(sections: LayoutSection[]) {
  return sections.map((section) => ({
    label: section.label,
    fields: section.fields.map((f) => ({
      field_id: f.fieldId,
      width: f.width,
    })),
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LayoutBuilderTab({ objectId, fields }: LayoutBuilderTabProps) {
  const api = useApiClient();

  // Layout list
  const [layouts, setLayouts] = useState<LayoutDefinition[]>([]);
  const [layoutsLoading, setLayoutsLoading] = useState(true);
  const [layoutsError, setLayoutsError] = useState<string | null>(null);

  // Selected layout
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [, setLayoutDetail] = useState<LayoutDefinitionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form layout builder state
  const [sections, setSections] = useState<LayoutSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Create layout modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('form');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Rename section
  const [renamingSection, setRenamingSection] = useState<number | null>(null);
  const [renameSectionValue, setRenameSectionValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Drag state for form builder
  const [dragSource, setDragSource] = useState<{
    type: 'available' | 'section';
    sectionIndex?: number;
    fieldIndex?: number;
    fieldId: string;
  } | null>(null);

  // ── Fetch layouts ──────────────────────────────────────────

  const fetchLayouts = useCallback(async () => {
    setLayoutsLoading(true);
    setLayoutsError(null);

    try {
      const response = await api.request(`/api/v1/admin/objects/${objectId}/layouts`);

      if (response.ok) {
        const data = unwrapList<LayoutDefinition>(await response.json());
        setLayouts(data);

        setSelectedLayoutId((prev) => {
          if (prev) return prev;
          return data.length > 0 ? data[0].id : null;
        });
      } else {
        setLayoutsError('Failed to load layouts.');
      }
    } catch {
      setLayoutsError('Failed to connect to the server.');
    } finally {
      setLayoutsLoading(false);
    }
  }, [objectId, api]);

  useEffect(() => {
    void fetchLayouts();
  }, [fetchLayouts]);

  // ── Fetch layout detail ────────────────────────────────────

  const fetchLayoutDetail = useCallback(async () => {
    if (!selectedLayoutId) return;

    setDetailLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await api.request(
        `/api/v1/admin/objects/${objectId}/layouts/${selectedLayoutId}`,
      );

      if (response.ok) {
        const data = (await response.json()) as LayoutDefinitionDetail;
        setLayoutDetail(data);
        setSections(detailToSections(data));
        setDirty(false);
      }
    } catch {
      // silent fail — sections will be empty
    } finally {
      setDetailLoading(false);
    }
  }, [objectId, api, selectedLayoutId]);

  useEffect(() => {
    if (selectedLayoutId) {
      void fetchLayoutDetail();
    }
  }, [selectedLayoutId, fetchLayoutDetail]);

  // ── Rename section focus ───────────────────────────────────

  useEffect(() => {
    if (renamingSection !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSection]);

  // ── Layout selection ───────────────────────────────────────

  const handleLayoutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__create__') {
      setShowCreateModal(true);
      return;
    }
    setSelectedLayoutId(value);
    setDirty(false);
    setSaveError(null);
    setSaveSuccess(false);
  };

  // ── Create layout ─────────────────────────────────────────

  const handleCreateLayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createName.trim()) {
      setCreateError('Name is required');
      return;
    }

    setCreating(true);

    try {
      const response = await api.request(`/api/v1/admin/objects/${objectId}/layouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createName.trim(),
          layoutType: createType,
        }),
      });

      if (response.ok) {
        const created = (await response.json()) as LayoutDefinition;
        setShowCreateModal(false);
        setCreateName('');
        setCreateType('form');
        await fetchLayouts();
        setSelectedLayoutId(created.id);
      } else {
        const data = (await response.json()) as ApiError;
        setCreateError(data.error ?? 'An unexpected error occurred');
      }
    } catch {
      setCreateError('Failed to connect to the server.');
    } finally {
      setCreating(false);
    }
  };

  // ── Delete layout ─────────────────────────────────────────

  const selectedLayout = layouts.find((l) => l.id === selectedLayoutId);

  const handleDeleteLayout = async () => {
    if (!selectedLayoutId) return;

    try {
      const response = await api.request(
        `/api/v1/admin/objects/${objectId}/layouts/${selectedLayoutId}`,
        {
          method: 'DELETE',
        },
      );

      if (response.ok || response.status === 204) {
        setSelectedLayoutId(null);
        setLayoutDetail(null);
        setSections([]);
        setDirty(false);
        await fetchLayouts();
      }
    } catch {
      // silent fail
    }
  };

  // ── Save layout fields ────────────────────────────────────

  const handleSave = async () => {
    if (!selectedLayoutId) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await api.request(
        `/api/v1/admin/objects/${objectId}/layouts/${selectedLayoutId}/fields`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sections: sectionsToPayload(sections) }),
        },
      );

      if (response.ok) {
        const data = (await response.json()) as LayoutDefinitionDetail;
        setLayoutDetail(data);
        setSections(detailToSections(data));
        setDirty(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = (await response.json()) as ApiError;
        setSaveError(data.error ?? 'Failed to save layout');
      }
    } catch {
      setSaveError('Failed to connect to the server.');
    } finally {
      setSaving(false);
    }
  };

  // ── Available fields (not yet placed) ─────────────────────

  const placedFieldIds = new Set(sections.flatMap((s) => s.fields.map((f) => f.fieldId)));
  const availableFields = fields.filter((f) => !placedFieldIds.has(f.id));

  // ── Form layout: section management ───────────────────────

  const handleAddSection = () => {
    const newLabel = `Section ${sections.length + 1}`;
    setSections((prev) => [...prev, { label: newLabel, fields: [] }]);
    setDirty(true);
  };

  const handleRemoveSection = (sectionIndex: number) => {
    setSections((prev) => prev.filter((_, i) => i !== sectionIndex));
    setDirty(true);
  };

  const startRenameSection = (sectionIndex: number) => {
    setRenamingSection(sectionIndex);
    setRenameSectionValue(sections[sectionIndex].label);
  };

  const finishRenameSection = () => {
    if (renamingSection === null) return;
    const trimmed = renameSectionValue.trim();
    if (trimmed) {
      setSections((prev) => {
        const next = [...prev];
        next[renamingSection] = { ...next[renamingSection], label: trimmed };
        return next;
      });
      setDirty(true);
    }
    setRenamingSection(null);
  };

  // ── Form layout: field drag & drop ────────────────────────

  const handleDragStartAvailable = (fieldId: string) => {
    setDragSource({ type: 'available', fieldId });
  };

  const handleDragStartSection = (
    sectionIndex: number,
    fieldIndex: number,
    fieldId: string,
  ) => {
    setDragSource({ type: 'section', sectionIndex, fieldIndex, fieldId });
  };

  const handleDropOnSection = (targetSectionIndex: number, targetFieldIndex?: number) => {
    if (!dragSource) return;

    const fieldDef = fields.find((f) => f.id === dragSource.fieldId);
    if (!fieldDef) return;

    setSections((prev) => {
      const next = prev.map((s) => ({ ...s, fields: [...s.fields] }));

      // Remove from source if coming from a section
      if (dragSource.type === 'section' && dragSource.sectionIndex !== undefined && dragSource.fieldIndex !== undefined) {
        next[dragSource.sectionIndex].fields.splice(dragSource.fieldIndex, 1);
      }

      const newField: SectionField = {
        fieldId: fieldDef.id,
        label: fieldDef.label,
        apiName: fieldDef.apiName,
        fieldType: fieldDef.fieldType,
        width: 'full',
      };

      // If dropping from a section, preserve original width
      if (dragSource.type === 'section' && dragSource.sectionIndex !== undefined && dragSource.fieldIndex !== undefined) {
        const originalSection = prev[dragSource.sectionIndex];
        const originalField = originalSection.fields[dragSource.fieldIndex];
        if (originalField) {
          newField.width = originalField.width;
        }
      }

      const insertIndex = targetFieldIndex ?? next[targetSectionIndex].fields.length;
      next[targetSectionIndex].fields.splice(insertIndex, 0, newField);

      return next;
    });

    setDragSource(null);
    setDirty(true);
  };

  const handleDragEnd = () => {
    setDragSource(null);
  };

  // ── Form layout: field reorder ────────────────────────────

  const handleMoveFieldInSection = (
    sectionIndex: number,
    fieldIndex: number,
    direction: 'up' | 'down',
  ) => {
    const swapIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
    setSections((prev) => {
      const next = prev.map((s) => ({ ...s, fields: [...s.fields] }));
      const sectionFields = next[sectionIndex].fields;
      if (swapIndex < 0 || swapIndex >= sectionFields.length) return prev;
      [sectionFields[fieldIndex], sectionFields[swapIndex]] = [
        sectionFields[swapIndex],
        sectionFields[fieldIndex],
      ];
      return next;
    });
    setDirty(true);
  };

  // ── Form layout: remove field ─────────────────────────────

  const handleRemoveFieldFromSection = (sectionIndex: number, fieldIndex: number) => {
    setSections((prev) => {
      const next = prev.map((s) => ({ ...s, fields: [...s.fields] }));
      next[sectionIndex].fields.splice(fieldIndex, 1);
      return next;
    });
    setDirty(true);
  };

  // ── Form layout: toggle field width ───────────────────────

  const handleToggleWidth = (sectionIndex: number, fieldIndex: number) => {
    setSections((prev) => {
      const next = prev.map((s) => ({ ...s, fields: [...s.fields] }));
      const field = next[sectionIndex].fields[fieldIndex];
      next[sectionIndex].fields[fieldIndex] = {
        ...field,
        width: field.width === 'full' ? 'half' : 'full',
      };
      return next;
    });
    setDirty(true);
  };

  // ── List layout: toggle column ────────────────────────────

  const handleToggleListColumn = (fieldId: string) => {
    setSections((prev) => {
      const section = prev[0] ?? { label: 'Columns', fields: [] };
      const existing = section.fields.findIndex((f) => f.fieldId === fieldId);

      if (existing >= 0) {
        // Remove
        const newFields = section.fields.filter((_, i) => i !== existing);
        return [{ ...section, fields: newFields }];
      } else {
        // Add
        const fieldDef = fields.find((f) => f.id === fieldId);
        if (!fieldDef) return prev;
        return [
          {
            ...section,
            fields: [
              ...section.fields,
              {
                fieldId: fieldDef.id,
                label: fieldDef.label,
                apiName: fieldDef.apiName,
                fieldType: fieldDef.fieldType,
                width: 'full' as const,
              },
            ],
          },
        ];
      }
    });
    setDirty(true);
  };

  const handleMoveListColumn = (fieldIndex: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
    setSections((prev) => {
      const section = { ...(prev[0] ?? { label: 'Columns', fields: [] }), fields: [...(prev[0]?.fields ?? [])] };
      if (swapIndex < 0 || swapIndex >= section.fields.length) return prev;
      [section.fields[fieldIndex], section.fields[swapIndex]] = [
        section.fields[swapIndex],
        section.fields[fieldIndex],
      ];
      return [section];
    });
    setDirty(true);
  };

  // ── Render: loading / error ───────────────────────────────

  if (layoutsLoading) {
    return <div className={styles.loadingText}>Loading layouts…</div>;
  }

  if (layoutsError) {
    return (
      <p role="alert" className={styles.errorAlert}>
        {layoutsError}
      </p>
    );
  }

  const isFormLayout = selectedLayout?.layoutType === 'form' || selectedLayout?.layoutType === 'detail';
  const isListLayout = selectedLayout?.layoutType === 'list';

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={styles.layoutBuilder}>
      {/* Layout selector */}
      <div className={styles.selectorRow}>
        <div className={styles.selectorGroup}>
          <label className={styles.selectorLabel} htmlFor="layout-select">
            Layout
          </label>
          <select
            id="layout-select"
            className={styles.select}
            value={selectedLayoutId ?? ''}
            onChange={handleLayoutChange}
          >
            {layouts.length === 0 && <option value="">No layouts</option>}
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.layoutType})
              </option>
            ))}
            <option value="__create__">+ Create new layout</option>
          </select>
        </div>

        <div className={styles.selectorActions}>
          {selectedLayout && !selectedLayout.isDefault && (
            <PrimaryButton
              size="sm"
              variant="outline"
              onClick={() => void handleDeleteLayout()}
            >
              <TrashIcon />
              Delete
            </PrimaryButton>
          )}
          {dirty && (
            <PrimaryButton size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save layout'}
            </PrimaryButton>
          )}
        </div>
      </div>

      {saveError && (
        <p role="alert" className={styles.errorAlert}>
          {saveError}
        </p>
      )}

      {saveSuccess && (
        <p className={styles.successAlert}>Layout saved successfully.</p>
      )}

      {/* No layout selected */}
      {!selectedLayoutId && layouts.length === 0 && (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No layouts yet</h3>
          <p className={styles.emptyText}>
            Create your first layout to arrange fields on forms and list views.
          </p>
          <PrimaryButton size="sm" onClick={() => setShowCreateModal(true)}>
            <PlusIcon />
            Create layout
          </PrimaryButton>
        </div>
      )}

      {/* Detail loading */}
      {detailLoading && selectedLayoutId && (
        <div className={styles.loadingText}>Loading layout…</div>
      )}

      {/* Form / Detail layout builder */}
      {!detailLoading && selectedLayoutId && isFormLayout && (
        <div className={styles.builderContainer}>
          {/* Available fields panel */}
          <div className={styles.availablePanel}>
            <h3 className={styles.panelTitle}>Available Fields</h3>
            {availableFields.length === 0 && (
              <p className={styles.panelEmpty}>All fields have been placed.</p>
            )}
            <div className={styles.fieldList}>
              {availableFields.map((f) => (
                <div
                  key={f.id}
                  className={styles.availableField}
                  draggable
                  onDragStart={() => handleDragStartAvailable(f.id)}
                  onDragEnd={handleDragEnd}
                >
                  <GripIcon />
                  <span className={styles.availableFieldLabel}>{f.label}</span>
                  <span className={styles.availableFieldType}>{f.fieldType}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Form preview panel */}
          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <h3 className={styles.panelTitle}>Form Preview</h3>
              <PrimaryButton size="sm" variant="outline" onClick={handleAddSection}>
                <PlusIcon />
                Add section
              </PrimaryButton>
            </div>

            {sections.length === 0 && (
              <div className={styles.sectionEmpty}>
                <p className={styles.panelEmpty}>
                  Add a section and drag fields here to build your layout.
                </p>
              </div>
            )}

            {sections.map((section, sectionIndex) => (
              <div
                key={sectionIndex}
                className={styles.section}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnSection(sectionIndex);
                }}
              >
                <div className={styles.sectionHeader}>
                  {renamingSection === sectionIndex ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      className={styles.renameSectionInput}
                      value={renameSectionValue}
                      onChange={(e) => setRenameSectionValue(e.target.value)}
                      onBlur={finishRenameSection}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishRenameSection();
                        if (e.key === 'Escape') setRenamingSection(null);
                      }}
                      aria-label="Section name"
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.sectionLabel}
                      onClick={() => startRenameSection(sectionIndex)}
                      title="Click to rename"
                    >
                      {section.label}
                    </button>
                  )}
                  {sections.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeSectionButton}
                      aria-label={`Remove section ${section.label}`}
                      onClick={() => handleRemoveSection(sectionIndex)}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>

                {section.fields.length === 0 && (
                  <div className={styles.dropZone}>
                    <p className={styles.dropZoneText}>Drag fields here</p>
                  </div>
                )}

                <div className={styles.sectionFields}>
                  {section.fields.map((field, fieldIndex) => (
                    <div
                      key={field.fieldId}
                      className={`${styles.layoutField} ${field.width === 'half' ? styles.layoutFieldHalf : styles.layoutFieldFull}`}
                      draggable
                      onDragStart={() =>
                        handleDragStartSection(sectionIndex, fieldIndex, field.fieldId)
                      }
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropOnSection(sectionIndex, fieldIndex);
                      }}
                    >
                      <div className={styles.layoutFieldContent}>
                        <GripIcon />
                        <span className={styles.layoutFieldLabel}>{field.label}</span>
                        <span className={styles.layoutFieldType}>{field.fieldType}</span>
                      </div>
                      <div className={styles.layoutFieldActions}>
                        <button
                          type="button"
                          className={styles.widthToggle}
                          onClick={() => handleToggleWidth(sectionIndex, fieldIndex)}
                          title={field.width === 'full' ? 'Set to half width' : 'Set to full width'}
                          aria-label={`Toggle width for ${field.label}`}
                        >
                          {field.width === 'full' ? '▬' : '◫'}
                        </button>
                        <div className={styles.reorderButtons}>
                          <button
                            type="button"
                            className={styles.reorderButton}
                            aria-label={`Move ${field.label} up`}
                            disabled={fieldIndex === 0}
                            onClick={() =>
                              handleMoveFieldInSection(sectionIndex, fieldIndex, 'up')
                            }
                          >
                            <ChevronUpIcon />
                          </button>
                          <button
                            type="button"
                            className={styles.reorderButton}
                            aria-label={`Move ${field.label} down`}
                            disabled={fieldIndex === section.fields.length - 1}
                            onClick={() =>
                              handleMoveFieldInSection(sectionIndex, fieldIndex, 'down')
                            }
                          >
                            <ChevronDownIcon />
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.removeFieldButton}
                          aria-label={`Remove ${field.label} from layout`}
                          onClick={() =>
                            handleRemoveFieldFromSection(sectionIndex, fieldIndex)
                          }
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List layout builder */}
      {!detailLoading && selectedLayoutId && isListLayout && (
        <div className={styles.listBuilder}>
          <div className={styles.listColumns}>
            <h3 className={styles.panelTitle}>Select Columns</h3>
            <p className={styles.panelHint}>
              Check the fields you want to display as columns. Reorder using the arrow buttons.
            </p>

            <div className={styles.columnList}>
              {fields.map((f) => {
                const isSelected = sections[0]?.fields.some((sf) => sf.fieldId === f.id) ?? false;
                return (
                  <label key={f.id} className={styles.columnItem}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleListColumn(f.id)}
                      className={styles.columnCheckbox}
                    />
                    <span className={styles.columnLabel}>{f.label}</span>
                    <span className={styles.columnType}>{f.fieldType}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {(sections[0]?.fields.length ?? 0) > 0 && (
            <div className={styles.listOrder}>
              <h3 className={styles.panelTitle}>Column Order</h3>
              <div className={styles.columnOrderList}>
                {sections[0].fields.map((field, index) => (
                  <div key={field.fieldId} className={styles.columnOrderItem}>
                    <span className={styles.columnOrderNumber}>{index + 1}</span>
                    <span className={styles.columnOrderLabel}>{field.label}</span>
                    <div className={styles.reorderButtons}>
                      <button
                        type="button"
                        className={styles.reorderButton}
                        aria-label={`Move ${field.label} up`}
                        disabled={index === 0}
                        onClick={() => handleMoveListColumn(index, 'up')}
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        type="button"
                        className={styles.reorderButton}
                        aria-label={`Move ${field.label} down`}
                        disabled={index === sections[0].fields.length - 1}
                        onClick={() => handleMoveListColumn(index, 'down')}
                      >
                        <ChevronDownIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create Layout Modal ──────────────────────────────── */}

      {showCreateModal && (
        <div
          className={styles.overlay}
          onClick={() => setShowCreateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Create layout"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create layout</h2>

            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => void handleCreateLayout(e)}
            >
              <div className={styles.formField}>
                <label
                  className={`${styles.fieldLabel} ${styles.labelRequired}`}
                  htmlFor="layout-name"
                >
                  Name
                </label>
                <input
                  id="layout-name"
                  type="text"
                  className={styles.input}
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="e.g. Default Form"
                  maxLength={255}
                  disabled={creating}
                />
              </div>

              <div className={styles.formField}>
                <label
                  className={`${styles.fieldLabel} ${styles.labelRequired}`}
                  htmlFor="layout-type"
                >
                  Type
                </label>
                <select
                  id="layout-type"
                  className={styles.select}
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                  disabled={creating}
                >
                  <option value="form">Form</option>
                  <option value="list">List</option>
                  <option value="detail">Detail</option>
                </select>
              </div>

              {createError && (
                <p className={styles.errorAlert} role="alert">
                  {createError}
                </p>
              )}

              <hr className={styles.divider} />

              <div className={styles.actions}>
                <PrimaryButton
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError(null);
                  }}
                  disabled={creating}
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create layout'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
