// Ponto de entrada da Vercel. Toda requisição de todas as rotas cai aqui (o
// vercel.json manda "/(.*)" para este arquivo), e ele entrega ao MESMO app
// Express que roda localmente e no Render — nada de lógica de loja aqui.
//
// O `export default app` funciona porque a Vercel aceita um handler
// (req, res) do estilo Node, e o app do Express é exatamente isso.
import app from '../src/app.js';

export default app;
