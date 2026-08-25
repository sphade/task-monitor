-- Seed data for local development & staging.
-- Idempotent-ish: safe to re-run on a fresh database only.

-- ── Permissions ─────────────────────────────────────────────────────────
INSERT INTO permissions (name, description, module, created_at, updated_at) VALUES
  ('CAN_VIEW_DASHBOARD',      'View the dashboard',            'DASHBOARD', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_MANAGE_STAFF',        'Create and manage staff',       'HR_SETTINGS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_VIEW_STAFF',          'View staff directory',          'HR_SETTINGS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_ASSIGN_TASKS',        'Create tasks and projects',     'TASKS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_VIEW_TASKS',          'View tasks',                    'TASKS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_UPDATE_TASKS',        'Update any task',               'TASKS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_DELETE_TASKS',        'Delete tasks',                  'TASKS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_VIEW_REPORTS',        'View reports',                  'REPORTS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_CREATE_REPORTS',      'Submit reports',                'REPORTS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_UPDATE_REPORTS',      'Moderate reports',              'REPORTS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_DELETE_REPORTS',      'Delete reports',                'REPORTS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_MANAGE_ROLES',        'Manage roles and permissions',  'ROLES', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_MANAGE_DEPARTMENTS',  'Manage departments',            'DEPARTMENTS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_CREATE_DOCUMENTS',    'Create PRD/SDD documents',      'SYSTEM_CONFIG', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('CAN_VIEW_DOCUMENTS',      'View documents',                'SYSTEM_CONFIG', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- ── Departments ─────────────────────────────────────────────────────────
INSERT INTO departments (name, description, is_active, created_at, updated_at) VALUES
  ('Engineering', 'Product engineering', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('Operations', 'Business operations', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- ── Roles ───────────────────────────────────────────────────────────────
INSERT INTO roles (name, code, description, create_once, parent_id, created_at, updated_at) VALUES
  ('Administrator', 'ADMIN', 'Full access',           1, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('Manager',       'MANAGER', 'Team management',     0, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('Staff',         'STAFF', 'Standard staff access', 0, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- Administrator: everything.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE code = 'ADMIN'), id FROM permissions;

-- Manager: dashboards, tasks, reports, docs; no HR/role management.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE code = 'MANAGER'), id FROM permissions
  WHERE name IN (
    'CAN_VIEW_DASHBOARD','CAN_ASSIGN_TASKS','CAN_VIEW_TASKS','CAN_UPDATE_TASKS',
    'CAN_DELETE_TASKS','CAN_VIEW_REPORTS','CAN_CREATE_REPORTS',
    'CAN_VIEW_STAFF','CAN_CREATE_DOCUMENTS','CAN_VIEW_DOCUMENTS'
  );

-- Staff: view + report on their own work.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE code = 'STAFF'), id FROM permissions
  WHERE name IN (
    'CAN_VIEW_DASHBOARD','CAN_VIEW_TASKS','CAN_UPDATE_TASKS','CAN_VIEW_REPORTS',
    'CAN_CREATE_REPORTS','CAN_VIEW_STAFF','CAN_VIEW_DOCUMENTS'
  );

-- ── Users (password for all seeded accounts: Password123!) ───────────────
INSERT INTO users
  (username, name, email, phone, password_hash, role_id, department_id,
   employee_id, location, is_verified, is_admin, is_superuser,
   performance_score, performance_points, created_at, updated_at)
VALUES
  ('admin',       'Ada Admin',     'admin@orangeinvent.house',   '+2348000000001',
   'pbkdf2$100000$KvQYLbLMbis1sSmmrY5EIg$fqXiFf4yOxlw3n8eEk9bWpj83wLPXsMVNb4lYgYosy4',
   (SELECT id FROM roles WHERE code='ADMIN'),   1, 'OIH-001', 'headquarters', 1, 1, 1, 95.5, 420, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('manager',     'Paul Manager',  'paul@orangeinvent.house',    '+2348000000002',
   'pbkdf2$100000$KvQYLbLMbis1sSmmrY5EIg$fqXiFf4yOxlw3n8eEk9bWpj83wLPXsMVNb4lYgYosy4',
   (SELECT id FROM roles WHERE code='MANAGER'), 1, 'OIH-002', 'remote',       1, 0, 0, 88.0, 310, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('staff.sam',   'Sam Staff',     'sam@orangeinvent.house',     '+2348000000003',
   'pbkdf2$100000$KvQYLbLMbis1sSmmrY5EIg$fqXiFf4yOxlw3n8eEk9bWpj83wLPXsMVNb4lYgYosy4',
   (SELECT id FROM roles WHERE code='STAFF'),   1, 'OIH-003', 'branch_office',1, 0, 0, 76.25,180, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('staff.tola',  'Tola Staff',    'tola@orangeinvent.house',    '+2348000000004',
   'pbkdf2$100000$KvQYLbLMbis1sSmmrY5EIg$fqXiFf4yOxlw3n8eEk9bWpj83wLPXsMVNb4lYgYosy4',
   (SELECT id FROM roles WHERE code='STAFF'),   2, 'OIH-004', 'regional_office',1, 0, 0, 81.5, 210, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- ── Sample project & tasks ──────────────────────────────────────────────
INSERT INTO projects (id, name, description, status, start_date, deadline, created_at, updated_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Mobile Platform',
   'Internal task & reporting tools for iOS and Android.',
   'active', '2026-02-01', '2026-12-31',
   '2026-02-01T09:00:00.000Z', '2026-02-01T09:00:00.000Z');

INSERT INTO tasks
  (project_id, title, description, assigned_to, assigned_by, priority, status,
   started_at, completed_at, deadline, created_at, updated_at)
VALUES
  ((SELECT id FROM projects WHERE name='Mobile Platform'),
   'Set up Expo app skeleton', NULL,
   (SELECT id FROM users WHERE username='staff.sam'),
   (SELECT id FROM users WHERE username='manager'),
   'high', 'completed', '2026-03-01T10:00:00.000Z', '2026-03-05T16:00:00.000Z',
   '2026-03-10', '2026-03-01T09:00:00.000Z', '2026-03-05T16:00:00.000Z'),
  ((SELECT id FROM projects WHERE name='Mobile Platform'),
   'Build dashboard metrics screen', 'Pie chart + priority breakdown.',
   (SELECT id FROM users WHERE username='staff.sam'),
   (SELECT id FROM users WHERE username='manager'),
   'medium', 'in_progress', '2026-08-10T09:00:00.000Z', NULL,
   '2026-09-15', '2026-08-01T09:00:00.000Z', '2026-08-10T09:00:00.000Z'),
  ((SELECT id FROM projects WHERE name='Mobile Platform'),
   'Ship chat module', 'Persistent 1-on-1 chat over Durable Objects.',
   (SELECT id FROM users WHERE username='staff.tola'),
   (SELECT id FROM users WHERE username='admin'),
   'high', 'pending', NULL, NULL,
   '2026-08-20', '2026-07-15T09:00:00.000Z', '2026-07-15T09:00:00.000Z'),
  ((SELECT id FROM projects WHERE name='Mobile Platform'),
   'Audit trail polish', 'Filters and CSV export.',
   (SELECT id FROM users WHERE username='manager'),
   (SELECT id FROM users WHERE username='admin'),
   'low', 'overdue', NULL, NULL,
   '2026-06-30', '2026-06-01T09:00:00.000Z', '2026-07-01T09:00:00.000Z');

-- ── A sample conversation ───────────────────────────────────────────────
INSERT INTO conversations (first_user_id, second_user_id, created_at, updated_at)
  SELECT a.id, b.id, '2026-08-01T12:00:00.000Z', '2026-08-01T12:05:00.000Z'
  FROM users a, users b
  WHERE a.username='manager' AND b.username='staff.sam';

INSERT INTO messages (conversation_id, sender_id, recipient_id, content, status, is_read, created_at, updated_at)
  SELECT c.id, m.id, s.id, 'Morning Sam — how is the metrics screen coming along?', 'read', 1,
         '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
  FROM conversations c
  JOIN users m ON m.username='manager' JOIN users s ON s.username='staff.sam'
  WHERE c.id = (SELECT MIN(id) FROM conversations);

INSERT INTO messages (conversation_id, sender_id, recipient_id, content, status, is_read, created_at, updated_at)
  SELECT c.id, s.id, m.id, 'Charts are done — starting the recent-tasks list now.', 'delivered', 0,
         '2026-08-01T12:05:00.000Z', '2026-08-01T12:05:00.000Z'
  FROM conversations c
  JOIN users m ON m.username='manager' JOIN users s ON s.username='staff.sam'
  WHERE c.id = (SELECT MIN(id) FROM conversations);

-- ── A sample report against the first task ─────────────────────────────
INSERT INTO reports (sender_id, title, status, description, note, parent_task_id, created_at, updated_at)
  SELECT (SELECT id FROM users WHERE username='staff.sam'),
         'Weekly progress', 'done', '', 'App skeleton complete and CI green.',
         (SELECT id FROM tasks WHERE title='Set up Expo app skeleton'),
         '2026-03-05T17:00:00.000Z', '2026-03-05T17:00:00.000Z';
