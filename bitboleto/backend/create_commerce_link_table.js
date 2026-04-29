/**
 * Script temporário para criar a tabela CommerceLink manualmente
 * Execute: node create_commerce_link_table.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTable() {
  try {
    console.log('Criando tabela CommerceLink...');
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CommerceLink" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "titulo" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "slug" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "CommerceLink_pkey" PRIMARY KEY ("id")
      );
    `);
    
    console.log('✓ Tabela criada');
    
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "CommerceLink_slug_key" ON "CommerceLink"("slug");
    `);
    console.log('✓ Índice único criado');
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "CommerceLink_userId_idx" ON "CommerceLink"("userId");
    `);
    console.log('✓ Índice userId criado');
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "CommerceLink_slug_idx" ON "CommerceLink"("slug");
    `);
    console.log('✓ Índice slug criado');
    
    // Verificar se a constraint já existe antes de criar
    const constraintExists = await prisma.$queryRawUnsafe(`
      SELECT 1 FROM pg_constraint WHERE conname = 'CommerceLink_userId_fkey';
    `);
    
    if (!constraintExists || constraintExists.length === 0) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CommerceLink" 
        ADD CONSTRAINT "CommerceLink_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      console.log('✓ Chave estrangeira criada');
    } else {
      console.log('✓ Chave estrangeira já existe');
    }
    
    console.log('\n✅ Tabela CommerceLink criada com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTable();
