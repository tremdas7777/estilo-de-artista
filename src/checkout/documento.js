// Documento do comprador (CPF/CNPJ) — FONTE DA VERDADE da validação.
//
// O checkout no navegador repete esta mesma conta só para avisar antes de
// enviar; quem decide se o pedido nasce é este arquivo, chamado pelo
// POST /api/orders em src/routes/checkoutApi.js.
//
// Por que não basta contar 11 dígitos: um CPF digitado errado atravessa a tela
// inteira, o pedido é criado, e só quebra na hora de gerar a cobrança no
// gateway — que devolve um erro genérico, sem dizer qual campo está errado.
// É venda perdida sem o dono da loja nunca saber o motivo.

const digitos = (v) => String(v ?? '').replace(/\D/g, '');

// CPF: 11 dígitos e os dois verificadores conferindo (módulo 11).
// As sequências repetidas (111.111.111-11 e afins) fecham a conta do módulo 11
// mas a Receita não emite nenhuma delas — por isso a recusa explícita.
export function cpfValido(v) {
  const d = digitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const verificador = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return verificador(9) === Number(d[9]) && verificador(10) === Number(d[10]);
}

// CNPJ: mesma ideia, com os pesos 5..2 / 9..2 do algoritmo da Receita.
export function cnpjValido(v) {
  const d = digitos(v);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const verificador = (ate) => {
    let soma = 0;
    let peso = ate - 7;
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return verificador(12) === Number(d[12]) && verificador(13) === Number(d[13]);
}

// O que o checkout aceita no campo "CPF". Quem compra como empresa manda CNPJ,
// e barrar 14 dígitos ali seria recusar a venda de um cliente legítimo.
export function documentoValido(v) {
  const d = digitos(v);
  if (d.length === 14) return cnpjValido(d);
  return cpfValido(d);
}

export default { cpfValido, cnpjValido, documentoValido };
