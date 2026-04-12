import { PageLayoutRenderer } from '../../../components/PageLayoutRenderer.js';
import type { BuilderLayout, FieldRef } from '../../../components/builderTypes.js';
import type { ObjectDefinitionDetail } from '../types.js';
import styles from '../PageBuilderPage.module.css';

interface PreviewPaneProps {
  layout: BuilderLayout;
  fields: FieldRef[];
  objectDef: ObjectDefinitionDetail;
  onClose: () => void;
}

export function PreviewPane({ layout, fields, objectDef, onClose }: PreviewPaneProps) {
  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Layout preview"
      data-testid="preview-modal"
    >
      <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <h2 className={styles.previewTitle}>Layout Preview</h2>
          <button
            type="button"
            className={styles.previewClose}
            onClick={onClose}
            aria-label="Close preview"
          >
            &times;
          </button>
        </div>
        <div className={styles.previewBody}>
          <PageLayoutRenderer
            layout={{
              id: layout.id || 'preview',
              objectId: layout.objectId,
              name: layout.name,
              header: layout.header,
              tabs: layout.tabs,
            }}
            record={{
              id: 'preview-record',
              objectId: layout.objectId,
              name: 'Sample Record',
              fieldValues: Object.fromEntries(
                fields.map((f) => [f.apiName, `Sample ${f.label}`]),
              ),
              ownerId: 'preview-user',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              fields: fields.map((f) => ({
                apiName: f.apiName,
                label: f.label,
                fieldType: f.fieldType,
              })),
              relationships: [],
            }}
            fields={fields.map((f) => ({
              apiName: f.apiName,
              label: f.label,
              fieldType: f.fieldType,
            }))}
            objectDef={{
              id: objectDef.id,
              apiName: objectDef.apiName,
              label: objectDef.label,
              pluralLabel: objectDef.pluralLabel,
              isSystem: objectDef.isSystem,
            }}
          />
        </div>
      </div>
    </div>
  );
}
