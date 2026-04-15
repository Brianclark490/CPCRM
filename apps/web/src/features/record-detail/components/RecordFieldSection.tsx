import { FieldRenderer } from '../../../components/FieldRenderer.js';
import { FieldInput } from '../../../components/FieldInput.js';
import { StageFieldRenderer } from '../../../components/StageFieldRenderer.js';
import type { RecordDetail, LayoutFieldWithMetadata, LayoutSection } from '../types.js';
import styles from '../RecordDetailPage.module.css';

interface ViewFieldProps {
  fieldApiName: string;
  fieldLabel: string;
  fieldType: string;
  width: string;
  fieldOptions?: Record<string, unknown>;
  record: RecordDetail;
  objectId: string;
  objectApiName: string;
}

function ViewField({
  fieldApiName,
  fieldLabel,
  fieldType,
  width,
  fieldOptions,
  record,
  objectApiName,
}: ViewFieldProps) {
  const field = record.fields.find((f) => f.apiName === fieldApiName);
  const value = field?.value ?? record.fieldValues[fieldApiName] ?? null;
  const isEmpty = value === null || value === undefined || value === '';
  const isPipelineManaged = fieldOptions?.pipeline_managed === true;

  return (
    <div
      key={fieldApiName}
      className={`${styles.fieldGroup} ${width === 'full' ? styles.fieldFull : ''}`}
    >
      <span className={styles.fieldLabel}>{fieldLabel}</span>
      {isPipelineManaged ? (
        <span className={styles.fieldValue}>
          <StageFieldRenderer
            objectApiName={objectApiName}
            objectId={record.objectId}
            pipelineId={record.pipelineId ?? null}
            recordId={record.id}
            currentStageId={record.currentStageId ?? null}
            value={value}
            editing={false}
          />
        </span>
      ) : isEmpty ? (
        <span className={styles.fieldEmpty}>—</span>
      ) : (
        <span className={styles.fieldValue}>
          <FieldRenderer fieldType={fieldType} value={value} />
        </span>
      )}
    </div>
  );
}

interface EditFieldProps {
  field: LayoutFieldWithMetadata;
  record: RecordDetail;
  objectApiName: string;
  formValues: Record<string, unknown>;
  submitting: boolean;
  onFieldChange: (fieldApiName: string, value: unknown) => void;
  onStageChanged: (result: {
    currentStageId: string;
    fieldValues: Record<string, unknown>;
  }) => void;
}

function EditField({
  field,
  record,
  objectApiName,
  formValues,
  submitting,
  onFieldChange,
  onStageChanged,
}: EditFieldProps) {
  const value = field.fieldType === 'formula'
    ? (record.fields.find((f) => f.apiName === field.fieldApiName)?.value ?? null)
    : (formValues[field.fieldApiName] ?? null);

  const isPipelineManaged = field.fieldOptions?.pipeline_managed === true;

  if (isPipelineManaged) {
    return (
      <div
        key={field.fieldApiName}
        className={`${styles.formField} ${field.width === 'full' ? styles.formFieldFull : ''}`}
      >
        <label className={styles.label} htmlFor={`field-${field.fieldApiName}`}>
          {field.fieldLabel}
        </label>
        <StageFieldRenderer
          objectApiName={objectApiName}
          objectId={record.objectId}
          pipelineId={record.pipelineId ?? null}
          recordId={record.id}
          currentStageId={record.currentStageId ?? null}
          value={value}
          editing={true}
          disabled={submitting}
          onStageChanged={onStageChanged}
        />
      </div>
    );
  }

  return (
    <div
      key={field.fieldApiName}
      className={`${styles.formField} ${field.width === 'full' ? styles.formFieldFull : ''}`}
    >
      <label className={styles.label} htmlFor={`field-${field.fieldApiName}`}>
        {field.fieldLabel}
        {field.fieldRequired && field.fieldType !== 'formula' && <span className={styles.required}>*</span>}
      </label>
      <FieldInput
        fieldType={field.fieldType}
        value={value}
        onChange={(v) => onFieldChange(field.fieldApiName, v)}
        disabled={submitting}
        required={field.fieldRequired}
        options={field.fieldOptions}
        id={`field-${field.fieldApiName}`}
        name={field.fieldApiName}
        label={field.fieldLabel}
      />
    </div>
  );
}

interface RecordFieldSectionProps {
  sections: LayoutSection[];
  record: RecordDetail;
  objectApiName: string;
  editing: boolean;
  formValues: Record<string, unknown>;
  submitting: boolean;
  onFieldChange: (fieldApiName: string, value: unknown) => void;
  onStageChanged: (result: {
    currentStageId: string;
    fieldValues: Record<string, unknown>;
  }) => void;
  metaFooter?: (sectionIndex: number) => React.ReactNode;
}

export function RecordFieldSection({
  sections,
  record,
  objectApiName,
  editing,
  formValues,
  submitting,
  onFieldChange,
  onStageChanged,
  metaFooter,
}: RecordFieldSectionProps) {
  if (editing) {
    return (
      <>
        {sections.map((section, sIdx) => (
          <div key={sIdx} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>{section.label}</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.formGrid}>
                {section.fields.map((field) => (
                  <EditField
                    key={field.fieldApiName}
                    field={field}
                    record={record}
                    objectApiName={objectApiName}
                    formValues={formValues}
                    submitting={submitting}
                    onFieldChange={onFieldChange}
                    onStageChanged={onStageChanged}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {sections.map((section, sIdx) => (
        <div key={sIdx} className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{section.label}</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.fieldsGrid}>
              {section.fields.map((field) => (
                <ViewField
                  key={field.fieldApiName}
                  fieldApiName={field.fieldApiName}
                  fieldLabel={field.fieldLabel}
                  fieldType={field.fieldType}
                  width={field.width}
                  fieldOptions={field.fieldOptions}
                  record={record}
                  objectId={record.objectId}
                  objectApiName={objectApiName}
                />
              ))}
            </div>
          </div>
          {metaFooter?.(sIdx)}
        </div>
      ))}
    </>
  );
}
