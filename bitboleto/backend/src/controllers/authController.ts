import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

const prisma = new PrismaClient();

export const register = async (req: Request, res: Response) => {
  const { name, email, telegram, password } = req.body;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: "Usuário já existe" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, telegram, passwordHash, role: "USER" },
    });

    res.json({ userId: user.id, message: "Usuário criado com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: "Usuário não encontrado" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ message: "Senha incorreta" });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '8h' }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};
