# Supabase sem pontos do Lovable (via Secrets + projeto grátis)

Não precisa gastar créditos do chat. Use **seu** Supabase free + Secrets do projeto.

## 1) Crie o banco (grátis)

1. Abra https://supabase.com → New project  
2. SQL Editor → New query → cole o arquivo `supabase/setup-all.sql` deste repo → Run  
3. Em **Project Settings → API**, copie:
   - Project URL  
   - `anon` `public` key  
   - `service_role` `secret` key (só para o passo 3)

## 2) Valores públicos no `.env` (Git / editor Lovable)

Crie/edite `.env` no projeto (Lovable **quer** esse arquivo commitado para `VITE_*`):

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...anon...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_PUBLISHABLE_KEY=eyJ...anon...
LOJA_API_URL=https://estilo-de-artista.vercel.app
```

**Não** coloque a `service_role` no `.env` do Git.

## 3) Secrets no Lovable (sem chat / sem pontos)

No editor: **More → Cloud → Secrets → Add secret**

| Nome | Valor |
|------|--------|
| `ADMIN_PASSWORD` | senha que você vai digitar em `/admin` |

### Opção A (recomendada): conectar Supabase

**More → Cloud → “Already have a Supabase project? Connect it here”**  
Isso injeta sozinho `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (prefixo `SUPABASE_` é reservado — você **não** cria esses nomes na mão).

Não usa “Enable Cloud” do Lovable (que consome Cloud credits). Usa o **seu** projeto no supabase.com.

### Opção B: sem conectar (aliases nos Secrets)

Se o Connect estiver bloqueado, adicione nos Secrets:

| Nome | Valor |
|------|--------|
| `ESTILO_SB_URL` | mesma URL do projeto |
| `ESTILO_SB_ANON_KEY` | chave `anon` |
| `ESTILO_SB_SERVICE_ROLE_KEY` | chave `service_role` |
| `ADMIN_PASSWORD` | senha do painel |

O app já lê esses aliases.

## 4) Testar

1. Publique / atualize o preview  
2. Abra `/admin` → só a senha de `ADMIN_PASSWORD`  
3. Em **Integrações**, configure o gateway Pix  

## Pix / HyperCash / Meta / UTMify

Depois do admin abrir, as chaves desses serviços entram pelo próprio painel (salvas em `private_settings` no Supabase) — não precisam ir nos Secrets do Lovable.
