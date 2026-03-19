import { randomUUID } from 'crypto';
import { pool } from '../db/client.js';
import { logger } from '../lib/logger.js';

// ─── Seed data types ──────────────────────────────────────────────────────────

interface ObjectSeed {
  apiName: string;
  label: string;
  pluralLabel: string;
  description: string;
  icon: string;
  nameFieldApiName?: string;
  nameTemplate?: string;
}

interface FieldSeed {
  objectApiName: string;
  apiName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: Record<string, unknown>;
  sortOrder: number;
}

interface RelationshipSeed {
  sourceApiName: string;
  targetApiName: string;
  relationshipType: string;
  apiName: string;
  label: string;
  reverseLabel: string;
  required: boolean;
}

interface LayoutSeed {
  objectApiName: string;
  name: string;
  layoutType: string;
}

interface LayoutFieldSeed {
  objectApiName: string;
  layoutName: string;
  fieldApiName: string;
  section: number;
  sectionLabel: string | null;
  sortOrder: number;
  width: string;
}

interface LeadConversionMappingSeed {
  leadFieldApiName: string;
  targetObject: string;
  targetFieldApiName: string;
}

// ─── Seed result ──────────────────────────────────────────────────────────────

export interface SeedResult {
  objectsCreated: number;
  objectsSkipped: number;
  fieldsCreated: number;
  fieldsSkipped: number;
  relationshipsCreated: number;
  relationshipsSkipped: number;
  layoutsCreated: number;
  layoutsSkipped: number;
  layoutFieldsCreated: number;
  layoutFieldsSkipped: number;
  leadConversionMappingsCreated: number;
  leadConversionMappingsSkipped: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA — canonical final state after all migrations
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Object definitions (9 system objects) ────────────────────────────────────

const OBJECT_SEEDS: ObjectSeed[] = [
  { apiName: 'account',     label: 'Account',     pluralLabel: 'Accounts',      description: 'Companies and organisations',            icon: 'building',        nameFieldApiName: 'name' },
  { apiName: 'contact',     label: 'Contact',     pluralLabel: 'Contacts',      description: 'People at accounts',                     icon: 'user',            nameTemplate: '{first_name} {last_name}' },
  { apiName: 'lead',        label: 'Lead',        pluralLabel: 'Leads',         description: 'Unqualified prospects',                  icon: 'user-plus',       nameTemplate: '{first_name} {last_name}' },
  { apiName: 'opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', description: 'Deals and sales pipeline',               icon: 'trending-up',     nameFieldApiName: 'name' },
  { apiName: 'activity',    label: 'Activity',    pluralLabel: 'Activities',    description: 'Tasks, calls, meetings, and events',     icon: 'calendar',        nameFieldApiName: 'subject' },
  { apiName: 'next_action', label: 'Next Action', pluralLabel: 'Next Actions',  description: 'Follow-up actions on opportunities',     icon: 'check-circle',    nameFieldApiName: 'title' },
  { apiName: 'agreement',   label: 'Agreement',   pluralLabel: 'Agreements',    description: 'Contracts, proposals, and agreements',   icon: 'file-text',       nameFieldApiName: 'title' },
  { apiName: 'note',        label: 'Note',        pluralLabel: 'Notes',         description: 'Free-text notes linked to any record',   icon: 'message-square',  nameFieldApiName: 'title' },
  { apiName: 'file',        label: 'File',        pluralLabel: 'Files',         description: 'Uploaded documents and attachments',     icon: 'paperclip',       nameFieldApiName: 'filename' },
];

// ─── Field definitions ────────────────────────────────────────────────────────

const ACCOUNT_FIELDS: FieldSeed[] = [
  { objectApiName: 'account', apiName: 'name',          label: 'Account Name',   fieldType: 'text',     required: true,  options: { max_length: 255 }, sortOrder: 1 },
  { objectApiName: 'account', apiName: 'type',          label: 'Type',           fieldType: 'dropdown', required: false, options: { choices: ['Prospect', 'Customer', 'Partner', 'Vendor', 'Other'] }, sortOrder: 2 },
  { objectApiName: 'account', apiName: 'industry',      label: 'Industry',       fieldType: 'dropdown', required: false, options: { choices: ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Real Estate', 'Professional Services', 'Non-Profit', 'Government', 'Other'] }, sortOrder: 3 },
  { objectApiName: 'account', apiName: 'status',        label: 'Status',         fieldType: 'dropdown', required: false, options: { choices: ['Active', 'Inactive', 'Churned'] }, sortOrder: 4 },
  { objectApiName: 'account', apiName: 'website',       label: 'Website',        fieldType: 'url',      required: false, options: {}, sortOrder: 5 },
  { objectApiName: 'account', apiName: 'phone',         label: 'Phone',          fieldType: 'phone',    required: false, options: {}, sortOrder: 6 },
  { objectApiName: 'account', apiName: 'email',         label: 'Email',          fieldType: 'email',    required: false, options: {}, sortOrder: 7 },
  { objectApiName: 'account', apiName: 'address_line1', label: 'Address Line 1', fieldType: 'text',     required: false, options: { max_length: 255 }, sortOrder: 8 },
  { objectApiName: 'account', apiName: 'address_line2', label: 'Address Line 2', fieldType: 'text',     required: false, options: { max_length: 255 }, sortOrder: 9 },
  { objectApiName: 'account', apiName: 'city',          label: 'City',           fieldType: 'text',     required: false, options: { max_length: 100 }, sortOrder: 10 },
  { objectApiName: 'account', apiName: 'region',        label: 'Region',         fieldType: 'text',     required: false, options: { max_length: 100 }, sortOrder: 11 },
  { objectApiName: 'account', apiName: 'postal_code',   label: 'Postal Code',    fieldType: 'text',     required: false, options: { max_length: 20 },  sortOrder: 12 },
  { objectApiName: 'account', apiName: 'country',       label: 'Country',        fieldType: 'text',     required: false, options: { max_length: 100 }, sortOrder: 13 },
  { objectApiName: 'account', apiName: 'annual_revenue', label: 'Annual Revenue', fieldType: 'currency', required: false, options: { min: 0, precision: 2 }, sortOrder: 14 },
  { objectApiName: 'account', apiName: 'employee_count', label: 'Employees',     fieldType: 'number',   required: false, options: { min: 0 }, sortOrder: 15 },
  { objectApiName: 'account', apiName: 'description',   label: 'Description',    fieldType: 'textarea', required: false, options: {}, sortOrder: 16 },
];

const CONTACT_FIELDS: FieldSeed[] = [
  { objectApiName: 'contact', apiName: 'first_name',      label: 'First Name',      fieldType: 'text',     required: true,  options: { max_length: 100 }, sortOrder: 1 },
  { objectApiName: 'contact', apiName: 'last_name',       label: 'Last Name',       fieldType: 'text',     required: true,  options: { max_length: 100 }, sortOrder: 2 },
  { objectApiName: 'contact', apiName: 'email',           label: 'Email',           fieldType: 'email',    required: false, options: {}, sortOrder: 3 },
  { objectApiName: 'contact', apiName: 'phone',           label: 'Phone',           fieldType: 'phone',    required: false, options: {}, sortOrder: 4 },
  { objectApiName: 'contact', apiName: 'mobile',          label: 'Mobile',          fieldType: 'phone',    required: false, options: {}, sortOrder: 5 },
  { objectApiName: 'contact', apiName: 'job_title',       label: 'Job Title',       fieldType: 'text',     required: false, options: { max_length: 200 }, sortOrder: 6 },
  { objectApiName: 'contact', apiName: 'department',      label: 'Department',      fieldType: 'text',     required: false, options: { max_length: 200 }, sortOrder: 7 },
  { objectApiName: 'contact', apiName: 'status',          label: 'Status',          fieldType: 'dropdown', required: false, options: { choices: ['Active', 'Inactive', 'Do Not Contact'] }, sortOrder: 8 },
  { objectApiName: 'contact', apiName: 'linkedin_url',    label: 'LinkedIn',        fieldType: 'url',      required: false, options: {}, sortOrder: 9 },
  { objectApiName: 'contact', apiName: 'mailing_address', label: 'Mailing Address', fieldType: 'textarea', required: false, options: {}, sortOrder: 10 },
  { objectApiName: 'contact', apiName: 'date_of_birth',   label: 'Date of Birth',   fieldType: 'date',     required: false, options: {}, sortOrder: 11 },
  { objectApiName: 'contact', apiName: 'description',     label: 'Notes',           fieldType: 'textarea', required: false, options: {}, sortOrder: 12 },
];

const LEAD_FIELDS: FieldSeed[] = [
  { objectApiName: 'lead', apiName: 'first_name',      label: 'First Name',      fieldType: 'text',     required: true,  options: { max_length: 100 }, sortOrder: 1 },
  { objectApiName: 'lead', apiName: 'last_name',       label: 'Last Name',       fieldType: 'text',     required: true,  options: { max_length: 100 }, sortOrder: 2 },
  { objectApiName: 'lead', apiName: 'company',         label: 'Company',         fieldType: 'text',     required: false, options: { max_length: 255 }, sortOrder: 3 },
  { objectApiName: 'lead', apiName: 'email',           label: 'Email',           fieldType: 'email',    required: false, options: {}, sortOrder: 4 },
  { objectApiName: 'lead', apiName: 'phone',           label: 'Phone',           fieldType: 'phone',    required: false, options: {}, sortOrder: 5 },
  { objectApiName: 'lead', apiName: 'job_title',       label: 'Job Title',       fieldType: 'text',     required: false, options: { max_length: 200 }, sortOrder: 6 },
  { objectApiName: 'lead', apiName: 'source',          label: 'Lead Source',     fieldType: 'dropdown', required: false, options: { choices: ['Website', 'Referral', 'Cold Call', 'Email Campaign', 'Social Media', 'Event', 'Advertisement', 'Partner', 'Other'] }, sortOrder: 7 },
  { objectApiName: 'lead', apiName: 'status',          label: 'Status',          fieldType: 'dropdown', required: true,  options: { choices: ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted'] }, sortOrder: 8 },
  { objectApiName: 'lead', apiName: 'rating',          label: 'Rating',          fieldType: 'dropdown', required: false, options: { choices: ['Hot', 'Warm', 'Cold'] }, sortOrder: 9 },
  { objectApiName: 'lead', apiName: 'estimated_value', label: 'Estimated Value', fieldType: 'currency', required: false, options: { min: 0, precision: 2 }, sortOrder: 10 },
  { objectApiName: 'lead', apiName: 'industry',        label: 'Industry',        fieldType: 'dropdown', required: false, options: { choices: ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Real Estate', 'Professional Services', 'Non-Profit', 'Government', 'Other'] }, sortOrder: 11 },
  { objectApiName: 'lead', apiName: 'website',         label: 'Website',         fieldType: 'url',      required: false, options: {}, sortOrder: 12 },
  { objectApiName: 'lead', apiName: 'address',         label: 'Address',         fieldType: 'textarea', required: false, options: {}, sortOrder: 13 },
  { objectApiName: 'lead', apiName: 'description',     label: 'Description',     fieldType: 'textarea', required: false, options: {}, sortOrder: 14 },
];

const OPPORTUNITY_FIELDS: FieldSeed[] = [
  { objectApiName: 'opportunity', apiName: 'name',        label: 'Opportunity Name', fieldType: 'text',     required: true,  options: { max_length: 255 }, sortOrder: 1 },
  { objectApiName: 'opportunity', apiName: 'stage',       label: 'Stage',            fieldType: 'dropdown', required: true,  options: { choices: ['Prospecting', 'Qualification', 'Needs Analysis', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'] }, sortOrder: 2 },
  { objectApiName: 'opportunity', apiName: 'value',       label: 'Value',            fieldType: 'currency', required: false, options: { min: 0, precision: 2 }, sortOrder: 3 },
  { objectApiName: 'opportunity', apiName: 'close_date',  label: 'Close Date',       fieldType: 'date',     required: false, options: {}, sortOrder: 4 },
  { objectApiName: 'opportunity', apiName: 'probability', label: 'Probability (%)',  fieldType: 'number',   required: false, options: { min: 0, max: 100 }, sortOrder: 5 },
  { objectApiName: 'opportunity', apiName: 'source',      label: 'Source',           fieldType: 'dropdown', required: false, options: { choices: ['Website', 'Referral', 'Cold Call', 'Email Campaign', 'Social Media', 'Event', 'Advertisement', 'Partner', 'Inbound Lead', 'Other'] }, sortOrder: 6 },
  { objectApiName: 'opportunity', apiName: 'type',        label: 'Type',             fieldType: 'dropdown', required: false, options: { choices: ['New Business', 'Existing Business', 'Renewal', 'Upsell'] }, sortOrder: 7 },
  { objectApiName: 'opportunity', apiName: 'next_step',   label: 'Next Step',        fieldType: 'text',     required: false, options: { max_length: 500 }, sortOrder: 8 },
  { objectApiName: 'opportunity', apiName: 'description', label: 'Description',      fieldType: 'textarea', required: false, options: {}, sortOrder: 9 },
  { objectApiName: 'opportunity', apiName: 'lost_reason', label: 'Lost Reason',      fieldType: 'dropdown', required: false, options: { choices: ['Price', 'Competitor', 'No Budget', 'No Decision', 'Timing', 'Feature Gap', 'Other'] }, sortOrder: 10 },
];

const ACTIVITY_FIELDS: FieldSeed[] = [
  { objectApiName: 'activity', apiName: 'subject',          label: 'Subject',         fieldType: 'text',     required: true,  options: { max_length: 500 }, sortOrder: 1 },
  { objectApiName: 'activity', apiName: 'type',             label: 'Type',            fieldType: 'dropdown', required: true,  options: { choices: ['Call', 'Email', 'Meeting', 'Task', 'Demo', 'Follow-up', 'Other'] }, sortOrder: 2 },
  { objectApiName: 'activity', apiName: 'status',           label: 'Status',          fieldType: 'dropdown', required: true,  options: { choices: ['Not Started', 'In Progress', 'Completed', 'Deferred', 'Cancelled'] }, sortOrder: 3 },
  { objectApiName: 'activity', apiName: 'priority',         label: 'Priority',        fieldType: 'dropdown', required: false, options: { choices: ['High', 'Medium', 'Low'] }, sortOrder: 4 },
  { objectApiName: 'activity', apiName: 'due_date',         label: 'Due Date',        fieldType: 'datetime', required: false, options: {}, sortOrder: 5 },
  { objectApiName: 'activity', apiName: 'completed_date',   label: 'Completed Date',  fieldType: 'datetime', required: false, options: {}, sortOrder: 6 },
  { objectApiName: 'activity', apiName: 'duration_minutes', label: 'Duration (mins)', fieldType: 'number',   required: false, options: { min: 0 }, sortOrder: 7 },
  { objectApiName: 'activity', apiName: 'description',      label: 'Description',     fieldType: 'textarea', required: false, options: {}, sortOrder: 8 },
  { objectApiName: 'activity', apiName: 'outcome',          label: 'Outcome',         fieldType: 'textarea', required: false, options: {}, sortOrder: 9 },
];

const NEXT_ACTION_FIELDS: FieldSeed[] = [
  { objectApiName: 'next_action', apiName: 'title',       label: 'Title',       fieldType: 'text',     required: true,  options: { max_length: 500 }, sortOrder: 1 },
  { objectApiName: 'next_action', apiName: 'due_date',    label: 'Due Date',    fieldType: 'date',     required: true,  options: {}, sortOrder: 2 },
  { objectApiName: 'next_action', apiName: 'priority',    label: 'Priority',    fieldType: 'dropdown', required: false, options: { choices: ['High', 'Medium', 'Low'] }, sortOrder: 3 },
  { objectApiName: 'next_action', apiName: 'status',      label: 'Status',      fieldType: 'dropdown', required: true,  options: { choices: ['Pending', 'In Progress', 'Completed', 'Skipped'] }, sortOrder: 4 },
  { objectApiName: 'next_action', apiName: 'assigned_to', label: 'Assigned To', fieldType: 'text',     required: false, options: { max_length: 255 }, sortOrder: 5 },
  { objectApiName: 'next_action', apiName: 'description', label: 'Description', fieldType: 'textarea', required: false, options: {}, sortOrder: 6 },
];

const AGREEMENT_FIELDS: FieldSeed[] = [
  { objectApiName: 'agreement', apiName: 'title',        label: 'Title',              fieldType: 'text',     required: true,  options: { max_length: 500 }, sortOrder: 1 },
  { objectApiName: 'agreement', apiName: 'type',         label: 'Type',               fieldType: 'dropdown', required: false, options: { choices: ['Contract', 'Proposal', 'Quote', 'SLA', 'NDA', 'SOW', 'Other'] }, sortOrder: 2 },
  { objectApiName: 'agreement', apiName: 'status',       label: 'Status',             fieldType: 'dropdown', required: true,  options: { choices: ['Draft', 'Sent', 'Under Review', 'Signed', 'Expired', 'Cancelled'] }, sortOrder: 3 },
  { objectApiName: 'agreement', apiName: 'start_date',   label: 'Start Date',         fieldType: 'date',     required: false, options: {}, sortOrder: 4 },
  { objectApiName: 'agreement', apiName: 'end_date',     label: 'End Date',           fieldType: 'date',     required: false, options: {}, sortOrder: 5 },
  { objectApiName: 'agreement', apiName: 'value',        label: 'Value',              fieldType: 'currency', required: false, options: { min: 0, precision: 2 }, sortOrder: 6 },
  { objectApiName: 'agreement', apiName: 'renewal_date', label: 'Renewal Date',       fieldType: 'date',     required: false, options: {}, sortOrder: 7 },
  { objectApiName: 'agreement', apiName: 'terms',        label: 'Terms & Conditions', fieldType: 'textarea', required: false, options: {}, sortOrder: 8 },
  { objectApiName: 'agreement', apiName: 'description',  label: 'Description',        fieldType: 'textarea', required: false, options: {}, sortOrder: 9 },
];

const NOTE_FIELDS: FieldSeed[] = [
  { objectApiName: 'note', apiName: 'title',    label: 'Title',    fieldType: 'text',     required: true,  options: { max_length: 500 }, sortOrder: 1 },
  { objectApiName: 'note', apiName: 'body',     label: 'Body',     fieldType: 'textarea', required: true,  options: {}, sortOrder: 2 },
  { objectApiName: 'note', apiName: 'category', label: 'Category', fieldType: 'dropdown', required: false, options: { choices: ['General', 'Meeting Notes', 'Phone Call', 'Decision', 'Action Item', 'Important'] }, sortOrder: 3 },
];

const FILE_FIELDS: FieldSeed[] = [
  { objectApiName: 'file', apiName: 'filename',    label: 'Filename',       fieldType: 'text',     required: true,  options: { max_length: 500 }, sortOrder: 1 },
  { objectApiName: 'file', apiName: 'file_url',    label: 'File URL',       fieldType: 'url',      required: true,  options: {}, sortOrder: 2 },
  { objectApiName: 'file', apiName: 'category',    label: 'Category',       fieldType: 'dropdown', required: false, options: { choices: ['Document', 'Spreadsheet', 'Presentation', 'Image', 'Contract', 'Proposal', 'Invoice', 'Other'] }, sortOrder: 3 },
  { objectApiName: 'file', apiName: 'file_size',   label: 'File Size (KB)', fieldType: 'number',   required: false, options: { min: 0 }, sortOrder: 4 },
  { objectApiName: 'file', apiName: 'description', label: 'Description',    fieldType: 'textarea', required: false, options: {}, sortOrder: 5 },
];

const ALL_FIELD_SEEDS: FieldSeed[] = [
  ...ACCOUNT_FIELDS,
  ...CONTACT_FIELDS,
  ...LEAD_FIELDS,
  ...OPPORTUNITY_FIELDS,
  ...ACTIVITY_FIELDS,
  ...NEXT_ACTION_FIELDS,
  ...AGREEMENT_FIELDS,
  ...NOTE_FIELDS,
  ...FILE_FIELDS,
];

// ─── Relationship definitions ─────────────────────────────────────────────────

const RELATIONSHIP_SEEDS: RelationshipSeed[] = [
  { sourceApiName: 'opportunity', targetApiName: 'account',     relationshipType: 'lookup', apiName: 'opportunity_account',     label: 'Account',       reverseLabel: 'Opportunities', required: false },
  { sourceApiName: 'opportunity', targetApiName: 'contact',     relationshipType: 'lookup', apiName: 'opportunity_contact',     label: 'Primary Contact', reverseLabel: 'Opportunities', required: false },
  { sourceApiName: 'contact',     targetApiName: 'account',     relationshipType: 'lookup', apiName: 'contact_account',         label: 'Account',       reverseLabel: 'Contacts',      required: false },
  { sourceApiName: 'activity',    targetApiName: 'account',     relationshipType: 'lookup', apiName: 'activity_account',        label: 'Account',       reverseLabel: 'Activities',    required: false },
  { sourceApiName: 'activity',    targetApiName: 'contact',     relationshipType: 'lookup', apiName: 'activity_contact',        label: 'Contact',       reverseLabel: 'Activities',    required: false },
  { sourceApiName: 'activity',    targetApiName: 'opportunity', relationshipType: 'lookup', apiName: 'activity_opportunity',    label: 'Opportunity',   reverseLabel: 'Activities',    required: false },
  { sourceApiName: 'next_action', targetApiName: 'opportunity', relationshipType: 'lookup', apiName: 'next_action_opportunity', label: 'Opportunity',   reverseLabel: 'Next Actions',  required: true },
  { sourceApiName: 'agreement',   targetApiName: 'account',     relationshipType: 'lookup', apiName: 'agreement_account',       label: 'Account',       reverseLabel: 'Agreements',    required: true },
  { sourceApiName: 'agreement',   targetApiName: 'opportunity', relationshipType: 'lookup', apiName: 'agreement_opportunity',   label: 'Opportunity',   reverseLabel: 'Agreements',    required: false },
  { sourceApiName: 'note',        targetApiName: 'account',     relationshipType: 'lookup', apiName: 'note_account',            label: 'Account',       reverseLabel: 'Notes',         required: false },
  { sourceApiName: 'note',        targetApiName: 'contact',     relationshipType: 'lookup', apiName: 'note_contact',            label: 'Contact',       reverseLabel: 'Notes',         required: false },
  { sourceApiName: 'note',        targetApiName: 'opportunity', relationshipType: 'lookup', apiName: 'note_opportunity',        label: 'Opportunity',   reverseLabel: 'Notes',         required: false },
  { sourceApiName: 'file',        targetApiName: 'account',     relationshipType: 'lookup', apiName: 'file_account',            label: 'Account',       reverseLabel: 'Files',         required: false },
  { sourceApiName: 'file',        targetApiName: 'contact',     relationshipType: 'lookup', apiName: 'file_contact',            label: 'Contact',       reverseLabel: 'Files',         required: false },
  { sourceApiName: 'file',        targetApiName: 'opportunity', relationshipType: 'lookup', apiName: 'file_opportunity',        label: 'Opportunity',   reverseLabel: 'Files',         required: false },
  { sourceApiName: 'file',        targetApiName: 'agreement',   relationshipType: 'lookup', apiName: 'file_agreement',          label: 'Agreement',     reverseLabel: 'Files',         required: false },
];

// ─── Layout definitions ───────────────────────────────────────────────────────

const LAYOUT_SEEDS: LayoutSeed[] = [
  { objectApiName: 'account',     name: 'Default form',  layoutType: 'form' },
  { objectApiName: 'account',     name: 'Default list',  layoutType: 'list' },
  { objectApiName: 'contact',     name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'contact',     name: 'List View',     layoutType: 'list' },
  { objectApiName: 'lead',        name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'lead',        name: 'List View',     layoutType: 'list' },
  { objectApiName: 'opportunity', name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'opportunity', name: 'List View',     layoutType: 'list' },
  { objectApiName: 'activity',    name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'activity',    name: 'List View',     layoutType: 'list' },
  { objectApiName: 'next_action', name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'next_action', name: 'List View',     layoutType: 'list' },
  { objectApiName: 'agreement',   name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'agreement',   name: 'List View',     layoutType: 'list' },
  { objectApiName: 'note',        name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'note',        name: 'List View',     layoutType: 'list' },
  { objectApiName: 'file',        name: 'Default Form',  layoutType: 'form' },
  { objectApiName: 'file',        name: 'List View',     layoutType: 'list' },
];

// ─── Layout field assignments ─────────────────────────────────────────────────

const LAYOUT_FIELD_SEEDS: LayoutFieldSeed[] = [
  // ── Account "Default form" ────────────────────────────────────────────
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'name',           section: 0, sectionLabel: 'Details',      sortOrder: 1,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'type',           section: 0, sectionLabel: 'Details',      sortOrder: 2,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'industry',       section: 0, sectionLabel: 'Details',      sortOrder: 3,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'status',         section: 0, sectionLabel: 'Details',      sortOrder: 4,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'website',        section: 1, sectionLabel: 'Contact info', sortOrder: 5,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'phone',          section: 1, sectionLabel: 'Contact info', sortOrder: 6,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'email',          section: 1, sectionLabel: 'Contact info', sortOrder: 7,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'address_line1',  section: 2, sectionLabel: 'Address',      sortOrder: 8,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'address_line2',  section: 2, sectionLabel: 'Address',      sortOrder: 9,  width: 'full' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'city',           section: 2, sectionLabel: 'Address',      sortOrder: 10, width: 'half' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'region',         section: 2, sectionLabel: 'Address',      sortOrder: 11, width: 'half' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'postal_code',    section: 2, sectionLabel: 'Address',      sortOrder: 12, width: 'half' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'country',        section: 2, sectionLabel: 'Address',      sortOrder: 13, width: 'half' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'annual_revenue', section: 3, sectionLabel: 'Additional',   sortOrder: 14, width: 'half' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'employee_count', section: 3, sectionLabel: 'Additional',   sortOrder: 15, width: 'half' },
  { objectApiName: 'account', layoutName: 'Default form', fieldApiName: 'description',    section: 3, sectionLabel: 'Additional',   sortOrder: 16, width: 'full' },
  // ── Account "Default list" ────────────────────────────────────────────
  { objectApiName: 'account', layoutName: 'Default list', fieldApiName: 'name',     section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'account', layoutName: 'Default list', fieldApiName: 'type',     section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'account', layoutName: 'Default list', fieldApiName: 'industry', section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'account', layoutName: 'Default list', fieldApiName: 'status',   section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },
  { objectApiName: 'account', layoutName: 'Default list', fieldApiName: 'phone',    section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },
  { objectApiName: 'account', layoutName: 'Default list', fieldApiName: 'email',    section: 0, sectionLabel: null, sortOrder: 6, width: 'full' },

  // ── Contact "Default Form" ────────────────────────────────────────────
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'first_name',      section: 0, sectionLabel: 'Personal',     sortOrder: 1,  width: 'half' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'last_name',       section: 0, sectionLabel: 'Personal',     sortOrder: 2,  width: 'half' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'email',           section: 0, sectionLabel: 'Personal',     sortOrder: 3,  width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'phone',           section: 0, sectionLabel: 'Personal',     sortOrder: 4,  width: 'half' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'mobile',          section: 0, sectionLabel: 'Personal',     sortOrder: 5,  width: 'half' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'job_title',       section: 1, sectionLabel: 'Professional', sortOrder: 6,  width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'department',      section: 1, sectionLabel: 'Professional', sortOrder: 7,  width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'linkedin_url',    section: 1, sectionLabel: 'Professional', sortOrder: 8,  width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'status',          section: 2, sectionLabel: 'Other',        sortOrder: 9,  width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'date_of_birth',   section: 2, sectionLabel: 'Other',        sortOrder: 10, width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'mailing_address', section: 2, sectionLabel: 'Other',        sortOrder: 11, width: 'full' },
  { objectApiName: 'contact', layoutName: 'Default Form', fieldApiName: 'description',     section: 2, sectionLabel: 'Other',        sortOrder: 12, width: 'full' },
  // ── Contact "List View" ───────────────────────────────────────────────
  { objectApiName: 'contact', layoutName: 'List View', fieldApiName: 'first_name', section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'contact', layoutName: 'List View', fieldApiName: 'last_name',  section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'contact', layoutName: 'List View', fieldApiName: 'email',      section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'contact', layoutName: 'List View', fieldApiName: 'phone',      section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },
  { objectApiName: 'contact', layoutName: 'List View', fieldApiName: 'job_title',  section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },
  { objectApiName: 'contact', layoutName: 'List View', fieldApiName: 'status',     section: 0, sectionLabel: null, sortOrder: 6, width: 'full' },

  // ── Lead "Default Form" ───────────────────────────────────────────────
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'first_name',      section: 0, sectionLabel: 'Contact Info',  sortOrder: 1,  width: 'half' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'last_name',       section: 0, sectionLabel: 'Contact Info',  sortOrder: 2,  width: 'half' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'email',           section: 0, sectionLabel: 'Contact Info',  sortOrder: 3,  width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'phone',           section: 0, sectionLabel: 'Contact Info',  sortOrder: 4,  width: 'half' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'job_title',       section: 0, sectionLabel: 'Contact Info',  sortOrder: 5,  width: 'half' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'company',         section: 1, sectionLabel: 'Company',       sortOrder: 6,  width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'industry',        section: 1, sectionLabel: 'Company',       sortOrder: 7,  width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'website',         section: 1, sectionLabel: 'Company',       sortOrder: 8,  width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'source',          section: 2, sectionLabel: 'Lead Details',  sortOrder: 9,  width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'status',          section: 2, sectionLabel: 'Lead Details',  sortOrder: 10, width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'rating',          section: 2, sectionLabel: 'Lead Details',  sortOrder: 11, width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'estimated_value', section: 2, sectionLabel: 'Lead Details',  sortOrder: 12, width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'address',         section: 3, sectionLabel: 'Other',         sortOrder: 13, width: 'full' },
  { objectApiName: 'lead', layoutName: 'Default Form', fieldApiName: 'description',     section: 3, sectionLabel: 'Other',         sortOrder: 14, width: 'full' },
  // ── Lead "List View" ──────────────────────────────────────────────────
  { objectApiName: 'lead', layoutName: 'List View', fieldApiName: 'first_name', section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'lead', layoutName: 'List View', fieldApiName: 'last_name',  section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'lead', layoutName: 'List View', fieldApiName: 'company',    section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'lead', layoutName: 'List View', fieldApiName: 'status',     section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },
  { objectApiName: 'lead', layoutName: 'List View', fieldApiName: 'rating',     section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },
  { objectApiName: 'lead', layoutName: 'List View', fieldApiName: 'source',     section: 0, sectionLabel: null, sortOrder: 6, width: 'full' },

  // ── Opportunity "Default Form" ────────────────────────────────────────
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'name',        section: 0, sectionLabel: 'Deal Info', sortOrder: 1,  width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'stage',       section: 0, sectionLabel: 'Deal Info', sortOrder: 2,  width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'value',       section: 0, sectionLabel: 'Deal Info', sortOrder: 3,  width: 'half' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'probability', section: 0, sectionLabel: 'Deal Info', sortOrder: 4,  width: 'half' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'close_date',  section: 0, sectionLabel: 'Deal Info', sortOrder: 5,  width: 'half' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'type',        section: 0, sectionLabel: 'Deal Info', sortOrder: 6,  width: 'half' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'source',      section: 1, sectionLabel: 'Source',    sortOrder: 7,  width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'next_step',   section: 1, sectionLabel: 'Source',    sortOrder: 8,  width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'description', section: 2, sectionLabel: 'Details',   sortOrder: 9,  width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'Default Form', fieldApiName: 'lost_reason', section: 2, sectionLabel: 'Details',   sortOrder: 10, width: 'full' },
  // ── Opportunity "List View" ───────────────────────────────────────────
  { objectApiName: 'opportunity', layoutName: 'List View', fieldApiName: 'name',        section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'List View', fieldApiName: 'stage',       section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'List View', fieldApiName: 'value',       section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'List View', fieldApiName: 'close_date',  section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'List View', fieldApiName: 'probability', section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },
  { objectApiName: 'opportunity', layoutName: 'List View', fieldApiName: 'source',      section: 0, sectionLabel: null, sortOrder: 6, width: 'full' },

  // ── Activity "Default Form" ───────────────────────────────────────────
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'subject',          section: 0, sectionLabel: 'Details', sortOrder: 1, width: 'full' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'type',             section: 0, sectionLabel: 'Details', sortOrder: 2, width: 'half' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'status',           section: 0, sectionLabel: 'Details', sortOrder: 3, width: 'half' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'priority',         section: 0, sectionLabel: 'Details', sortOrder: 4, width: 'half' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'due_date',         section: 0, sectionLabel: 'Details', sortOrder: 5, width: 'half' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'completed_date',   section: 0, sectionLabel: 'Details', sortOrder: 6, width: 'half' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'duration_minutes', section: 0, sectionLabel: 'Details', sortOrder: 7, width: 'half' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'description',      section: 1, sectionLabel: 'Notes',   sortOrder: 8, width: 'full' },
  { objectApiName: 'activity', layoutName: 'Default Form', fieldApiName: 'outcome',          section: 1, sectionLabel: 'Notes',   sortOrder: 9, width: 'full' },
  // ── Activity "List View" ──────────────────────────────────────────────
  { objectApiName: 'activity', layoutName: 'List View', fieldApiName: 'subject',  section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'activity', layoutName: 'List View', fieldApiName: 'type',     section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'activity', layoutName: 'List View', fieldApiName: 'status',   section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'activity', layoutName: 'List View', fieldApiName: 'priority', section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },
  { objectApiName: 'activity', layoutName: 'List View', fieldApiName: 'due_date', section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },

  // ── Next Action "Default Form" ────────────────────────────────────────
  { objectApiName: 'next_action', layoutName: 'Default Form', fieldApiName: 'title',       section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'next_action', layoutName: 'Default Form', fieldApiName: 'due_date',    section: 0, sectionLabel: null, sortOrder: 2, width: 'half' },
  { objectApiName: 'next_action', layoutName: 'Default Form', fieldApiName: 'priority',    section: 0, sectionLabel: null, sortOrder: 3, width: 'half' },
  { objectApiName: 'next_action', layoutName: 'Default Form', fieldApiName: 'status',      section: 0, sectionLabel: null, sortOrder: 4, width: 'half' },
  { objectApiName: 'next_action', layoutName: 'Default Form', fieldApiName: 'assigned_to', section: 0, sectionLabel: null, sortOrder: 5, width: 'half' },
  { objectApiName: 'next_action', layoutName: 'Default Form', fieldApiName: 'description', section: 0, sectionLabel: null, sortOrder: 6, width: 'full' },
  // ── Next Action "List View" ───────────────────────────────────────────
  { objectApiName: 'next_action', layoutName: 'List View', fieldApiName: 'title',    section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'next_action', layoutName: 'List View', fieldApiName: 'due_date', section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'next_action', layoutName: 'List View', fieldApiName: 'priority', section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'next_action', layoutName: 'List View', fieldApiName: 'status',   section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },

  // ── Agreement "Default Form" ──────────────────────────────────────────
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'title',        section: 0, sectionLabel: 'Agreement details', sortOrder: 1, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'type',         section: 0, sectionLabel: 'Agreement details', sortOrder: 2, width: 'half' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'status',       section: 0, sectionLabel: 'Agreement details', sortOrder: 3, width: 'half' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'value',        section: 0, sectionLabel: 'Agreement details', sortOrder: 4, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'start_date',   section: 1, sectionLabel: 'Dates',             sortOrder: 5, width: 'half' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'end_date',     section: 1, sectionLabel: 'Dates',             sortOrder: 6, width: 'half' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'renewal_date', section: 1, sectionLabel: 'Dates',             sortOrder: 7, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'terms',        section: 2, sectionLabel: 'Terms',             sortOrder: 8, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'Default Form', fieldApiName: 'description',  section: 2, sectionLabel: 'Terms',             sortOrder: 9, width: 'full' },
  // ── Agreement "List View" ─────────────────────────────────────────────
  { objectApiName: 'agreement', layoutName: 'List View', fieldApiName: 'title',      section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'List View', fieldApiName: 'type',       section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'List View', fieldApiName: 'status',     section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'List View', fieldApiName: 'start_date', section: 0, sectionLabel: null, sortOrder: 4, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'List View', fieldApiName: 'end_date',   section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },
  { objectApiName: 'agreement', layoutName: 'List View', fieldApiName: 'value',      section: 0, sectionLabel: null, sortOrder: 6, width: 'full' },

  // ── Note "Default Form" ───────────────────────────────────────────────
  { objectApiName: 'note', layoutName: 'Default Form', fieldApiName: 'title',    section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'note', layoutName: 'Default Form', fieldApiName: 'category', section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'note', layoutName: 'Default Form', fieldApiName: 'body',     section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
  // ── Note "List View" ──────────────────────────────────────────────────
  { objectApiName: 'note', layoutName: 'List View', fieldApiName: 'title',    section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'note', layoutName: 'List View', fieldApiName: 'category', section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },

  // ── File "Default Form" ───────────────────────────────────────────────
  { objectApiName: 'file', layoutName: 'Default Form', fieldApiName: 'filename',    section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'file', layoutName: 'Default Form', fieldApiName: 'file_url',    section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'file', layoutName: 'Default Form', fieldApiName: 'category',    section: 0, sectionLabel: null, sortOrder: 3, width: 'half' },
  { objectApiName: 'file', layoutName: 'Default Form', fieldApiName: 'file_size',   section: 0, sectionLabel: null, sortOrder: 4, width: 'half' },
  { objectApiName: 'file', layoutName: 'Default Form', fieldApiName: 'description', section: 0, sectionLabel: null, sortOrder: 5, width: 'full' },
  // ── File "List View" ──────────────────────────────────────────────────
  { objectApiName: 'file', layoutName: 'List View', fieldApiName: 'filename',  section: 0, sectionLabel: null, sortOrder: 1, width: 'full' },
  { objectApiName: 'file', layoutName: 'List View', fieldApiName: 'category',  section: 0, sectionLabel: null, sortOrder: 2, width: 'full' },
  { objectApiName: 'file', layoutName: 'List View', fieldApiName: 'file_size', section: 0, sectionLabel: null, sortOrder: 3, width: 'full' },
];

// ─── Lead conversion mappings ─────────────────────────────────────────────────

const LEAD_CONVERSION_MAPPING_SEEDS: LeadConversionMappingSeed[] = [
  // Lead → Account
  { leadFieldApiName: 'company',  targetObject: 'account', targetFieldApiName: 'name' },
  { leadFieldApiName: 'industry', targetObject: 'account', targetFieldApiName: 'industry' },
  { leadFieldApiName: 'website',  targetObject: 'account', targetFieldApiName: 'website' },
  { leadFieldApiName: 'phone',    targetObject: 'account', targetFieldApiName: 'phone' },
  { leadFieldApiName: 'email',    targetObject: 'account', targetFieldApiName: 'email' },
  { leadFieldApiName: 'address',  targetObject: 'account', targetFieldApiName: 'address_line1' },
  // Lead → Contact
  { leadFieldApiName: 'first_name', targetObject: 'contact', targetFieldApiName: 'first_name' },
  { leadFieldApiName: 'last_name',  targetObject: 'contact', targetFieldApiName: 'last_name' },
  { leadFieldApiName: 'email',      targetObject: 'contact', targetFieldApiName: 'email' },
  { leadFieldApiName: 'phone',      targetObject: 'contact', targetFieldApiName: 'phone' },
  { leadFieldApiName: 'job_title',  targetObject: 'contact', targetFieldApiName: 'job_title' },
  // Lead → Opportunity
  { leadFieldApiName: 'company',         targetObject: 'opportunity', targetFieldApiName: 'name' },
  { leadFieldApiName: 'estimated_value', targetObject: 'opportunity', targetFieldApiName: 'value' },
  { leadFieldApiName: 'source',          targetObject: 'opportunity', targetFieldApiName: 'source' },
  { leadFieldApiName: 'description',     targetObject: 'opportunity', targetFieldApiName: 'description' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

interface QueryClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Seeds all default CRM objects, fields, relationships, layouts, and lead
 * conversion mappings for a tenant.
 *
 * - Idempotent: safe to call multiple times; existing rows are skipped.
 * - Wrapped in a single database transaction.
 * - Logs progress (created vs skipped counts).
 *
 * @param tenantId - The tenant this seed data belongs to.
 * @param ownerId - The owner/tenant identifier (e.g. Descope user ID or 'SYSTEM').
 */
export async function seedDefaultObjects(tenantId: string, ownerId: string): Promise<SeedResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await seedWithClient(client, tenantId, ownerId);
    await client.query('COMMIT');

    logger.info(
      {
        tenantId,
        ownerId,
        objectsCreated: result.objectsCreated,
        objectsSkipped: result.objectsSkipped,
        fieldsCreated: result.fieldsCreated,
        fieldsSkipped: result.fieldsSkipped,
        relationshipsCreated: result.relationshipsCreated,
        relationshipsSkipped: result.relationshipsSkipped,
        layoutsCreated: result.layoutsCreated,
        layoutsSkipped: result.layoutsSkipped,
        layoutFieldsCreated: result.layoutFieldsCreated,
        layoutFieldsSkipped: result.layoutFieldsSkipped,
        leadConversionMappingsCreated: result.leadConversionMappingsCreated,
        leadConversionMappingsSkipped: result.leadConversionMappingsSkipped,
      },
      'Default objects seeded',
    );

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inner implementation that runs against an already-connected client.
 * Exported for testing and for callers that manage their own transaction.
 */
export async function seedWithClient(
  client: QueryClient,
  tenantId: string,
  ownerId: string,
): Promise<SeedResult> {
  const result: SeedResult = {
    objectsCreated: 0,
    objectsSkipped: 0,
    fieldsCreated: 0,
    fieldsSkipped: 0,
    relationshipsCreated: 0,
    relationshipsSkipped: 0,
    layoutsCreated: 0,
    layoutsSkipped: 0,
    layoutFieldsCreated: 0,
    layoutFieldsSkipped: 0,
    leadConversionMappingsCreated: 0,
    leadConversionMappingsSkipped: 0,
  };

  // Step 1: Seed object definitions
  const objectIdMap = await seedObjects(client, tenantId, ownerId, result);

  // Step 2: Seed field definitions
  const fieldIdMap = await seedFields(client, tenantId, objectIdMap, result);

  // Step 2b: Update name_field_id and name_template on object definitions
  await seedNameFieldConfig(client, objectIdMap, fieldIdMap);

  // Step 3: Seed relationship definitions
  await seedRelationships(client, tenantId, objectIdMap, result);

  // Step 4: Seed layout definitions
  const layoutIdMap = await seedLayouts(client, tenantId, objectIdMap, result);

  // Step 5: Seed layout fields
  await seedLayoutFields(client, tenantId, fieldIdMap, layoutIdMap, result);

  // Step 6: Seed lead conversion mappings
  await seedLeadConversionMappings(client, tenantId, result);

  return result;
}

// ─── Step helpers ─────────────────────────────────────────────────────────────

async function seedObjects(
  client: QueryClient,
  tenantId: string,
  ownerId: string,
  result: SeedResult,
): Promise<Map<string, string>> {
  const objectIdMap = new Map<string, string>();

  for (const obj of OBJECT_SEEDS) {
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO object_definitions (id, api_name, label, plural_label, description, icon, is_system, owner_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
       ON CONFLICT (tenant_id, api_name) DO NOTHING
       RETURNING id`,
      [id, obj.apiName, obj.label, obj.pluralLabel, obj.description, obj.icon, ownerId, tenantId],
    );

    if (rows.length > 0) {
      objectIdMap.set(obj.apiName, rows[0].id as string);
      result.objectsCreated++;
    } else {
      result.objectsSkipped++;
    }
  }

  // Fetch IDs for objects that already existed (skipped by ON CONFLICT)
  if (result.objectsSkipped > 0) {
    const { rows } = await client.query(
      `SELECT id, api_name FROM object_definitions WHERE api_name = ANY($1) AND tenant_id = $2`,
      [OBJECT_SEEDS.map((o) => o.apiName), tenantId],
    );
    for (const row of rows) {
      objectIdMap.set(row.api_name as string, row.id as string);
    }
  }

  logger.info(
    { created: result.objectsCreated, skipped: result.objectsSkipped },
    'Seeded object definitions',
  );

  return objectIdMap;
}

async function seedFields(
  client: QueryClient,
  tenantId: string,
  objectIdMap: Map<string, string>,
  result: SeedResult,
): Promise<Map<string, string>> {
  const fieldIdMap = new Map<string, string>();

  for (const field of ALL_FIELD_SEEDS) {
    const objectId = objectIdMap.get(field.objectApiName);
    if (!objectId) continue;

    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO field_definitions (id, object_id, api_name, label, field_type, required, options, sort_order, is_system, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
       ON CONFLICT (tenant_id, object_id, api_name) DO NOTHING
       RETURNING id`,
      [id, objectId, field.apiName, field.label, field.fieldType, field.required, JSON.stringify(field.options), field.sortOrder, tenantId],
    );

    const key = `${field.objectApiName}.${field.apiName}`;
    if (rows.length > 0) {
      fieldIdMap.set(key, rows[0].id as string);
      result.fieldsCreated++;
    } else {
      result.fieldsSkipped++;
    }
  }

  // Fetch IDs for fields that already existed
  if (result.fieldsSkipped > 0) {
    const { rows } = await client.query(
      `SELECT fd.id, od.api_name AS object_api_name, fd.api_name
       FROM field_definitions fd
       JOIN object_definitions od ON fd.object_id = od.id
       WHERE od.api_name = ANY($1) AND fd.tenant_id = $2`,
      [OBJECT_SEEDS.map((o) => o.apiName), tenantId],
    );
    for (const row of rows) {
      const key = `${row.object_api_name}.${row.api_name}`;
      fieldIdMap.set(key, row.id as string);
    }
  }

  logger.info(
    { created: result.fieldsCreated, skipped: result.fieldsSkipped },
    'Seeded field definitions',
  );

  return fieldIdMap;
}

async function seedNameFieldConfig(
  client: QueryClient,
  objectIdMap: Map<string, string>,
  fieldIdMap: Map<string, string>,
): Promise<void> {
  for (const obj of OBJECT_SEEDS) {
    const objectId = objectIdMap.get(obj.apiName);
    if (!objectId) continue;

    if (obj.nameFieldApiName) {
      const fieldKey = `${obj.apiName}.${obj.nameFieldApiName}`;
      const fieldId = fieldIdMap.get(fieldKey);
      if (fieldId) {
        await client.query(
          `UPDATE object_definitions SET name_field_id = $1 WHERE id = $2 AND (name_field_id IS NULL OR name_field_id != $1)`,
          [fieldId, objectId],
        );
      }
    }

    if (obj.nameTemplate) {
      await client.query(
        `UPDATE object_definitions SET name_template = $1 WHERE id = $2 AND (name_template IS NULL OR name_template != $1)`,
        [obj.nameTemplate, objectId],
      );
    }
  }

  logger.info('Updated name_field_id and name_template on object definitions');
}

async function seedRelationships(
  client: QueryClient,
  tenantId: string,
  objectIdMap: Map<string, string>,
  result: SeedResult,
): Promise<void> {
  for (const rel of RELATIONSHIP_SEEDS) {
    const sourceObjectId = objectIdMap.get(rel.sourceApiName);
    const targetObjectId = objectIdMap.get(rel.targetApiName);
    if (!sourceObjectId || !targetObjectId) continue;

    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO relationship_definitions (id, source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, source_object_id, api_name) DO NOTHING
       RETURNING id`,
      [id, sourceObjectId, targetObjectId, rel.relationshipType, rel.apiName, rel.label, rel.reverseLabel, rel.required, tenantId],
    );

    if (rows.length > 0) {
      result.relationshipsCreated++;
    } else {
      result.relationshipsSkipped++;
    }
  }

  logger.info(
    { created: result.relationshipsCreated, skipped: result.relationshipsSkipped },
    'Seeded relationship definitions',
  );
}

async function seedLayouts(
  client: QueryClient,
  tenantId: string,
  objectIdMap: Map<string, string>,
  result: SeedResult,
): Promise<Map<string, string>> {
  const layoutIdMap = new Map<string, string>();

  for (const layout of LAYOUT_SEEDS) {
    const objectId = objectIdMap.get(layout.objectApiName);
    if (!objectId) continue;

    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO layout_definitions (id, object_id, name, layout_type, is_default, tenant_id)
       VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (tenant_id, object_id, name) DO NOTHING
       RETURNING id`,
      [id, objectId, layout.name, layout.layoutType, tenantId],
    );

    const key = `${layout.objectApiName}.${layout.name}`;
    if (rows.length > 0) {
      layoutIdMap.set(key, rows[0].id as string);
      result.layoutsCreated++;
    } else {
      result.layoutsSkipped++;
    }
  }

  // Fetch IDs for layouts that already existed
  if (result.layoutsSkipped > 0) {
    const { rows } = await client.query(
      `SELECT ld.id, od.api_name AS object_api_name, ld.name
       FROM layout_definitions ld
       JOIN object_definitions od ON ld.object_id = od.id
       WHERE od.api_name = ANY($1) AND ld.tenant_id = $2`,
      [OBJECT_SEEDS.map((o) => o.apiName), tenantId],
    );
    for (const row of rows) {
      const key = `${row.object_api_name}.${row.name}`;
      layoutIdMap.set(key, row.id as string);
    }
  }

  logger.info(
    { created: result.layoutsCreated, skipped: result.layoutsSkipped },
    'Seeded layout definitions',
  );

  return layoutIdMap;
}

async function seedLayoutFields(
  client: QueryClient,
  tenantId: string,
  fieldIdMap: Map<string, string>,
  layoutIdMap: Map<string, string>,
  result: SeedResult,
): Promise<void> {
  for (const lf of LAYOUT_FIELD_SEEDS) {
    const layoutKey = `${lf.objectApiName}.${lf.layoutName}`;
    const fieldKey = `${lf.objectApiName}.${lf.fieldApiName}`;

    const layoutId = layoutIdMap.get(layoutKey);
    const fieldId = fieldIdMap.get(fieldKey);

    if (!layoutId || !fieldId) continue;

    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO layout_fields (id, layout_id, field_id, section, section_label, sort_order, width, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, layout_id, field_id) DO NOTHING
       RETURNING id`,
      [id, layoutId, fieldId, lf.section, lf.sectionLabel, lf.sortOrder, lf.width, tenantId],
    );

    if (rows.length > 0) {
      result.layoutFieldsCreated++;
    } else {
      result.layoutFieldsSkipped++;
    }
  }

  logger.info(
    { created: result.layoutFieldsCreated, skipped: result.layoutFieldsSkipped },
    'Seeded layout fields',
  );
}

async function seedLeadConversionMappings(
  client: QueryClient,
  tenantId: string,
  result: SeedResult,
): Promise<void> {
  for (const mapping of LEAD_CONVERSION_MAPPING_SEEDS) {
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO lead_conversion_mappings (id, lead_field_api_name, target_object, target_field_api_name, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, lead_field_api_name, target_object, target_field_api_name) DO NOTHING
       RETURNING id`,
      [id, mapping.leadFieldApiName, mapping.targetObject, mapping.targetFieldApiName, tenantId],
    );

    if (rows.length > 0) {
      result.leadConversionMappingsCreated++;
    } else {
      result.leadConversionMappingsSkipped++;
    }
  }

  logger.info(
    { created: result.leadConversionMappingsCreated, skipped: result.leadConversionMappingsSkipped },
    'Seeded lead conversion mappings',
  );
}

// ─── Exported constants for testing ───────────────────────────────────────────

export const SEED_COUNTS = {
  objects: OBJECT_SEEDS.length,
  fields: ALL_FIELD_SEEDS.length,
  relationships: RELATIONSHIP_SEEDS.length,
  layouts: LAYOUT_SEEDS.length,
  layoutFields: LAYOUT_FIELD_SEEDS.length,
  leadConversionMappings: LEAD_CONVERSION_MAPPING_SEEDS.length,
} as const;
