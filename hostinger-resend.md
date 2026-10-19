# Registros DNS do Resend — nation47.shop

Mesmo procedimento já usado no `dripderua.store` da Drip de Rua. Domínio
adicionado no Resend em 14/08/2026, região **sa-east-1 (São Paulo)** — a mesma
da Drip. Os valores abaixo são os reais deste domínio, prontos pra colar.

Nada aqui é segredo: registro de DNS é público por definição, qualquer um
consulta. O que é segredo é a API Key, e ela não aparece neste arquivo.

## Situação: já aplicado

Os quatro registros foram colocados na zona em 14/08/2026 pela API da
Hostinger, e conferidos por consulta ao DNS público (8.8.8.8). O passo que
sobra é clicar em **Verify DNS Records** no Resend.

O que segue vale se um dia precisar refazer — na mão, pelo hPanel.

### Se for pela API, duas armadilhas

`PUT /api/dns/v1/zones/{dominio}` com `{"overwrite": true, "zone": [...]}`
**mescla** por nome+tipo; não substitui a zona inteira. Mandar só um registro
não apaga o resto (testado: o `@` e o `www` da loja sobreviveram).

A prioridade do MX vai **dentro do content**, não como campo irmão do `ttl`:

```json
{ "name": "send", "type": "MX", "ttl": 3600,
  "records": [ { "content": "10 feedback-smtp.sa-east-1.amazonses.com." } ] }
```

Com `"priority": 10` do lado do `ttl`, a API responde `500 [DNS:1000] Server
Error` — que não diz nada sobre o campo errado. Foi preciso isolar registro a
registro pra achar.

## Onde colar

hPanel da Hostinger → **Domínios** → `nation47.shop` → **DNS / Nameservers**
→ aba **Registros DNS**.

No campo **Nome**, coloque só a parte antes do domínio (`resend._domainkey`,
`send`). A Hostinger completa o resto sozinha — se você digitar o domínio
inteiro, ela cria `resend._domainkey.nation47.shop.nation47.shop` e nada
verifica.

---

## 1 · DKIM — assina o e-mail e prova que saiu de você

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nome | `resend._domainkey` |
| TTL | deixe o padrão (14400) |

Valor (uma linha só, sem espaços ou quebras):

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDw7fJpDVAzbeH0E8cO13uFs13vqma8jtF91Xndzk2ehOnX5wg0mO1MNfrw0SEaVPyv7C5zA9ToxlcSLGlaon4RHECQS1gxlmAo9om+HWuC+mLYoI9IM7yLZ+Z3P2Q3mJaVLoyT/JXYbhSDas9eCIZtcODfWNuiUhhhylr9rMjMwIDAQAB
```

É o registro mais longo e o que mais dá errado, por quebra de linha no meio na
hora de colar.

---

## 2 · SPF (MX) — recebe os retornos de entrega

| Campo | Valor |
|---|---|
| Tipo | `MX` |
| Nome | `send` |
| Aponta para | `feedback-smtp.sa-east-1.amazonses.com` |
| Prioridade | `10` |
| TTL | padrão |

Este MX fica no subdomínio `send`, não no domínio raiz — ele **não** interfere
com o e-mail que você já recebe no `nation47.shop`, se houver.

---

## 3 · SPF (TXT) — autoriza o envio em seu nome

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nome | `send` |
| Valor | `v=spf1 include:amazonses.com ~all` |
| TTL | padrão |

---

## 4 · DMARC — opcional, mas vale colar

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nome | `_dmarc` |
| Valor | `v=DMARC1; p=none;` |
| TTL | padrão |

A Drip não tem este. Com `p=none` ele não bloqueia nada — só avisa aos
provedores que o domínio tem dono cuidando da reputação, o que ajuda a não
cair em spam. O Resend marca como "recommended".

---

## Depois de salvar

1. Espere a propagação (minutos até algumas horas).
2. Em https://resend.com/domains, clique em **Verify DNS Records**.
3. Quando os 3 ficarem verdes, o envio está liberado.

## E então, no painel da loja

`/admin` → aba **E-mail**:

| Campo | Valor |
|---|---|
| Serviço | **Resend** (servidor e porta se preenchem sozinhos) |
| Usuário | `resend` — é literalmente essa palavra |
| Senha | a **API Key** do Resend (`re_...`) |
| Nome | `Nation 47` |
| E-mail remetente | `contato@nation47.shop` |
| Responder para | `nationsneakers47@gmail.com` |

O remetente **não precisa ser uma caixa de e-mail que existe**. O Resend só
exige que o domínio seja seu; a resposta do cliente vai pro endereço do
"Responder para", que é o Gmail da loja.

Vale criar uma API Key separada chamada `Nation 47` em vez de reusar a da Drip:
se um dia precisar revogar uma, a outra loja continua enviando.

## Cuidado

Não aponte este domínio para nenhuma Cloudflare de terceiro. Foi exatamente
esse passo que tirou o `dripderua.shop` do controle do Gustavo.
