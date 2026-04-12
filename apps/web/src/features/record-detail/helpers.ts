import type { PageLayout } from '../../components/layoutTypes.js';
import type {
  LayoutFieldWithMetadata,
  LayoutSection,
  RecordField,
} from './types.js';

export function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0][0] ?? '?').toUpperCase();
}

export function groupFieldsBySection(
  layoutFields: LayoutFieldWithMetadata[],
): LayoutSection[] {
  const sectionMap = new Map<number, LayoutSection>();

  for (const field of layoutFields) {
    let section = sectionMap.get(field.section);
    if (!section) {
      section = {
        label: field.sectionLabel ?? `Section ${field.section + 1}`,
        fields: [],
      };
      sectionMap.set(field.section, section);
    }
    section.fields.push(field);
  }

  // Sort sections by section number, and fields within by sortOrder
  const sections = Array.from(sectionMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, section]) => ({
      ...section,
      fields: [...section.fields].sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  return sections;
}

/**
 * Derives edit-mode sections from a PageLayout.
 * Extracts field components from each tab/section, preserving the layout
 * ordering and section grouping. Falls back to record.fields metadata.
 */
export function sectionsFromPageLayout(
  layout: PageLayout,
  recordFields: RecordField[],
): LayoutSection[] {
  const sections: LayoutSection[] = [];

  for (const tab of layout.tabs) {
    for (const section of tab.sections) {
      const fields: LayoutFieldWithMetadata[] = [];
      let sortOrder = 0;

      for (const component of section.components) {
        if (component.type === 'field' && component.config.fieldApiName) {
          const apiName = component.config.fieldApiName;
          const recordField = recordFields.find(
            (f) => f.apiName === apiName,
          );
          const span = typeof component.config.span === 'number'
            ? component.config.span
            : 1;

          fields.push({
            fieldId: component.id,
            fieldApiName: apiName,
            fieldLabel: recordField?.label ?? apiName,
            fieldType: recordField?.fieldType ?? 'text',
            fieldRequired: false,
            fieldOptions: recordField?.options ?? {},
            sortOrder,
            section: 0,
            sectionLabel: section.label,
            width: span >= (section.columns || 2) ? 'full' : 'half',
          });
          sortOrder += 1;
        }
      }

      if (fields.length > 0) {
        sections.push({ label: section.label, fields });
      }
    }
  }

  return sections;
}
