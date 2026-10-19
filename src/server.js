import app from './app.js';
import config from './config.js';

// Entrada para rodar como processo de longa duração (local e Render). Na Vercel
// quem entra é api/index.js, que importa o MESMO app.js — este arquivo não roda
// lá (não há listen num ambiente serverless).
//
// O que antes ficava aqui e saiu: a criação do banco, o abastecimento do
// catálogo e a faxina do diário de acesso. Todos passaram para o app.js, que os
// faz na primeira requisição — na Vercel não existe um boot único onde pendurar
// esse tipo de tarefa.
app.listen(config.port, () => {
  console.log(`${config.lojaNome} — checkout no ar em ${config.appUrl} (porta ${config.port})`);
});
