// -=<| ./src/main.ts |>=-
import path from 'path';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import * as services from './index.js';
import type { SheetRow } from './services/sheet.service.js';
import { fileURLToPath } from 'url';

// IMPORTS
const { psql, sheet } = services;

// INTERFACE
interface ProdutoRow extends SheetRow {
    id: string;
    codigo_sku: string;
    descricao: string;
    unidade: string;
    classificacao_fiscal: string;
    origem: string;
    preco: number;
    valor_ipi_fixo: number;
    observacoes: string;
    situacao: string;
    estoque: number;
    preco_de_custo: number;
    cod_do_fornecedor: string;
    fornecedor: string;
    localizacao: string;
    estoque_maximo: number;
    estoque_minimo: number;
    peso_liquido_kg: number;
    peso_bruto_kg: number;
    gtin_ean: string;
    gtin_ean_tributavel: string;
    descricao_complementar: string;
    cest: string;
    codigo_de_enquadramento_ipi: string;
    formato_embalagem: string;
    largura_embalagem: number;
    altura_embalagem: number;
    comprimento_embalagem: number;
    diametro_embalagem: number;
    tipo_do_produto: string;
    url_imagem_1: string;
    url_imagem_2: string;
    url_imagem_3: string;
    url_imagem_4: string;
    url_imagem_5: string;
    url_imagem_6: string;
    categoria: string;
    codigo_do_pai: string;
    variacoes: string;
    marca: string;
    garantia: string;
    sob_encomenda: string;
    preco_promocional: number;
    url_imagem_externa_1: string;
    url_imagem_externa_2: string;
    url_imagem_externa_3: string;
    url_imagem_externa_4: string;
    url_imagem_externa_5: string;
    url_imagem_externa_6: string;
    link_do_video: string;
    titulo_seo: string;
    descricao_seo: string;
    palavras_chave_seo: string;
    slug: string;
    dias_para_preparacao: string;
    controlar_lotes: string;
    unidade_por_caixa: string;
    url_imagem_externa_7: string;
    url_imagem_externa_8: string;
    url_imagem_externa_9: string;
    url_imagem_externa_10: string;
    markup: number;
    permitir_inclusao_nas_vendas: string;
    ex_tipi: string;
}

// colunas que serão enviadas pro banco (ordem importa!)
const PRODUTO_COLUMNS: (keyof ProdutoRow)[] = [
    'id',
    'codigo_sku',
    'descricao',
    'unidade',
    'classificacao_fiscal',
    'origem',
    'preco',
    'valor_ipi_fixo',
    'observacoes',
    'situacao',
    'estoque',
    'preco_de_custo',
    'cod_do_fornecedor',
    'fornecedor',
    'localizacao',
    'estoque_maximo',
    'estoque_minimo',
    'peso_liquido_kg',
    'peso_bruto_kg',
    'gtin_ean',
    'gtin_ean_tributavel',
    'descricao_complementar',
    'cest',
    'codigo_de_enquadramento_ipi',
    'formato_embalagem',
    'largura_embalagem',
    'altura_embalagem',
    'comprimento_embalagem',
    'diametro_embalagem',
    'tipo_do_produto',
    'url_imagem_1',
    'url_imagem_2',
    'url_imagem_3',
    'url_imagem_4',
    'url_imagem_5',
    'url_imagem_6',
    'categoria',
    'codigo_do_pai',
    'variacoes',
    'marca',
    'garantia',
    'sob_encomenda',
    'preco_promocional',
    'url_imagem_externa_1',
    'url_imagem_externa_2',
    'url_imagem_externa_3',
    'url_imagem_externa_4',
    'url_imagem_externa_5',
    'url_imagem_externa_6',
    'link_do_video',
    'titulo_seo',
    'descricao_seo',
    'palavras_chave_seo',
    'slug',
    'dias_para_preparacao',
    'controlar_lotes',
    'unidade_por_caixa',
    'url_imagem_externa_7',
    'url_imagem_externa_8',
    'url_imagem_externa_9',
    'url_imagem_externa_10',
    'markup',
    'permitir_inclusao_nas_vendas',
    'ex_tipi'
];

// colunas numéricas no PostgreSQL (NUMERIC / DECIMAL)
const NUMERIC_COLUMNS: (keyof ProdutoRow)[] = [
    'preco',
    'valor_ipi_fixo',
    'estoque',
    'preco_de_custo',
    'estoque_maximo',
    'estoque_minimo',
    'peso_liquido_kg',
    'peso_bruto_kg',
    'largura_embalagem',
    'altura_embalagem',
    'comprimento_embalagem',
    'diametro_embalagem',
    'preco_promocional',
    'markup'
];

const DEFAULT_CHUNK_SIZE = 1000;
const MAX_CHUNK_SIZE = 1000;

// VARS
const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// pasta de temporários: ../temp (na raiz do projeto)
const TEMP_DIR = path.resolve(__dirname, 'temp');
const TEMP_FILE_NAME = 'produtos.xlsx';

// porta da API
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);

/**
 * Normaliza o valor de uma célula da planilha antes de enviar para o banco.
 * - Colunas numéricas: converte string "14,32"/"14.32" -> number; "" -> null
 * - Outras colunas: mantém o valor (mas troca undefined por null)
 */
function normalizeCellValue(
    col: keyof ProdutoRow,
    rawValue: unknown
): unknown {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }

    // Trata string vazia como null
    if (typeof rawValue === 'string' && rawValue.trim() === '') {
        return null;
    }

    // Se não for coluna numérica, só retorna o valor "do jeito que veio"
    if (!NUMERIC_COLUMNS.includes(col)) {
        return rawValue;
    }

    // Colunas numéricas: converte para number
    if (typeof rawValue === 'number') {
        return rawValue;
    }

    const str = String(rawValue).trim();
    if (!str) {
        return null;
    }

    // troca vírgula por ponto, mas mantém pontos existentes
    const normalized = str.replace(',', '.');

    const n = Number(normalized);
    if (Number.isNaN(n)) {
        // não conseguiu converter: manda null
        return null;
    }

    return n;
}

/**
 * Garante que a pasta TEMP existe e apaga qualquer arquivo que já tiver lá.
 * Retorna o caminho completo do arquivo "produtos.xlsx".
 */
async function prepareTempDir(): Promise<string> {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });

    const files = await fs.promises.readdir(TEMP_DIR);
    await Promise.all(
        files.map((name) =>
            fs.promises
                .unlink(path.join(TEMP_DIR, name))
                .catch(() => undefined)
        )
    );

    return path.join(TEMP_DIR, TEMP_FILE_NAME);
}

/**
 * Processa o arquivo XLSX: TRUNCATE na tabela, leitura da planilha e INSERT em chunks.
 */
async function processFile(xlsxPath: string, chunkSize: number) {
    const ok = await psql.conectarAoBanco();
    if (!ok) {
        throw new Error('Não foi possível conectar ao banco de dados.');
    }

    console.log('Limpando tabela tiny.produtos (TRUNCATE)...');
    await psql.manageTables({
        action: 'truncate',
        schema: 'tiny',
        tableName: 'produtos'
    });
    console.log('Tabela tiny.produtos truncada com sucesso.');

    const linhas = sheet.lerPlanilhaComoObjetos<ProdutoRow>(xlsxPath);
    console.log('Total de linhas encontradas na planilha:', linhas.length);

    const total = linhas.length;
    let chunkIndex = 0;

    for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize, total);
        const chunk = linhas.slice(start, end);
        chunkIndex += 1;

        if (!chunk.length) continue;

        console.log(
            `Inserindo chunk #${chunkIndex} (linhas ${start + 1} até ${end})...`
        );

        // Monta placeholders e parâmetros para bulk insert
        const params: unknown[] = [];
        const valuesSql: string[] = [];

        for (const row of chunk) {
            const rowPlaceholders: string[] = [];

            for (const col of PRODUTO_COLUMNS) {
                const rawValue = (row as any)[col];
                const value = normalizeCellValue(col, rawValue);
                params.push(value);
                rowPlaceholders.push(`$${params.length}`);
            }

            valuesSql.push(`(${rowPlaceholders.join(', ')})`);
        }

        const columnsSql = PRODUTO_COLUMNS
            .map((c) => `"${String(c)}"`)
            .join(', ');

        const sql = `
      INSERT INTO tiny.produtos (${columnsSql})
      VALUES ${valuesSql.join(', ')};
    `;

        await psql.executarQueryInDb(sql, params);

        console.log(
            `✔ Chunk #${chunkIndex} inserido (total acumulado: ${end} registros).`
        );
    }

    console.log('✅ Importação concluída com sucesso.');

    return {
        totalLinhas: total,
        chunkSizeUsado: chunkSize,
        totalChunks: chunkIndex
    };
}

/**
 * Lê o chunkSize da query string (?chunkSize=) ou do header x-chunk-size.
 * Aplica limite máximo de 1000.
 */
function parseChunkSize(req: IncomingMessage): number {
    const baseUrl = 'http://localhost'; // base fictícia só pra usar URL
    const url = new URL(req.url ?? '/', baseUrl);

    const qValue = url.searchParams.get('chunkSize');
    const headerValue = req.headers['x-chunk-size'];
    const raw =
        qValue ??
        (Array.isArray(headerValue) ? headerValue[0] : (headerValue as string | undefined));

    if (!raw) return DEFAULT_CHUNK_SIZE;

    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error('chunkSize inválido. Use um número inteiro positivo.');
    }

    if (n > MAX_CHUNK_SIZE) {
        throw new Error(`chunkSize máximo permitido é ${MAX_CHUNK_SIZE}.`);
    }

    return Math.floor(n);
}

/**
 * Handler da rota POST /importar-produtos
 * Body: binário da planilha XLSX (qualquer tamanho, stream direto pro disco).
 */
async function handleImportRequest(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const chunkSize = parseChunkSize(req);

        const tempFilePath = await prepareTempDir();

        const writeStream = fs.createWriteStream(tempFilePath);

        await new Promise<void>((resolve, reject) => {
            req.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            req.pipe(writeStream);
        });

        const result = await processFile(tempFilePath, chunkSize);

        // Apaga o arquivo após o processamento
        await fs.promises.unlink(tempFilePath).catch(() => undefined);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
            JSON.stringify({
                success: true,
                message: 'Banco de dados atualizado com sucesso.',
                ...result
            })
        );
    } catch (err) {
        const errorMessage =
            err instanceof Error ? err.message : 'Erro desconhecido.';

        console.error('❌ Erro durante a importação:', err);

        // Tenta limpar o arquivo temporário se existir
        try {
            const tempFilePath = path.join(TEMP_DIR, TEMP_FILE_NAME);
            if (fs.existsSync(tempFilePath)) {
                await fs.promises.unlink(tempFilePath);
            }
        } catch {
            // ignore
        }

        const statusCode =
            errorMessage.includes('chunkSize máximo') ||
                errorMessage.includes('chunkSize inválido')
                ? 400
                : 500;

        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
            JSON.stringify({
                success: false,
                error: errorMessage
            })
        );
    }
}

/**
 * Router simples do servidor HTTP.
 */
async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const baseUrl = 'http://localhost';
    const url = new URL(req.url ?? '/', baseUrl);

    if (method === 'POST' && url.pathname === '/importar-produtos') {
        await handleImportRequest(req, res);
        return;
    }

    if (method === 'GET' && url.pathname === '/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
            JSON.stringify({
                status: 'ok',
                message: 'Import-DB-Tiny-To-Postgres API ativa.',
                endpoint: '/importar-produtos'
            })
        );
        return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
}

// Cria o servidor HTTP
const server = http.createServer((req, res) => {
    void router(req, res);
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor HTTP ouvindo na porta ${PORT}.`);
    console.log(`http://localhost:${PORT}/`);
    console.log(`   POST /importar-produtos (body = XLSX binário, ?chunkSize=opcional)`);
});
