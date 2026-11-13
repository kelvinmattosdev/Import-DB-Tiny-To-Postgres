# Import-DB-Tiny-To-Postgres

[![wakatime](https://wakatime.com/badge/user/db4a2800-e564-4201-9406-b98e170a6764/project/99b0a659-2cb2-4641-b244-b49edafffebf.svg)](https://wakatime.com/badge/user/db4a2800-e564-4201-9406-b98e170a6764/project/99b0a659-2cb2-4641-b244-b49edafffebf)

Este repositório tem como objetivo **replicar a base de dados do Tiny ERP em um banco PostgreSQL próprio**, permitindo:

- Consultas mais eficientes.
- Redução do impacto de *rate limit* da API do Tiny.
- Maior flexibilidade para integrações, relatórios e análises internas.

Atualmente o projeto expõe uma **API HTTP** que recebe uma planilha `XLSX` com os produtos, trunca a tabela de destino e insere todos os registros em lotes (*chunks*).

---

## ✨ Funcionalidades

- API `POST /importar-produtos` que:
  - Recebe o **binário da planilha `XLSX`** no corpo da requisição.
  - Aceita o parâmetro opcional `chunkSize` (query string ou header `x-chunk-size`).
  - Valida `chunkSize` e limita a **no máximo 1000** linhas por chunk.
  - Salva a planilha em `temp/produtos.xlsx` (limpando a pasta antes).
  - Normaliza os dados (inclusive numéricos com `,` e `.`).
  - Para SKUs duplicados, mantém o produto com a maior pontuação de completude.
  - Em caso de empate na maior pontuação, mantém os empatados e gera um alerta no terminal.
  - Trunca a tabela `tiny.produtos` e reimporta tudo em lote.
  - Remove o arquivo temporário ao final.
- Inserção em **lotes parametrizados** para melhor performance.
- Tipagem forte em TypeScript, incluindo os modelos de linha da planilha.

---

## 📁 Estrutura do projeto

```text
IMPORT-DB-TINY-TO-POSTGRES/
├─ node_modules/
├─ src/
│  ├─ input/
│  │  └─ produtos.xlsx              # (exemplo / arquivo de teste - opcional)
│  ├─ services/
│  │  ├─ database-psql.service.ts   # Conexão e helpers para PostgreSQL
│  │  ├─ sheet.service.ts           # Leitura e normalização da planilha XLSX
│  │  └─ index.ts                   # Agregador de services
│  └─ main.ts                       # Servidor HTTP + fluxo de importação
├─ .env
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ tsconfig.json
└─ README.md
```

---

## 🔧 Pré-requisitos

- **Node.js** 18+ (idealmente LTS).
- **npm** (ou outro gerenciador compatível).
- **PostgreSQL** 13+ (recomendado).
- Banco de dados `api` já criado (ou o nome que você configurou no `.env`).

---

## ⚙️ Configuração do `.env`

Crie um arquivo `.env` na raiz do projeto com algo assim:

```env
# Banco de dados (DB_DATABASE deve apontar pro banco "api" ou equivalente)
DB_HOST=localhost
DB_PORT=5432
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_DATABASE=api
DB_SSL=false

# Porta da API
API_PORT=3000
```

---

## 🗄️ Criação do schema/tabela no PostgreSQL

Conecte-se ao banco configurado em `DB_DATABASE` (ex.: `api`) e execute:

```sql
-- Garante que o schema tiny existe
CREATE SCHEMA IF NOT EXISTS tiny;

-- Remove a tabela antiga, se existir
DROP TABLE IF EXISTS tiny.produtos CASCADE;

-- Cria a tabela com colunas e tipos "certos"
CREATE TABLE tiny.produtos (
    id                             TEXT PRIMARY KEY,
    codigo_sku                     TEXT,
    descricao                      TEXT,
    unidade                        TEXT,
    classificacao_fiscal           TEXT,
    origem                         TEXT,

    preco                          NUMERIC(15, 2),
    valor_ipi_fixo                 NUMERIC(15, 2),
    observacoes                    TEXT,
    situacao                       TEXT,

    estoque                        NUMERIC(15, 3),
    preco_de_custo                 NUMERIC(15, 2),

    cod_do_fornecedor              TEXT,
    fornecedor                     TEXT,
    localizacao                    TEXT,

    estoque_maximo                 NUMERIC(15, 3),
    estoque_minimo                 NUMERIC(15, 3),

    peso_liquido_kg                NUMERIC(15, 3),
    peso_bruto_kg                  NUMERIC(15, 3),

    gtin_ean                       TEXT,
    gtin_ean_tributavel            TEXT,
    descricao_complementar         TEXT,
    cest                           TEXT,
    codigo_de_enquadramento_ipi    TEXT,

    formato_embalagem              TEXT,
    largura_embalagem              NUMERIC(15, 3),
    altura_embalagem               NUMERIC(15, 3),
    comprimento_embalagem          NUMERIC(15, 3),
    diametro_embalagem             NUMERIC(15, 3),

    tipo_do_produto                TEXT,

    url_imagem_1                   TEXT,
    url_imagem_2                   TEXT,
    url_imagem_3                   TEXT,
    url_imagem_4                   TEXT,
    url_imagem_5                   TEXT,
    url_imagem_6                   TEXT,

    categoria                      TEXT,
    codigo_do_pai                  TEXT,
    variacoes                      TEXT,
    marca                          TEXT,
    garantia                       TEXT,
    sob_encomenda                  TEXT,

    preco_promocional              NUMERIC(15, 2),

    url_imagem_externa_1           TEXT,
    url_imagem_externa_2           TEXT,
    url_imagem_externa_3           TEXT,
    url_imagem_externa_4           TEXT,
    url_imagem_externa_5           TEXT,
    url_imagem_externa_6           TEXT,

    link_do_video                  TEXT,
    titulo_seo                     TEXT,
    descricao_seo                  TEXT,
    palavras_chave_seo             TEXT,
    slug                           TEXT,

    dias_para_preparacao           TEXT,
    controlar_lotes                TEXT,
    unidade_por_caixa              TEXT,

    url_imagem_externa_7           TEXT,
    url_imagem_externa_8           TEXT,
    url_imagem_externa_9           TEXT,
    url_imagem_externa_10          TEXT,

    markup                         NUMERIC(10, 2),

    permitir_inclusao_nas_vendas   TEXT,
    ex_tipi                        TEXT
);
```

---

## 🚀 Como rodar

Instale as dependências:

```bash
npm install
```

Ambiente de desenvolvimento (ts-node-dev):

```bash
npm run dev
```

Build + execução em produção:

```bash
npm run build
npm start
```

O servidor vai subir na porta configurada em `API_PORT` (ou `3000` por padrão).

---

## 🌐 Uso da API

### Health check

```bash
curl http://localhost:3000/
```

Resposta esperada:

```json
{
  "status": "ok",
  "message": "Import-DB-Tiny-To-Postgres API ativa.",
  "endpoint": "/importar-produtos"
}
```

### Importar produtos (upload da planilha)

Endpoint principal:

```http
POST /importar-produtos
```

- **Body**: binário da planilha `.xlsx` (qualquer tamanho; stream direto para disco).
- **Query string opcional**:

  - `chunkSize`: número de linhas por lote (máx. 1000).

- **Headers opcionais**:

  - `x-chunk-size`: alternativa ao `?chunkSize=`.

> Se `chunkSize` não for enviado → usa `1000`.  
> Se `chunkSize` > `1000` → `400 Bad Request`.

#### Exemplo com `curl`

```bash
curl -X POST "http://localhost:3000/importar-produtos?chunkSize=800"   -H "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"   --data-binary "@produtos.xlsx"
```

Resposta (exemplo):

```json
{
  "success": true,
  "message": "Banco de dados atualizado com sucesso.",
  "totalLinhas": 6622,
  "chunkSizeUsado": 800,
  "totalChunks": 9
}
```

### Comportamento interno da importação

1. Salva o arquivo recebido em `temp/produtos.xlsx`.
2. **Apaga qualquer arquivo existente na pasta `temp/` antes** de salvar o novo.
3. Testa a conexão com o banco.
4. Lê todas as linhas da planilha (`sheet.service.ts`).
5. Antes de alterar o banco, agrupa os SKUs duplicados (ignorando espaços nas pontas e diferenças entre maiúsculas/minúsculas) e pontua cada produto:
   - `preco_de_custo` e `estoque`: 1 ponto cada quando maiores que zero;
   - `variacoes`, `categoria`, `gtin_ean`, `cod_do_fornecedor` e `fornecedor`: 1 ponto cada quando preenchidos;
   - `url_imagem_externa_1` até `url_imagem_externa_10`: 1 ponto por URL preenchida.
6. Mantém apenas a maior pontuação de cada SKU; se houver empate na maior nota, mantém todos os empatados e escreve um `ALERTA` no terminal.
7. Dentro de uma transação, executa `TRUNCATE tiny.produtos` e insere as linhas selecionadas.
8. Divide em chunks de até `chunkSize` linhas.
9. Para cada chunk:
   - Normaliza colunas numéricas (`"10,50"`, `"10.50"`, `""` → `10.5`/`null`).
   - Monta um único `INSERT INTO ... VALUES (...), (...), ...` com placeholders.
10. Ao final, remove `temp/produtos.xlsx` e responde a requisição.

---

## ⚠️ Limites e observações

- Não há limite de tamanho de arquivo no código Node; o limite real vem de:
  - espaço em disco,
  - proxy reverso (Nginx, Traefik, Cloudflare etc.),
  - timeouts de rede.
- O `chunkSize` é limitado a **1000** para respeitar o limite de ~65k parâmetros por query do PostgreSQL.
- A importação atual é **full refresh**:
  - sempre trunca a tabela antes,
  - não faz upsert incremental (isso pode ser adicionado depois).

---

## 📜 Licença

Este projeto está licenciado sob a licença **ISC** (veja `package.json` para detalhes).
