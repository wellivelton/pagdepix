import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { JwtPayload } from '../middlewares/jwtMiddleware';

const TOKEN_EXPIRY = '8h';

/**
 * Autentica um usuário com email e senha.
 * Retorna o JWT e os dados do usuário, ou null se inválido.
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ token: string; user: object } | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.active) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado');

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  const token = jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });

  // Atualiza lastLoginAt de forma assíncrona (sem bloquear a resposta)
  prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

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
export async function createUser(
  email: string,
  name: string,
  password: string,
  role: string = 'viewer'
): Promise<{ id: string; email: string; name: string; role: string }> {
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
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
