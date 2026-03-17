-- Migration: 011_seed_default_object_definitions
-- Description: Seeds all 9 default CRM object definitions. Uses ON CONFLICT
--              to skip objects that already exist (account and opportunity were
--              created in 006_metadata_schema), making the migration idempotent.

INSERT INTO object_definitions (api_name, label, plural_label, description, icon, is_system, owner_id)
VALUES
    ('account',     'Account',     'Accounts',      'Companies and organisations',                'building',        true, 'SYSTEM'),
    ('contact',     'Contact',     'Contacts',      'People at accounts',                        'user',            true, 'SYSTEM'),
    ('lead',        'Lead',        'Leads',         'Unqualified prospects',                     'user-plus',       true, 'SYSTEM'),
    ('opportunity', 'Opportunity', 'Opportunities', 'Deals and sales pipeline',                  'trending-up',     true, 'SYSTEM'),
    ('activity',    'Activity',    'Activities',    'Tasks, calls, meetings, and events',        'calendar',        true, 'SYSTEM'),
    ('next_action', 'Next Action', 'Next Actions',  'Follow-up actions on opportunities',        'check-circle',    true, 'SYSTEM'),
    ('agreement',   'Agreement',   'Agreements',    'Contracts, proposals, and agreements',       'file-text',       true, 'SYSTEM'),
    ('note',        'Note',        'Notes',         'Free-text notes linked to any record',      'message-square',  true, 'SYSTEM'),
    ('file',        'File',        'Files',         'Uploaded documents and attachments',         'paperclip',       true, 'SYSTEM')
ON CONFLICT (api_name) DO NOTHING;
