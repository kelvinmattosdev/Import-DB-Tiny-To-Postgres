export type ProductCandidate = Record<string, unknown>;

export const PRODUCT_COMPLETENESS_CRITERIA = [
    'preco_de_custo',
    'estoque',
    'variacoes',
    'categoria',
    'url_imagem_externa_1',
    'url_imagem_externa_2',
    'url_imagem_externa_3',
    'url_imagem_externa_4',
    'url_imagem_externa_5',
    'url_imagem_externa_6',
    'url_imagem_externa_7',
    'url_imagem_externa_8',
    'url_imagem_externa_9',
    'url_imagem_externa_10',
    'gtin_ean',
    'cod_do_fornecedor',
    'fornecedor'
] as const;

export type ProductCompletenessCriterion =
    (typeof PRODUCT_COMPLETENESS_CRITERIA)[number];

export interface ProductCompletenessScore {
    score: number;
    matchedCriteria: ProductCompletenessCriterion[];
}

export interface DuplicateProductCandidate {
    /** Índice da linha no array recebido (zero-based). */
    rowIndex: number;
    id: string | null;
    score: number;
    selected: boolean;
}

export interface DuplicateSkuDecision {
    sku: string;
    highestScore: number;
    tied: boolean;
    candidates: DuplicateProductCandidate[];
}

export interface ProductDeduplicationResult<T extends ProductCandidate> {
    rows: T[];
    duplicateSkuGroups: number;
    duplicateRows: number;
    removedRows: number;
    tiedGroups: number;
    decisions: DuplicateSkuDecision[];
}

function normalizeNumber(rawValue: unknown): number | null {
    if (typeof rawValue === 'number') {
        return Number.isFinite(rawValue) ? rawValue : null;
    }

    if (rawValue === undefined || rawValue === null) return null;

    const value = String(rawValue).trim().replace(',', '.');
    if (!value) return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function hasText(rawValue: unknown): boolean {
    return rawValue !== undefined &&
        rawValue !== null &&
        String(rawValue).trim() !== '';
}

function normalizeSku(rawValue: unknown): string | null {
    if (!hasText(rawValue)) return null;
    return String(rawValue).trim().toLocaleUpperCase('pt-BR');
}

function normalizeId(rawValue: unknown): string | null {
    return hasText(rawValue) ? String(rawValue).trim() : null;
}

/**
 * Calcula a completude de um produto conforme os campos definidos para o desempate.
 * Valores numéricos pontuam apenas quando maiores que zero; textos pontuam quando
 * não são null/undefined nem strings vazias.
 */
export function scoreProductCompleteness(
    product: ProductCandidate
): ProductCompletenessScore {
    const matchedCriteria: ProductCompletenessCriterion[] = [];

    for (const criterion of PRODUCT_COMPLETENESS_CRITERIA) {
        const value = product[criterion];
        const matched =
            criterion === 'preco_de_custo' || criterion === 'estoque'
                ? (normalizeNumber(value) ?? 0) > 0
                : hasText(value);

        if (matched) matchedCriteria.push(criterion);
    }

    return {
        score: matchedCriteria.length,
        matchedCriteria
    };
}

/**
 * Para cada SKU duplicado, mantém somente o produto de maior pontuação. Quando
 * mais de um produto alcança a maior nota, mantém todos os empatados.
 * Linhas sem SKU não são agrupadas e permanecem no resultado.
 */
export function selectMostCompleteProductsBySku<T extends ProductCandidate>(
    rows: T[]
): ProductDeduplicationResult<T> {
    const groups = new Map<string, number[]>();

    rows.forEach((row, rowIndex) => {
        const sku = normalizeSku(row.codigo_sku);
        if (!sku) return;

        const indices = groups.get(sku) ?? [];
        indices.push(rowIndex);
        groups.set(sku, indices);
    });

    const selectedIndices = new Set(rows.map((_, index) => index));
    const decisions: DuplicateSkuDecision[] = [];
    let duplicateRows = 0;
    let tiedGroups = 0;

    for (const indices of groups.values()) {
        if (indices.length < 2) continue;

        duplicateRows += indices.length;

        const scores = indices.map((rowIndex) => ({
            rowIndex,
            score: scoreProductCompleteness(rows[rowIndex]).score
        }));
        const highestScore = Math.max(...scores.map(({ score }) => score));
        const winnerIndices = scores
            .filter(({ score }) => score === highestScore)
            .map(({ rowIndex }) => rowIndex);
        const winnerSet = new Set(winnerIndices);
        const tied = winnerIndices.length > 1;

        if (tied) tiedGroups += 1;

        for (const { rowIndex } of scores) {
            if (!winnerSet.has(rowIndex)) selectedIndices.delete(rowIndex);
        }

        decisions.push({
            sku: String(rows[indices[0]].codigo_sku).trim(),
            highestScore,
            tied,
            candidates: scores.map(({ rowIndex, score }) => ({
                rowIndex,
                id: normalizeId(rows[rowIndex].id),
                score,
                selected: winnerSet.has(rowIndex)
            }))
        });
    }

    const selectedRows = rows.filter((_, index) => selectedIndices.has(index));

    return {
        rows: selectedRows,
        duplicateSkuGroups: decisions.length,
        duplicateRows,
        removedRows: rows.length - selectedRows.length,
        tiedGroups,
        decisions
    };
}
