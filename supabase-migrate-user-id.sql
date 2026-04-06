-- Primero ver qué usuarios existen:
SELECT id, email FROM auth.users;

-- Actualizar registros con user_id NULL
-- (voy a reemplazar TU-UUID con el real antes de ejecutar)
UPDATE transactions 
SET user_id = 'TU-UUID-AQUI' 
WHERE user_id IS NULL;

UPDATE budgets 
SET user_id = 'TU-UUID-AQUI' 
WHERE user_id IS NULL;

UPDATE goals 
SET user_id = 'TU-UUID-AQUI' 
WHERE user_id IS NULL;
