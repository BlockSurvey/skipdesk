-- Test fixtures: a SECOND tenant + API keys, used by tests/e2e-advanced.mjs to
-- prove multi-tenant isolation, the API-key auth path, and scope enforcement.
-- key_hash values are SHA-256 hex of the raw keys:
--   sk_test2_full     → full scopes
--   sk_test2_readonly → info:read only
-- Apply:  wrangler d1 execute skip-desk-db --remote --file tests/fixtures-setup.sql

INSERT OR IGNORE INTO businesses (id,name,slug,timezone,locale,status,created_at)
VALUES ('biz_test2','Test Tenant Two','test2','Asia/Kolkata','en','active','2026-06-19T00:00:00.000Z');

INSERT OR IGNORE INTO business_hours (id,business_id,day_of_week,open_time,close_time,closed) VALUES
 ('bh2_1','biz_test2',1,'09:00','17:00',0),('bh2_2','biz_test2',2,'09:00','17:00',0),
 ('bh2_3','biz_test2',3,'09:00','17:00',0),('bh2_4','biz_test2',4,'09:00','17:00',0),
 ('bh2_5','biz_test2',5,'09:00','17:00',0);

INSERT OR IGNORE INTO escalation_contacts (id,business_id,name,role,phone,priority,created_at)
VALUES ('esc2','biz_test2','T2 Manager','Manager','+910000000002',0,'2026-06-19T00:00:00.000Z');

INSERT OR IGNORE INTO api_keys (id,business_id,name,key_hash,scopes,created_at) VALUES
 ('key2_full','biz_test2','full',
  'ccdc14711202b2a9b5b995a19e691d5fff48a719294313df0adc205b830cefbf',
  '["leads:read","leads:write","appointments:read","appointments:write","calls:read","calls:write","info:read"]',
  '2026-06-19T00:00:00.000Z'),
 ('key2_ro','biz_test2','readonly',
  'd459f8fe13d4c377e7815143600c89a1b24a7fa9d2c517e323ea7dee0a2e865e',
  '["info:read"]',
  '2026-06-19T00:00:00.000Z');
