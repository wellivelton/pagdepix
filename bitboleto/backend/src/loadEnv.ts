/**
 * Carrega .env da pasta backend antes de qualquer outro módulo.
 * Deve ser o primeiro require no server (evita SWAPVERSE_API_URL vazio).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
