/**
 * Autentica um usuário com email e senha.
 * Retorna o JWT e os dados do usuário, ou null se inválido.
 */
export declare function loginUser(email: string, password: string): Promise<{
    token: string;
    user: object;
} | null>;
/**
 * Cria um novo usuário no painel.
 * Usado pelo script de criação de usuários (src/scripts/createUser.ts).
 */
export declare function createUser(email: string, name: string, password: string, role?: string): Promise<{
    id: string;
    email: string;
    name: string;
    role: string;
}>;
//# sourceMappingURL=authService.d.ts.map