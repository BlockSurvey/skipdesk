-- Remove everything the e2e suites create, restoring the demo tenant to its seed.
-- Test rows use +1999000xxxx phones and test_call_* / adv_* provider call ids.
-- Apply:  wrangler d1 execute skip-desk-db --remote --file tests/fixtures-teardown.sql

DELETE FROM appointments WHERE customer_phone LIKE '+1999000%' OR business_id='biz_test2';
DELETE FROM leads        WHERE phone          LIKE '+1999000%' OR business_id='biz_test2';
DELETE FROM calls        WHERE provider_call_id LIKE 'adv_%'
                            OR provider_call_id LIKE 'test_call_%'
                            OR caller_number LIKE '+1999000%'
                            OR business_id='biz_test2';
DELETE FROM api_keys           WHERE business_id='biz_test2';
DELETE FROM business_hours     WHERE business_id='biz_test2';
DELETE FROM escalation_contacts WHERE business_id='biz_test2';
DELETE FROM businesses          WHERE id='biz_test2';
