"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const authService_1 = require("../services/authService");
const prisma_1 = require("../prisma");
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
        const user = await (0, authService_1.createUser)(email, name, password, userRole);
        console.log('');
        console.log('✅ Usuário criado com sucesso!');
        console.log(`   ID:    ${user.id}`);
        console.log(`   Nome:  ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role:  ${user.role}`);
        console.log('');
    }
    catch (err) {
        if (err?.code === 'P2002') {
            console.error(`❌ Já existe um usuário com o email: ${email}`);
        }
        else {
            console.error('❌ Erro ao criar usuário:', err.message || err);
        }
        process.exit(1);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=createUser.js.map