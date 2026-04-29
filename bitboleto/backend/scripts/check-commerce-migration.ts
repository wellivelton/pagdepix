/**
 * Verifica se a migration do comércio foi aplicada no banco.
 * Usa a mesma conexão do .env (sem mexer em senha).
 * Rodar na pasta backend: npx ts-node scripts/check-commerce-migration.ts
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Verificando estado da migration do comércio...\n');

  // 1) Migration está marcada como aplicada no Prisma?
  const migrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at FROM _prisma_migrations
    WHERE migration_name LIKE '%commerce%'
    ORDER BY finished_at DESC
  `);
  const migrationRegistrada = Array.isArray(migrations) && migrations.length > 0;
  console.log('1. Migration no _prisma_migrations:', migrationRegistrada ? 'SIM' : 'NÃO');
  if (migrationRegistrada) console.log('   ', migrations);

  // 2) Enum Role tem o valor COMMERCE?
  const enumRows = await prisma.$queryRawUnsafe(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'COMMERCE'
  `);
  const enumTemCommerce = Array.isArray(enumRows) && enumRows.length > 0;
  console.log('2. Enum Role tem valor COMMERCE:', enumTemCommerce ? 'SIM' : 'NÃO');

  // 3) Tabela CommercePartner existe?
  const tableRows = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CommercePartner'
  `);
  const tabelaExiste = Array.isArray(tableRows) && tableRows.length > 0;
  console.log('3. Tabela CommercePartner existe:', tabelaExiste ? 'SIM' : 'NÃO');

  console.log('');
  if (enumTemCommerce && tabelaExiste) {
    console.log('>>> Banco OK para cadastro de comerciante.');
  } else {
    console.log('>>> Banco NÃO está pronto. Falta aplicar a migration (enum COMMERCE ou tabela CommercePartner).');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
