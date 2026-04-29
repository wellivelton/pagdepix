/**
 * Recalcula custos e receita líquida de todos os eventos já processados.
 *
 * Necessário porque a fórmula foi corrigida:
 *   ANTES: cost = amount × 1% + 0,99  (ERRADO)
 *   AGORA: cost = fee × 1%            (CORRETO)
 *
 * Uso:
 *   cd ~/depixcore
 *   npx ts-node src/scripts/recalculateCosts.ts
 */
import 'dotenv/config';
//# sourceMappingURL=recalculateCosts.d.ts.map