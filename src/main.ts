// -=<| ./src/main.ts |>=-
import path from 'path';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import * as services from './index.js';
import type { SheetRow } from './services/sheet.service.js';
import { fileURLToPath } from 'url';
import type { PoolClient } from 'pg';

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

type ImportTipo = 'PRODUTOS' | 'COMPOSICAO';

interface ComposicaoRow extends SheetRow {
    id_comp: number;
    sku_comp: string;
    produto_comp: string;
    quantidade_comp: number;
    id_kit: number;
    sku_kit: string;
    produto_kit: string;
}

const COMPOSICAO_COLUMNS: (keyof ComposicaoRow)[] = [
    'id_comp',
    'sku_comp',
    'produto_comp',
    'quantidade_comp',
    'id_kit',
    'sku_kit',
    'produto_kit'
];

// OBS: sheet.service.ts normaliza cabeçalhos automaticamente (remove acentos, troca símbolos por "_", etc.)
const COMPOSICAO_HEADER_MAP = {
    id_kit_fabricado: 'id_kit',
    sku_kit_fabricado: 'sku_kit',
    descricao_kit_fabricado: 'produto_kit',
    id_componente: 'id_comp',
    sku_componente: 'sku_comp',
    descricao_componente: 'produto_comp',
    quantidade_componente: 'quantidade_comp'
} as const;

type ComposicaoSourceHeader = keyof typeof COMPOSICAO_HEADER_MAP;

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

const PG_MAX_PARAMS = 65535;

function parseImportTipoFromString(raw: unknown): ImportTipo | null {
    if (typeof raw !== 'string') return null;

    const normalized = raw
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    if (!normalized) return null;

    if (normalized === 'COMPOSICAO' || normalized === 'COMPOSICOES' || normalized === 'COMPOSICAO_KIT' || normalized === 'COMPOSICAO_KITS') {
        return 'COMPOSICAO';
    }
    if (normalized === 'PRODUTOS' || normalized === 'PRODUTO') {
        return 'PRODUTOS';
    }

    throw new Error(`tipo inválido: "${raw}". Use "PRODUTOS" ou "COMPOSICAO".`);
}

function parseImportTipo(req: IncomingMessage): ImportTipo {
    const baseUrl = 'http://localhost';
    const url = new URL(req.url ?? '/', baseUrl);

    const qTipo = url.searchParams.get('tipo');
    const hTipo = req.headers['x-planilha-tipo'] ?? req.headers['x-import-tipo'];

    const raw =
        qTipo ??
        (Array.isArray(hTipo) ? hTipo[0] : (hTipo as string | undefined));

    return parseImportTipoFromString(raw) ?? 'PRODUTOS';
}

function effectiveChunkSize(requested: number, numCols: number): number {
    const maxByParams = Math.floor(PG_MAX_PARAMS / Math.max(1, numCols));
    if (maxByParams < 1) {
        throw new Error(`Não é possível inserir: número de colunas (${numCols}) excede limite de parâmetros do PostgreSQL.`);
    }
    return Math.max(1, Math.min(requested, maxByParams));
}

function normalizeNumber(rawValue: unknown): number | null {
    if (rawValue === undefined || rawValue === null) return null;
    if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : null;

    const str = String(rawValue).trim();
    if (!str) return null;

    const normalized = str.replace(',', '.');
    const n = Number(normalized);
    if (Number.isNaN(n)) return null;
    return n;
}

function normalizeText(rawValue: unknown): string | null {
    if (rawValue === undefined || rawValue === null) return null;
    const str = String(rawValue).trim();
    return str ? str : null;
}

function mapComposicaoRow(raw: SheetRow): Partial<ComposicaoRow> {
    const out: Partial<ComposicaoRow> = {};

    // Aceita caso a planilha já venha com as chaves finais
    for (const destKey of COMPOSICAO_COLUMNS) {
        const v = (raw as any)[destKey];
        if (v !== undefined) (out as any)[destKey] = v;
    }

    // Mapeia do "normalizado da planilha" -> "coluna final"
    (Object.keys(COMPOSICAO_HEADER_MAP) as ComposicaoSourceHeader[]).forEach((srcKey) => {
        const destKey = COMPOSICAO_HEADER_MAP[srcKey];
        const v = (raw as any)[srcKey];
        if (v !== undefined) (out as any)[destKey] = v;
    });

    // Normaliza tipos
    out.id_comp = normalizeNumber((out as any).id_comp) ?? undefined;
    out.id_kit = normalizeNumber((out as any).id_kit) ?? undefined;
    out.quantidade_comp = normalizeNumber((out as any).quantidade_comp) ?? undefined;

    out.sku_comp = normalizeText((out as any).sku_comp) ?? undefined;
    out.sku_kit = normalizeText((out as any).sku_kit) ?? undefined;
    out.produto_comp = normalizeText((out as any).produto_comp) ?? undefined;
    out.produto_kit = normalizeText((out as any).produto_kit) ?? undefined;

    return out;
}

function isComposicaoRowBlank(r: Partial<ComposicaoRow>): boolean {
    const skuKit = (r.sku_kit ?? '').toString().trim();
    const skuComp = (r.sku_comp ?? '').toString().trim();
    const idKit = r.id_kit;
    const idComp = r.id_comp;
    return !skuKit && !skuComp && (idKit === undefined || idKit === null) && (idComp === undefined || idComp === null);
}

function buildComposicoesOrThrow(rawRows: SheetRow[]): ComposicaoRow[] {
    const SKU_EXCLUIDO = 'PRODUTO_EXCLUIDO' as const;

    // sku_kit continua obrigatório (pra você saber de qual KIT é).
    // sku_comp (componente) pode vir vazio -> vira SKU_EXCLUIDO.
    const required = ['id_comp', 'quantidade_comp', 'id_kit', 'sku_kit'] as const;

    const mapped = rawRows
        .map(mapComposicaoRow)
        .filter((r) => !isComposicaoRowBlank(r));

    if (!mapped.length) {
        throw new Error('Planilha de COMPOSICAO vazia (nenhuma linha válida encontrada).');
    }

    const agg = new Map<string, ComposicaoRow>();
    const errors: string[] = [];

    let patchedSkuComp = 0;

    mapped.forEach((r, idx) => {
        // sku_comp: se não vier, marca como produto excluído
        const rawSkuComp = (r as any).sku_comp;
        const skuComp =
            rawSkuComp === undefined ||
            rawSkuComp === null ||
            (typeof rawSkuComp === 'string' && !rawSkuComp.trim())
                ? (patchedSkuComp++, SKU_EXCLUIDO)
                : String(rawSkuComp).trim();

        // sku_kit: NÃO altera, continua obrigatório
        const skuKit = String((r as any).sku_kit ?? '').trim();

        // valida só o que realmente precisa existir
        const missing = required.filter((k) => {
            const v = (r as any)[k];
            return v === undefined || v === null || (typeof v === 'string' && !v.trim());
        });

        if (missing.length) {
            errors.push(`linha ${idx + 2}: faltando ${missing.join(', ')}`);
            return;
        }

        const idKit = Number(r.id_kit);
        const idComp = Number(r.id_comp);
        const qtd = Number(r.quantidade_comp);

        if (!Number.isFinite(idKit) || !Number.isFinite(idComp)) {
            errors.push(`linha ${idx + 2}: id_kit/id_comp inválido (id_kit=${r.id_kit}, id_comp=${r.id_comp})`);
            return;
        }

        if (!Number.isFinite(qtd) || qtd <= 0) {
            errors.push(`linha ${idx + 2}: quantidade_comp inválida (${r.quantidade_comp})`);
            return;
        }

        const key = `${idKit}::${idComp}`; // dedupe por ID (preferível)
        const existing = agg.get(key);

        if (!existing) {
            agg.set(key, {
                id_comp: idComp,
                sku_comp: skuComp,
                produto_comp: r.produto_comp ? String(r.produto_comp) : '',
                quantidade_comp: qtd,
                id_kit: idKit,
                sku_kit: skuKit,
                produto_kit: r.produto_kit ? String(r.produto_kit) : ''
            });
        } else {
            existing.quantidade_comp = Number(existing.quantidade_comp) + qtd;

            // mantém descrições mais “ricas” se vierem depois
            if (!existing.produto_comp && r.produto_comp) existing.produto_comp = String(r.produto_comp);
            if (!existing.produto_kit && r.produto_kit) existing.produto_kit = String(r.produto_kit);

            // se antes estava PRODUTO_EXCLUIDO e agora veio SKU real, atualiza
            if (existing.sku_comp === SKU_EXCLUIDO && skuComp !== SKU_EXCLUIDO) {
                existing.sku_comp = skuComp;
            }
        }
    });

    if (patchedSkuComp) {
        console.log(
            `⚠️ COMPOSICAO: ${patchedSkuComp} linhas com sku_comp vazio -> usando "${SKU_EXCLUIDO}".`
        );
    }

    if (errors.length) {
        throw new Error(
            `Planilha de COMPOSICAO inválida. Problemas (primeiros 10):\n- ${errors.slice(0, 10).join('\n- ')}`
        );
    }

    return Array.from(agg.values());
}

async function bulkInsertInChunks<T extends SheetRow>(
    client: PoolClient,
    tableFullName: string,
    columns: string[],
    rows: T[],
    chunkSize: number,
    normalizeFn: (col: string, rawValue: unknown) => unknown
): Promise<{ total: number; chunks: number; chunkSizeUsado: number }> {
    const total = rows.length;
    let chunks = 0;

    const effective = effectiveChunkSize(chunkSize, columns.length);

    for (let start = 0; start < total; start += effective) {
        const end = Math.min(start + effective, total);
        const chunk = rows.slice(start, end);
        if (!chunk.length) continue;

        chunks += 1;

        const params: unknown[] = [];
        const valuesSql: string[] = [];

        for (const row of chunk) {
            const rowPlaceholders: string[] = [];
            for (const col of columns) {
                const rawValue = (row as any)[col];
                const value = normalizeFn(col, rawValue);
                params.push(value);
                rowPlaceholders.push(`$${params.length}`);
            }
            valuesSql.push(`(${rowPlaceholders.join(', ')})`);
        }

        const columnsSql = columns.map((c) => `"${c}"`).join(', ');
        const sql = `INSERT INTO ${tableFullName} (${columnsSql}) VALUES ${valuesSql.join(', ')};`;

        await client.query(sql, params);
    }

    return { total, chunks, chunkSizeUsado: effective };
}

function normalizeProdutoByColumn(col: string, rawValue: unknown): unknown {
    // reutiliza a sua regra existente
    return normalizeCellValue(col as any, rawValue);
}

function normalizeComposicaoByColumn(col: string, rawValue: unknown): unknown {
    if (rawValue === undefined || rawValue === null) return null;

    if (typeof rawValue === 'string' && rawValue.trim() === '') return null;

    if (col === 'id_comp' || col === 'id_kit') {
        const n = normalizeNumber(rawValue);
        return n === null ? null : Math.trunc(n);
    }

    if (col === 'quantidade_comp') {
        return normalizeNumber(rawValue);
    }

    // textos
    return rawValue;
}

async function readBodyAsBuffer(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on('end', resolve);
        req.on('error', reject);
    });
    return Buffer.concat(chunks);
}

/**
 * Garante que a pasta TEMP existe e apaga qualquer arquivo que já tiver lá.
 * Retorna o caminho completo do arquivo "produtos.xlsx".
 */
async function prepareTempFilePath(prefix = 'import'): Promise<string> {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });

    const fileName = `${prefix}_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.xlsx`;

    return path.join(TEMP_DIR, fileName);
}

/**
 * Processa o arquivo XLSX: TRUNCATE na tabela, leitura da planilha e INSERT em chunks.
 */
async function processFile(xlsxPath: string, chunkSize: number, tipo: ImportTipo) {
    const ok = await psql.conectarAoBanco();
    if (!ok) {
        throw new Error('Não foi possível conectar ao banco de dados.');
    }

    if (tipo === 'COMPOSICAO') {
        // 1) Lê e valida ANTES de mexer no banco
        const rawRows = sheet.lerPlanilhaComoObjetos<SheetRow>(xlsxPath);
        const rows = buildComposicoesOrThrow(rawRows);

        console.log(`Planilha COMPOSICAO: linhas válidas/deduplicadas = ${rows.length}`);

        // 2) TRUNCATE + INSERT dentro de transação (rollback preserva conteúdo antigo)
        return await psql.executarEmTransacao(async (client: PoolClient) => {
            console.log('Transação iniciada. Truncando tiny.composicoes...');
            await client.query('TRUNCATE TABLE tiny.composicoes;');

            const result = await bulkInsertInChunks<ComposicaoRow>(
                client,
                'tiny.composicoes',
                COMPOSICAO_COLUMNS.map(String),
                rows as any,
                chunkSize,
                normalizeComposicaoByColumn
            );

            console.log('✅ Importação COMPOSICAO concluída com sucesso.');

            return {
                tipo,
                totalLinhas: result.total,
                chunkSizeUsado: result.chunkSizeUsado,
                totalChunks: result.chunks
            };
        });
    }

    // ===================== PRODUTOS (default) =====================
    const linhas = sheet.lerPlanilhaComoObjetos<ProdutoRow>(xlsxPath);

    // remove linhas totalmente vazias (bem comum no final do XLSX)
    const rows = linhas.filter((r) => {
        const sku = String((r as any).codigo_sku ?? '').trim();
        const id = String((r as any).id ?? '').trim();
        const desc = String((r as any).descricao ?? '').trim();
        return sku || id || desc;
    });

    if (!rows.length) {
        throw new Error('Planilha de PRODUTOS vazia (nenhuma linha válida encontrada).');
    }

    // valida mínima pra evitar “planilha errada”
    const first = rows[0] as any;
    if (first.codigo_sku === undefined || first.descricao === undefined) {
        throw new Error('Planilha de PRODUTOS inválida: não encontrei colunas "codigo_sku" e/ou "descricao".');
    }

    console.log(`Planilha PRODUTOS: linhas válidas = ${rows.length}`);

    return await psql.executarEmTransacao(async (client: PoolClient) => {
        console.log('Transação iniciada. Truncando tiny.produtos...');
        await client.query('TRUNCATE TABLE tiny.produtos;');

        const result = await bulkInsertInChunks<ProdutoRow>(
            client,
            'tiny.produtos',
            PRODUTO_COLUMNS.map(String),
            rows as any,
            chunkSize,
            normalizeProdutoByColumn
        );

        console.log('✅ Importação PRODUTOS concluída com sucesso.');

        return {
            tipo: 'PRODUTOS' as ImportTipo,
            totalLinhas: result.total,
            chunkSizeUsado: result.chunkSizeUsado,
            totalChunks: result.chunks
        };
    });
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
    let tempFilePath: string | null = null;

    try {
        const chunkSize = parseChunkSize(req);
        let tipo: ImportTipo = parseImportTipo(req); // default PRODUTOS

        // cria um temp file único
        tempFilePath = await prepareTempFilePath(tipo === 'COMPOSICAO' ? 'composicao' : 'produtos');

        const contentType = String(req.headers['content-type'] ?? '').toLowerCase();

        // ✅ Suporte opcional: body JSON com { tipo, xlsxBase64 }
        // (isso cumpre seu requisito de "tipo no body")
        if (contentType.includes('application/json')) {
            const buf = await readBodyAsBuffer(req);
            const payload = JSON.parse(buf.toString('utf8') || '{}');

            const tipoFromBody = parseImportTipoFromString(payload?.tipo);
            if (tipoFromBody) tipo = tipoFromBody;

            const b64 = payload?.xlsxBase64 ?? payload?.fileBase64 ?? payload?.xlsx_base64;
            if (!b64 || typeof b64 !== 'string') {
                throw new Error('Body JSON precisa conter "xlsxBase64" (string base64) e opcionalmente "tipo".');
            }

            await fs.promises.writeFile(tempFilePath, Buffer.from(b64, 'base64'));
        } else {
            // ✅ Modo atual (binário): mantém compatibilidade
            const writeStream = fs.createWriteStream(tempFilePath);

            await new Promise<void>((resolve, reject) => {
                req.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
                req.pipe(writeStream);
            });
        }

        const result = await processFile(tempFilePath, chunkSize, tipo);

        // apaga temp
        await fs.promises.unlink(tempFilePath).catch(() => undefined);
        tempFilePath = null;

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

        // tenta apagar temp real usado
        if (tempFilePath) {
            await fs.promises.unlink(tempFilePath).catch(() => undefined);
        }

        const statusCode =
            errorMessage.includes('chunkSize máximo') ||
                errorMessage.includes('chunkSize inválido') ||
                errorMessage.includes('tipo inválido') ||
                errorMessage.includes('Planilha') ||
                errorMessage.includes('Body JSON')
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor HTTP ouvindo na porta ${PORT}.`);
    console.log(`http://localhost:${PORT}/`);
    console.log(`   POST /importar-produtos (body = XLSX binário, ?chunkSize=opcional, ?tipo=PRODUTOS|COMPOSICAO)`);
});
