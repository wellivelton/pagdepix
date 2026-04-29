"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = loginUser;
exports.createUser = createUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../prisma");
const TOKEN_EXPIRY = '8h';
/**
 * Autentica um usuário com email e senha.
 * Retorna o JWT e os dados do usuário, ou null se inválido.
 */
async function loginUser(email, password) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
    });
    if (!user || !user.active)
        return null;
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid)
        return null;
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET não configurado');
    const payload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
    };
    const token = jsonwebtoken_1.default.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });
    // Atualiza lastLoginAt de forma assíncrona (sem bloquear a resposta)
    prisma_1.prisma.user
        .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        .catch(() => { });
    return {
        token,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
    };
}
/**
 * Cria um novo usuário no painel.
 * Usado pelo script de criação de usuários (src/scripts/createUser.ts).
 */
async function createUser(email, name, password, role = 'viewer') {
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const user = await prisma_1.prisma.user.create({
        data: {
            email: email.toLowerCase().trim(),
            name: name.trim(),
            passwordHash,
            role,
        },
        select: { id: true, email: true, name: true, role: true },
    });
    return user;
}
//# sourceMappingURL=authService.js.map