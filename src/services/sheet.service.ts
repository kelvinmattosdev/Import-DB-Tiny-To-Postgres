// ###   ./src/services/sheet.service.ts   ###
import xlsx, { WorkBook, WorkSheet } from 'xlsx';
import path from 'path';

/** Objeto padrão de linha de planilha (chaves normalizadas) */
export type SheetRow = Record<string, unknown>;

/** Opções para filtragem de planilha */
export interface FilterSheetOptions {
    /**
     * Nome da aba da planilha que será usada.
     * Se não informado, usa a primeira aba.
     */
    sheet?: string;
}

/** Opções para ler a planilha inteira como objetos */
export interface ReadSheetOptions {
    /**
     * Nome da aba da planilha que será usada.
     * Se não informado, usa a primeira aba.
     */
    sheet?: string;

    /**
     * Se true (default), normaliza cabeçalhos com `normalizeHeader`.
     * Se false, usa exatamente o texto do cabeçalho da planilha.
     */
    normalizeHeaders?: boolean;
}

/** Opções para listar cabeçalhos */
export interface ListHeadersOptions {
    /** Nome da aba; se omitido, usa a primeira. */
    sheet?: string;
    /** Se true, devolve cabeçalhos normalizados; default: false (originais). */
    normalize?: boolean;
}

/* =========================================================
 *  FUNÇÃO PRINCIPAL: FILTRAR PLANILHA
 * =======================================================*/

/**
 * @description Essa função nada mais é que um filtro, será usada para filtrar qualquer valor de uma planilha.
 * @param filePath - Caminho do arquivo `.xlsx` no disco.
 *  Exemplo: "./data/inventario.xlsx" ou "C:\\Users\\Lucas\\Desktop\\arquivo.xlsx"
 *
 * @param coluna - Nome do cabeçalho da coluna da planilha
 *  que você deseja usar no filtro.
 *  Este nome deve ser exatamente igual ao que aparece
 *  na primeira linha (linha de cabeçalho) da planilha, ou a letra da coluna
 *  Exemplo: "Estoque Atual", "Preço", "A" ou "D"
 *
 * @param filtro - Expressão de filtro aplicada aos valores da coluna.
 *   Pode ser uma comparação simples ou composta:
 *   - "=10" → apenas valores iguais a 10.
 *   - ">0" → apenas valores maiores que 0.
 *   - ">0 && <100" → valores entre 1 e 100.
 *
 * @returns Lista de objetos representando as linhas que passaram no filtro.
 */
export function filtrarPlanilha<T extends SheetRow = SheetRow>(
    filePath: string,
    coluna: string,
    filtro: string,
    opts: FilterSheetOptions = {}
): T[] {
    const abs = path.resolve(filePath);
    const wb = xlsx.readFile(abs, { cellDates: true });

    const sheetName = opts.sheet ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) {
        throw new Error(`Aba não encontrada: ${sheetName}`);
    }

    const { headers, rows } = parseWorksheet(ws);

    // 3. Determina a chave a ser usada no filtro
    const isLetter = /^[A-Z]+$/.test(String(coluna).toUpperCase());
    let headerKey: string | undefined;

    if (isLetter) {
        const colIndex = colLetterToIndex(String(coluna).toUpperCase());
        headerKey = headers[colIndex]; // Pega o header já normalizado pelo índice
    } else {
        headerKey = normalizeHeader(coluna); // Normaliza o nome da coluna do filtro
    }

    if (!headerKey) {
        throw new Error(
            `Coluna "${coluna}" não encontrada ou resultou em um cabeçalho vazio.`
        );
    }

    const getValue = (obj: SheetRow) => obj[headerKey as string];
    const evaluator = buildFilterEvaluator(filtro);

    // 4. Filtra os resultados
    const result: SheetRow[] = [];
    for (const obj of rows) {
        const val = getValue(obj);
        if (evaluator(val)) {
            result.push(obj);
        }
    }

    return result as T[];
}

/* =========================================================
 *  HELPERS INTERNOS: PARSE DA PLANILHA
 * =======================================================*/
interface ParsedWorksheet {
    /** Cabeçalhos já normalizados (podem ser string vazia). */
    headers: string[];
    /** Linhas como objetos com chaves normalizadas. */
    rows: SheetRow[];
}

/**
 * Converte uma aba de planilha em:
 *  - headers: cabeçalhos normalizados (primeira linha)
 *  - rows: array de objetos (cada linha de dados)
 */
function parseWorksheet(ws: WorkSheet): ParsedWorksheet {
    const rowsArr = xlsx.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: true
    }) as unknown[][];

    if (rowsArr.length === 0) {
        return { headers: [], rows: [] };
    }

    // 1. Normaliza os cabeçalhos da primeira linha e remove os que resultarem em vazio
    const headers = (rowsArr[0] as unknown[]).map((h) => normalizeHeader(h));
    const rawData = rowsArr.slice(1);

    // 2. Cria o array de objetos com as chaves já normalizadas
    const rowsObj: SheetRow[] = rawData.map((row) => {
        const obj: SheetRow = {};
        headers.forEach((header, index) => {
            // Apenas adiciona a propriedade se o cabeçalho normalizado não for vazio
            if (header) {
                obj[header] = row[index];
            }
        });
        return obj;
    });

    return { headers, rows: rowsObj };
}

/* =========================================================
 *  HELPERS PÚBLICOS ÚTEIS (NOVOS)
 * =======================================================*/

/**
 * Lê uma aba da planilha e devolve TODAS as linhas como objetos
 * (sem filtro), com cabeçalhos normalizados por padrão.
 *
 * Útil para debug, ETL ou quando você quiser manipular a planilha
 * inteira em memória.
 */
export function lerPlanilhaComoObjetos<T extends SheetRow = SheetRow>(
    filePath: string,
    options: ReadSheetOptions = {}
): T[] {
    const abs = path.resolve(filePath);
    const wb = xlsx.readFile(abs, { cellDates: true });

    const sheetName = options.sheet ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) {
        throw new Error(`Aba não encontrada: ${sheetName}`);
    }

    // Se quiser manter exatamente o texto dos cabeçalhos, reprocessamos aqui
    if (options.normalizeHeaders === false) {
        const rowsArr = xlsx.utils.sheet_to_json(ws, {
            header: 1,
            defval: '',
            raw: true
        }) as unknown[][];

        if (!rowsArr.length) return [] as T[];

        const originalHeaders = (rowsArr[0] as unknown[]).map((h) =>
            String(h ?? '').trim()
        );
        const rawData = rowsArr.slice(1);

        const rowsObj: SheetRow[] = rawData.map((row) => {
            const obj: SheetRow = {};
            originalHeaders.forEach((header, index) => {
                if (header) {
                    obj[header] = row[index];
                }
            });
            return obj;
        });

        return rowsObj as T[];
    }

    // Default: usa cabeçalhos normalizados
    const { rows } = parseWorksheet(ws);
    return rows as T[];
}

/**
 * Lista os nomes de todas as abas de uma planilha.
 */
export function listarAbas(filePath: string): string[] {
    const abs = path.resolve(filePath);
    const wb: WorkBook = xlsx.readFile(abs, { cellDates: true });
    return [...wb.SheetNames];
}

/**
 * Lista os cabeçalhos de uma aba da planilha.
 *
 * @param filePath Caminho do arquivo `.xlsx`.
 * @param options.sheet Nome da aba (fallback: primeira).
 * @param options.normalize Se true, devolve cabeçalhos normalizados.
 */
export function listarCabecalhos(
    filePath: string,
    options: ListHeadersOptions = {}
): string[] {
    const abs = path.resolve(filePath);
    const wb: WorkBook = xlsx.readFile(abs, { cellDates: true });

    const sheetName = options.sheet ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) {
        throw new Error(`Aba não encontrada: ${sheetName}`);
    }

    const rowsArr = xlsx.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: true
    }) as unknown[][];

    if (!rowsArr.length) return [];

    const firstRow = rowsArr[0] as unknown[];
    if (options.normalize) {
        return firstRow.map((h) => normalizeHeader(h));
    }

    return firstRow.map((h) => String(h ?? '').trim());
}

/* =========================================================
 *  HELPERS DE COLUNA E NÚMERO
 * =======================================================*/

/** Converte "A" -> 0, "B" -> 1, ..., "AA" -> 26, etc. */
function colLetterToIndex(letter: string): number {
    let idx = 0;
    for (let i = 0; i < letter.length; i++) {
        idx = idx * 26 + (letter.charCodeAt(i) - 64); // 'A' = 65
    }
    return idx - 1;
}

/** Normaliza string numérica BR/US para Number (ou NaN) */
function toNumber(val: unknown): number {
    if (typeof val === 'number') return val;
    const s = String(val ?? '').trim();
    if (!s) return NaN;
    // remove separador de milhar . e troca vírgula por ponto
    const norm = s.replace(/\./g, '').replace(',', '.');
    return /^[+-]?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

/** Operadores suportados na comparação */
type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

/** Tenta comparar numericamente; se não der, compara como string */
function compare(a: unknown, b: unknown, op: ComparisonOperator): boolean {
    const na = toNumber(a);
    const nb = toNumber(b);

    const bothNums = !Number.isNaN(na) && !Number.isNaN(nb);
    if (bothNums) {
        if (op === '==') return na === nb;
        if (op === '!=') return na !== nb;
        if (op === '>') return na > nb;
        if (op === '>=') return na >= nb;
        if (op === '<') return na < nb;
        if (op === '<=') return na <= nb;
    } else {
        // string compare (case-sensitive por padrão)
        const sa = String(a ?? '');
        const sb = String(b ?? '');
        if (op === '==') return sa === sb;
        if (op === '!=') return sa !== sb;
        if (op === '>') return sa > sb;
        if (op === '>=') return sa >= sb;
        if (op === '<') return sa < sb;
        if (op === '<=') return sa <= sb;
    }
    return false;
}

/* =========================================================
 *  PARSER DE EXPRESSÃO DE FILTRO
 * =======================================================*/

/**
 * Constrói uma função (valor) => boolean com base em uma expressão como:
 *  "=10" | ">0" | ">=5 && <=100" | "=Wow" | "> 10 || = \"Wow\""
 *
 * Regras:
 * - Sem parênteses; precedência padrão: AND antes de OR (avaliamos explicitamente).
 * - Strings podem ser passadas com aspas ("Wow" ou 'Wow').
 */
function buildFilterEvaluator(
    exprRaw: string | null | undefined
): (value: unknown) => boolean {
    if (!exprRaw || !exprRaw.trim()) {
        // Sem filtro => tudo passa
        return () => true;
    }

    const expr = exprRaw.trim();

    // Divide por '||' (OR) de nível superior
    const orParts = splitTopLevel(expr, '||');

    const andGroups = orParts.map((part) => {
        const andParts = splitTopLevel(part, '&&')
            .map((s) => s.trim())
            .filter(Boolean);
        return andParts.map(parseSimpleCondition); // cada condição simples vira um predicado
    });

    // Retorna função final: (AND de cada grupo) OR entre grupos
    return (value: unknown) => {
        return andGroups.some((group) => group.every((pred) => pred(value)));
    };
}

/** Divide expressão por um operador lógico top-level (sem parênteses aqui, então é split simples) */
function splitTopLevel(s: string, sep: '&&' | '||'): string[] {
    return s
        .split(sep)
        .map((p) => p.trim())
        .filter(Boolean);
}

/**
 * Converte string de condição simples em predicado.
 * Aceita: =, ==, !=, >, >=, <, <=
 * Exemplos válidos: "=10", "== 'Wow'", ">= 5", "<=100"
 */
function parseSimpleCondition(
    condRaw: string
): (value: unknown) => boolean {
    const cond = condRaw.trim();

    // Normaliza "=" para "=="
    const norm = cond.replace(/^\s*=\s*/, '== ');

    // Padrão: operador + valor
    const m = norm.match(/^(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
        // Caso tenha sido passado só um valor (ex.: "Wow"), tratamos como == "Wow"
        const valOnly = stripQuotes(norm);
        return (v: unknown) => compare(v, valOnly, '==');
    }

    const op = m[1] as ComparisonOperator;
    const rhsRaw = m[2].trim();
    const rhs = stripQuotes(rhsRaw);

    return (v: unknown) => compare(v, rhs, op);
}

/** Remove aspas simples ou duplas das bordas, se existirem */
function stripQuotes(s: string): string {
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        return s.slice(1, -1);
    }
    return s;
}

/**
 * Normaliza uma string para ser usada como chave de objeto:
 * minúsculas, sem acentos, e espaços/caracteres especiais viram underscore.
 * Ex: "Código (SKU)" -> "codigo_sku"
 */
function normalizeHeader(str: unknown): string {
    if (!str) return '';
    return str
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, ' ')
        .trim()
        .replace(/\s+/g, '_');
}

// =========================================================