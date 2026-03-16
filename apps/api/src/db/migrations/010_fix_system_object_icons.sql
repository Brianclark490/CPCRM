-- Migration: 010_fix_system_object_icons
-- Description: Updates system object icon values from text names to emoji
--              characters so they render correctly in the UI sidebar.

UPDATE object_definitions SET icon = '🏢', updated_at = NOW() WHERE api_name = 'account'     AND icon = 'building';
UPDATE object_definitions SET icon = '💰', updated_at = NOW() WHERE api_name = 'opportunity' AND icon = 'dollar-sign';
