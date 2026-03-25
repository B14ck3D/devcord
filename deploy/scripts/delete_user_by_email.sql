-- psql "$DATABASE_URL" -v email='adres@domena' -f delete_user_by_email.sql
BEGIN;
UPDATE tasks SET assignee_id = NULL WHERE assignee_id = (SELECT id FROM users WHERE email = :'email');
DELETE FROM messages WHERE author_id = (SELECT id FROM users WHERE email = :'email');
DELETE FROM servers WHERE owner_id = (SELECT id FROM users WHERE email = :'email');
DELETE FROM users WHERE email = :'email';
COMMIT;
