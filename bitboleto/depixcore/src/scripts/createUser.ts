/**
 * Script para criar usuários do painel DepixCore.
 *
 * Uso:
 *   npx ts-node src/scripts/createUser.ts "Nome Completo" "email@empresa.com" "senha" [viewer|admin]
 *
 * Exemplos:
 *   npx ts-node src/scripts/createUser.ts "Maria Silva" "maria@contabilidade.com" "minhasenha123"
 *   npx ts-node src/scripts/createUser.ts "João Admin" "joao@empresa.com" "senhaforte" admin
 *
 * Em produção (compilado):
 *   node dist/scripts/createUser.js "Nome" "email@empresa.com" "senha" admin
 */

import 'dotenv/config';
import { createUser } from '../services/authService';
import { prisma } from '../prisma';

async function main() {
  const args = process.argv.slice(2);
  const [name, email, password, role] = args;

  if (!name || !email || !password) {
    console.error('');
    console.error('❌ Uso: npx ts-node src/scripts/createUser.ts "Nome" "email" "senha" [viewer|admin]');
    console.error('');
    console.error('Exemplos:');
    console.error('  npx ts-node src/scripts/createUser.ts "Maria Silva" "maria@empresa.com" "senha123"');
    console.error('  npx ts-node src/scripts/createUser.ts "Admin" "admin@empresa.com" "senha123" admin');
    console.error('');
    process.exit(1);
  }

  const validRoles = ['viewer', 'admin'];
  const userRole = validRoles.includes(role) ? role : 'viewer';

  if (role && !validRoles.includes(role)) {
    console.warn(`⚠️  Role "${role}" inválida. Usando "viewer".`);
  }

  try {
    const user = await createUser(email, name, password, userRole);
    console.log('');
    console.log('✅ Usuário criado com sucesso!');
    console.log(`   ID:    ${user.id}`);
    console.log(`   Nome:  ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role:  ${user.role}`);
    console.log('');
  } catch (err: any) {
    if (err?.code === 'P2002') {
      console.error(`❌ Já existe um usuário com o email: ${email}`);
    } else {
      console.error('❌ Erro ao criar usuário:', err.message || err);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
