import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTenantLocale } from '../../useTenantLocale.js';
import { PageLayoutRenderer } from '../../components/PageLayoutRenderer.js';
import { ConvertLeadModal } from '../../components/ConvertLeadModal.js';
import { useRecord } from './hooks/useRecord.js';
import { useRecordEdit } from './hooks/useRecordEdit.js';
import { useRecordDelete } from './hooks/useRecordDelete.js';
import { useLeadConversion } from './hooks/useLeadConversion.js';
import { sectionsFromPageLayout } from './helpers.js';
import { RecordHeader } from './components/RecordHeader.js';
import { RecordFieldSection } from './components/RecordFieldSection.js';
import { RecordMetaFooter } from './components/RecordMetaFooter.js';
import { RelatedRecordsList } from './components/RelatedRecordsList.js';
import { DeleteConfirmModal } from './components/DeleteConfirmModal.js';
import type { LayoutSection } from './types.js';
import styles from './RecordDetailPage.module.css';

export function RecordDetailPage() {
  const { apiName, id } = useParams<{ apiName: string; id: string }>();
  const navigate = useNavigate();
  const { formatDate, formatRelativeTime } = useTenantLocale();

  const {
    record,
    objectDef,
    layoutSections,
    pageLayout,
    loading,
    loadError,
    loadRecord,
    setRecord,
  } = useRecord(apiName, id);

  const {
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
  } = useRecordEdit(record, layoutSections, apiName, loadRecord);

  const {
    showDeleteConfirm,
    deleting,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
  } = useRecordDelete(record, apiName, (path) => void navigate(path), setSaveError);

  const {
    showConvertModal,
    converting,
    convertError,
    openConvertModal,
    closeConvertModal,
    handleConvert,
  } = useLeadConversion(record, (path) => void navigate(path));

  const pluralLabel = objectDef?.pluralLabel ?? apiName ?? 'Records';
  const singularLabel = objectDef?.label ?? apiName ?? 'Record';
  const isLead = apiName === 'lead';
  const isConverted = isLead && record?.fieldValues['status'] === 'Converted';

  const handleStageChanged = (result: {
    currentStageId: string;
    fieldValues: Record<string, unknown>;
  }) => {
    if (record) {
      setRecord({
        ...record,
        currentStageId: result.currentStageId,
        fieldValues: result.fieldValues,
        fields: record.fields.map((f) => {
          if (f.apiName in result.fieldValues) {
            return { ...f, value: result.fieldValues[f.apiName] };
          }
          return f;
        }),
      });
    }
  };

  // ── Loading / Error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError || !record) {
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <button
            className={styles.breadcrumbLink}
            onClick={() => void navigate(`/objects/${apiName}`)}
            type="button"
          >
            {pluralLabel}
          </button>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
          <span className={styles.breadcrumbCurrent}>Detail</span>
        </nav>
        <p role="alert">{loadError ?? 'Record not found.'}</p>
      </div>
    );
  }

  // ── Resolve field sections ──────────────────────────────────────────────────

  const pageLayoutSections = pageLayout
    ? sectionsFromPageLayout(pageLayout, record.fields)
    : null;

  const sections: LayoutSection[] =
    (pageLayoutSections && pageLayoutSections.length > 0 ? pageLayoutSections : null) ??
    layoutSections ?? [
      {
        label: `${singularLabel} details`,
        fields: record.fields.map((f, i) => ({
          fieldId: '',
          fieldApiName: f.apiName,
          fieldLabel: f.label,
          fieldType: f.fieldType,
          fieldRequired: false,
          fieldOptions: f.options ?? {},
          sortOrder: i,
          section: 0,
          width: f.fieldType === 'textarea' ? 'full' : 'half',
        })),
      },
    ];

  // ── Converted lead banner ───────────────────────────────────────────────────

  const convertedBanner = isConverted && (
    <div className={styles.convertedBanner}>
      <span className={styles.convertedBadge}>Converted</span>
      <div className={styles.convertedLinks}>
        {typeof record.fieldValues['converted_account_id'] === 'string' && (
          <Link
            to={`/objects/account/${record.fieldValues['converted_account_id']}`}
            className={styles.convertedLink}
          >
            View Account
          </Link>
        )}
        {typeof record.fieldValues['converted_contact_id'] === 'string' && (
          <Link
            to={`/objects/contact/${record.fieldValues['converted_contact_id']}`}
            className={styles.convertedLink}
          >
            View Contact
          </Link>
        )}
        {typeof record.fieldValues['converted_opportunity_id'] === 'string' && (
          <Link
            to={`/objects/opportunity/${record.fieldValues['converted_opportunity_id']}`}
            className={styles.convertedLink}
          >
            View Opportunity
          </Link>
        )}
      </div>
    </div>
  );

  // ── Page Layout Renderer (metadata-driven) ──────────────────────────────────

  if (pageLayout && !editing) {
    const layoutActions = (
      <>
        {isLead && !isConverted && (
          <button
            className={styles.btnConvert}
            type="button"
            onClick={openConvertModal}
          >
            Convert Lead
          </button>
        )}
        {!isConverted && (
          <>
            <button
              className={styles.btnPrimary}
              type="button"
              onClick={handleEditClick}
            >
              Edit
            </button>
            <button
              className={styles.btnDanger}
              type="button"
              onClick={handleDeleteClick}
            >
              Delete
            </button>
          </>
        )}
      </>
    );

    return (
      <div className={styles.page}>
        {convertedBanner}

        {saveSuccess && (
          <p role="status" className={styles.successAlert}>
            {singularLabel} updated successfully.
          </p>
        )}

        <PageLayoutRenderer
          layout={pageLayout}
          record={record}
          fields={record.fields}
          objectDef={objectDef}
          actions={layoutActions}
          onRecordCreated={() => void loadRecord()}
        />

        {showDeleteConfirm && (
          <DeleteConfirmModal
            singularLabel={singularLabel}
            recordName={record.name}
            deleting={deleting}
            onConfirm={() => void handleDeleteConfirm()}
            onCancel={handleDeleteCancel}
          />
        )}

        {showConvertModal && (
          <ConvertLeadModal
            leadName={record.name}
            fieldValues={record.fieldValues}
            onConvert={handleConvert}
            onClose={closeConvertModal}
            converting={converting}
            error={convertError}
          />
        )}
      </div>
    );
  }

  // ── Legacy form (fallback when no page layout exists) ───────────────────────

  return (
    <div className={styles.page}>
      <RecordHeader
        pluralLabel={pluralLabel}
        recordName={record.name}
        lastUpdated={formatDate(record.updatedAt)}
        editing={editing}
        isLead={isLead}
        isConverted={isConverted ?? false}
        onNavigateToList={() => void navigate(`/objects/${apiName}`)}
        onEditClick={handleEditClick}
        onDeleteClick={handleDeleteClick}
        onConvertClick={openConvertModal}
      />

      {convertedBanner}

      {saveSuccess && (
        <p role="status" className={styles.successAlert}>
          {singularLabel} updated successfully.
        </p>
      )}

      {editing ? (
        <form onSubmit={(e) => void handleSave(e)} noValidate>
          <RecordFieldSection
            sections={sections}
            record={record}
            objectApiName={apiName!}
            editing={true}
            formValues={formValues}
            submitting={submitting}
            onFieldChange={handleFieldChange}
            onStageChanged={handleStageChanged}
          />

          {saveError && (
            <p role="alert" className={styles.errorAlert}>
              {saveError}
            </p>
          )}

          <div className={styles.formActions}>
            <button
              className={styles.btnPrimary}
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={handleCancelClick}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <RecordFieldSection
            sections={sections}
            record={record}
            objectApiName={apiName!}
            editing={false}
            formValues={formValues}
            submitting={submitting}
            onFieldChange={handleFieldChange}
            onStageChanged={handleStageChanged}
            metaFooter={(sIdx) =>
              sIdx === 0 ? (
                <RecordMetaFooter
                  record={record}
                  formatDate={formatDate}
                  formatRelativeTime={formatRelativeTime}
                />
              ) : null
            }
          />

          <RelatedRecordsList
            record={record}
            onRecordCreated={() => void loadRecord()}
          />
        </>
      )}

      {showDeleteConfirm && (
        <DeleteConfirmModal
          singularLabel={singularLabel}
          recordName={record.name}
          deleting={deleting}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={handleDeleteCancel}
        />
      )}

      {showConvertModal && (
        <ConvertLeadModal
          leadName={record.name}
          fieldValues={record.fieldValues}
          onConvert={handleConvert}
          onClose={closeConvertModal}
          converting={converting}
          error={convertError}
        />
      )}
    </div>
  );
}
