import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ObjectIcon } from '../../components/ObjectIcon.js';
import { useFieldDefinitions } from './hooks/queries/useFieldDefinitions.js';
import { useObjectRelationships } from './hooks/queries/useObjectRelationships.js';
import { useObjectDefinitions } from './hooks/queries/useObjectDefinitions.js';
import { usePageLayoutList } from './hooks/queries/usePageLayoutList.js';
import { useFieldMutations } from './hooks/useFieldMutations.js';
import { useRelationshipMutations } from './hooks/useRelationshipMutations.js';
import { FieldList } from './components/FieldList.js';
import { FieldEditor } from './components/FieldEditor.js';
import { RelationshipList } from './components/RelationshipList.js';
import { RelationshipEditor } from './components/RelationshipEditor.js';
import { PageLayoutTab } from './components/PageLayoutTab.js';
import { DeleteConfirmModal } from './components/DeleteConfirmModal.js';
import type { TabName } from './types.js';
import styles from './FieldBuilderPage.module.css';

export function FieldBuilderPage() {
  const { id: objectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTabState] = useState<TabName>('fields');

  // Surfaces failures from the create-default-layout mutation. Kept separate
  // from the query error below so the empty-state retry button stays
  // clickable after a failed create — hiding it would trap users on the tab
  // until reload. Cleared on tab changes so stale errors don't linger.
  const [createLayoutError, setCreateLayoutError] = useState<string | null>(
    null,
  );

  const setActiveTab = (tab: TabName) => {
    setCreateLayoutError(null);
    setActiveTabState(tab);
  };

  const objectQuery = useFieldDefinitions(objectId);
  const relationshipsQuery = useObjectRelationships(objectId, {
    enabled: activeTab === 'relationships',
  });
  const allObjectsQuery = useObjectDefinitions({
    enabled: activeTab === 'relationships',
  });
  const pageLayoutsQuery = usePageLayoutList(objectId, {
    enabled: activeTab === 'page_layout',
  });

  const objectDef = objectQuery.data;
  const fields = objectDef?.fields ?? [];
  const relationships = relationshipsQuery.data ?? [];
  const allObjects = allObjectsQuery.data ?? [];
  const pageLayouts = pageLayoutsQuery.data ?? [];

  const mutations = useFieldMutations({ objectId, fields });

  const relMutations = useRelationshipMutations({
    objectId,
    objectDef,
    setCreateLayoutError,
  });

  // ── Loading / error states ──────────────────────────────

  if (objectQuery.isPending) {
    return <div className={styles.page}>Loading…</div>;
  }

  if (objectQuery.isError) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          Failed to load object definition.
        </p>
      </div>
    );
  }

  if (!objectDef) {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorAlert}>
          Object not found.
        </p>
      </div>
    );
  }

  const relationshipsError = relationshipsQuery.isError
    ? 'Failed to load relationships.'
    : null;

  const pageLayoutsError = pageLayoutsQuery.isError
    ? 'Failed to load page layouts.'
    : null;

  // ── Render ──────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/admin/objects" className={styles.breadcrumbLink}>
          Object Manager
        </Link>
        <span className={styles.breadcrumbSep} aria-hidden="true">
          /
        </span>
        <span className={styles.breadcrumbCurrent}>{objectDef.label}</span>
      </nav>

      {/* Object header */}
      <div className={styles.objectHeader}>
        <ObjectIcon icon={objectDef.icon ?? ''} size={28} />
        <div className={styles.objectMeta}>
          <h1 className={styles.objectLabel}>
            {objectDef.label}
          </h1>
          {objectDef.description && (
            <p className={styles.objectDescription}>{objectDef.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Object sections">
        <button
          role="tab"
          aria-selected={activeTab === 'fields'}
          className={`${styles.tab} ${activeTab === 'fields' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('fields')}
        >
          Fields
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'relationships'}
          className={`${styles.tab} ${activeTab === 'relationships' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('relationships')}
        >
          Relationships
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'page_layout'}
          className={`${styles.tab} ${activeTab === 'page_layout' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('page_layout')}
        >
          Page Layout
        </button>
      </div>

      {/* Fields tab */}
      {activeTab === 'fields' && (
        <FieldList
          fields={fields}
          reordering={mutations.reordering}
          onAddField={mutations.openAddFieldModal}
          onEditField={mutations.openEditFieldModal}
          onDeleteField={mutations.openDeleteConfirm}
          onMoveField={(index, direction) => void mutations.handleMoveField(index, direction)}
        />
      )}

      {/* Relationships tab */}
      {activeTab === 'relationships' && (
        <RelationshipList
          objectId={objectId!}
          relationships={relationships}
          allObjects={allObjects}
          relationshipsLoading={relationshipsQuery.isPending}
          relationshipsError={relationshipsError}
          onAddRelationship={relMutations.openRelModal}
          onDeleteRelationship={relMutations.openDeleteRelConfirm}
        />
      )}

      {/* Page Layout tab */}
      {activeTab === 'page_layout' && objectId && (
        <PageLayoutTab
          objectId={objectId}
          pageLayouts={pageLayouts}
          pageLayoutsLoading={pageLayoutsQuery.isPending}
          pageLayoutsError={pageLayoutsError}
          createLayoutError={createLayoutError}
          creatingLayout={relMutations.creatingLayout}
          onCreateDefaultLayout={() => void relMutations.handleCreateDefaultLayout()}
        />
      )}

      {/* Add/Edit Field Modal */}
      {mutations.showFieldModal && (
        <FieldEditor
          editingField={mutations.editingField}
          fieldForm={mutations.fieldForm}
          fields={fields}
          fieldModalError={mutations.fieldModalError}
          saving={mutations.saving}
          onClose={mutations.closeFieldModal}
          onSubmit={mutations.handleFieldSubmit}
          onChange={mutations.handleFieldFormChange}
          onToggleRequired={mutations.handleToggleRequired}
          onChoiceChange={mutations.handleChoiceChange}
          onAddChoice={mutations.handleAddChoice}
          onRemoveChoice={mutations.handleRemoveChoice}
        />
      )}

      {/* Delete Field Confirmation Modal */}
      {mutations.deleteTarget && (
        <DeleteConfirmModal
          title="Delete field"
          ariaLabel="Confirm delete"
          itemLabel={mutations.deleteTarget.label}
          message="Are you sure you want to delete"
          error={mutations.deleteError}
          deleting={mutations.deleting}
          onClose={mutations.closeDeleteConfirm}
          onConfirm={() => void mutations.handleDelete()}
        />
      )}

      {/* Add Relationship Modal */}
      {relMutations.showRelModal && (
        <RelationshipEditor
          objectId={objectId!}
          relForm={relMutations.relForm}
          allObjects={allObjects}
          relModalError={relMutations.relModalError}
          relSaving={relMutations.relSaving}
          onClose={relMutations.closeRelModal}
          onSubmit={relMutations.handleRelSubmit}
          onChange={relMutations.handleRelFormChange}
          onToggleRequired={relMutations.handleRelToggleRequired}
        />
      )}

      {/* Delete Relationship Confirmation Modal */}
      {relMutations.deleteRelTarget && (
        <DeleteConfirmModal
          title="Delete relationship"
          ariaLabel="Confirm delete relationship"
          itemLabel={relMutations.deleteRelTarget.label}
          message="Are you sure you want to delete the"
          error={relMutations.deleteRelError}
          deleting={relMutations.deletingRel}
          onClose={relMutations.closeDeleteRelConfirm}
          onConfirm={() => void relMutations.handleDeleteRel()}
        />
      )}
    </div>
  );
}
