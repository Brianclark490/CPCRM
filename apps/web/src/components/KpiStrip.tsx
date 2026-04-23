import type {
  LayoutComponentDef,
  RecordData,
  FieldDefinitionRef,
  ObjectDefinitionRef,
} from './layoutTypes.js';
import { LayoutComponent } from './LayoutComponent.js';
import { evaluateVisibility } from './evaluateVisibility.js';
import styles from './KpiStrip.module.css';

interface KpiStripProps {
  components: LayoutComponentDef[];
  record: RecordData;
  fields: FieldDefinitionRef[];
  objectDef: ObjectDefinitionRef | null;
  onRecordCreated?: () => void;
}

export function KpiStrip({
  components,
  record,
  fields,
  objectDef,
  onRecordCreated,
}: KpiStripProps) {
  const visible = components.filter((c) =>
    evaluateVisibility(c.visibility, record.fieldValues),
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className={styles.kpiStrip} data-testid="kpi-strip">
      {visible.map((comp) => (
        <div key={comp.id} className={styles.kpiItem}>
          <LayoutComponent
            component={comp}
            record={record}
            fields={fields}
            objectDef={objectDef}
            onRecordCreated={onRecordCreated}
          />
        </div>
      ))}
    </div>
  );
}
