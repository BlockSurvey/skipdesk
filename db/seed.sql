-- Skip Desk demo seed: one sacrificial demo tenant so the MCP URL is testable
-- with no API key. Real businesses self-register via POST /register (which mints
-- proper UUIDs + a unique key). All primary keys here are UUIDv4, matching what
-- the app generates at runtime. Idempotent via INSERT OR IGNORE on fixed PKs.
--   wrangler d1 execute skip-desk-db --remote --file db/seed.sql
-- NOTE: the demo business id below is mirrored by DEMO_BUSINESS_ID in the worker.

-- tenant root --------------------------------------------------------------
INSERT OR IGNORE INTO businesses (id, name, slug, timezone, locale, status, created_at)
VALUES ('d53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'Sunrise Multispecialty Clinic', 'sunrise-clinic',
        'Asia/Kolkata', 'en', 'active', '2026-06-19T00:00:00.000Z');

-- open hours (Mon–Fri 09:00–18:00, Sat 09:00–13:00, Sun closed) -------------
INSERT OR IGNORE INTO business_hours (id, business_id, day_of_week, open_time, close_time, closed) VALUES
  ('6e3ee901-174c-4b4d-9f17-f2ea93e2994b', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 0, NULL,    NULL,    1),
  ('12757984-a8ac-481e-95fb-98873cc05548', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 1, '09:00', '18:00', 0),
  ('2e7e6581-612e-43dd-8c94-d78b985a7ea9', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 2, '09:00', '18:00', 0),
  ('37697abf-7509-43f1-9b5a-182da644c5be', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 3, '09:00', '18:00', 0),
  ('bbecb015-c111-4098-aa4f-33b9528334d3', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 4, '09:00', '18:00', 0),
  ('e2dbd8f6-e3cf-4da5-bd60-dd593242affb', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 5, '09:00', '18:00', 0),
  ('cc913c2c-727c-40aa-9dc9-ebe6eda728bd', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 6, '09:00', '13:00', 0);

-- FAQs the agent can read out ----------------------------------------------
INSERT OR IGNORE INTO business_faqs (id, business_id, question, answer, tags, is_active, created_at, updated_at) VALUES
  ('0728b289-805c-4ee3-b038-ffbb617c3569', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'What are your hours?',
   'We are open Monday to Friday 9am to 6pm, and Saturday 9am to 1pm. We are closed on Sundays.',
   'hours,timing,open', 1, '2026-06-19T00:00:00.000Z', '2026-06-19T00:00:00.000Z'),
  ('e4d50c4d-48c9-44ac-83d7-28a2ffba5d6c', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'Where are you located?',
   'We are at 12 MG Road, Bengaluru. Parking is available on-site.',
   'location,address,parking', 1, '2026-06-19T00:00:00.000Z', '2026-06-19T00:00:00.000Z'),
  ('fdbb79dc-f2f1-4a5d-a7a7-b5658a07c8c2', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'What services do you offer?',
   'General medicine, pediatrics, dermatology, and routine diagnostics. Specialist consults are by appointment.',
   'services,departments,specialties', 1, '2026-06-19T00:00:00.000Z', '2026-06-19T00:00:00.000Z');

-- escalation contact (the "higher official") -------------------------------
INSERT OR IGNORE INTO escalation_contacts (id, business_id, name, role, phone, email, priority, created_at)
VALUES ('5184c16e-7686-41da-ad57-62a75eead18c', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'Priya Nair', 'Front Office Manager',
        '+919900000000', 'frontoffice@sunrise.example', 0, '2026-06-19T00:00:00.000Z');

-- inbound number → routes calls to this tenant -----------------------------
INSERT OR IGNORE INTO phone_numbers (id, business_id, e164, provider, label, assistant_id, created_at)
VALUES ('ad446980-7f67-44d4-bf0a-391913c76981', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', '+918000000000', 'vapi', 'Main line', NULL, '2026-06-19T00:00:00.000Z');

-- machine API key (placeholder hash — the demo tenant is the no-auth fallback) -
INSERT OR IGNORE INTO api_keys (id, business_id, name, key_hash, scopes, last_used_at, revoked_at, created_at)
VALUES ('08b4c0a8-8222-4da4-847c-b13dd972df1b', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'Demo placeholder', 'unused-demo-uses-no-auth-fallback',
        '["info:read","appointments:read","appointments:write","leads:write","calls:write"]',
        NULL, NULL, '2026-06-19T00:00:00.000Z');

-- dashboard admin user (placeholder password hash) -------------------------
INSERT OR IGNORE INTO users (id, business_id, email, name, role, password_hash, created_at)
VALUES ('29439a99-b051-42ab-a855-08dec9e97b79', 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb', 'admin@sunrise.example', 'Demo Admin', 'admin',
        'REPLACE_WITH_HASHED_PASSWORD', '2026-06-19T00:00:00.000Z');
