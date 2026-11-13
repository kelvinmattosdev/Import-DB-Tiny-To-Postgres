import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PRODUCT_COMPLETENESS_CRITERIA,
    scoreProductCompleteness,
    selectMostCompleteProductsBySku
} from '../dist/services/product-deduplication.service.js';

test('pontua apenas números positivos e textos preenchidos', () => {
    const result = scoreProductCompleteness({
        preco_de_custo: '10,50',
        estoque: 0,
        variacoes: '   ',
        categoria: 'Ferramentas',
        url_imagem_externa_1: 'https://example.com/a.jpg',
        gtin_ean: null,
        cod_do_fornecedor: 'COD-1',
        fornecedor: undefined
    });

    assert.equal(result.score, 4);
    assert.deepEqual(result.matchedCriteria, [
        'preco_de_custo',
        'categoria',
        'url_imagem_externa_1',
        'cod_do_fornecedor'
    ]);
});

test('cada uma das dez URLs externas vale um ponto', () => {
    const product = Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
            `url_imagem_externa_${index + 1}`,
            `https://example.com/${index + 1}.jpg`
        ])
    );

    assert.equal(scoreProductCompleteness(product).score, 10);
    assert.equal(PRODUCT_COMPLETENESS_CRITERIA.length, 17);
});

test('mantém somente o produto mais completo para um SKU duplicado', () => {
    const incomplete = { id: '1', codigo_sku: 'ABC', preco_de_custo: 0 };
    const complete = {
        id: '2',
        codigo_sku: 'abc',
        preco_de_custo: 12,
        estoque: 3,
        categoria: 'Categoria'
    };
    const unique = { id: '3', codigo_sku: 'XYZ' };

    const result = selectMostCompleteProductsBySku([
        incomplete,
        complete,
        unique
    ]);

    assert.deepEqual(result.rows, [complete, unique]);
    assert.equal(result.duplicateSkuGroups, 1);
    assert.equal(result.duplicateRows, 2);
    assert.equal(result.removedRows, 1);
    assert.equal(result.tiedGroups, 0);
});

test('mantém todos os vencedores quando a maior pontuação empata', () => {
    const first = { id: '1', codigo_sku: ' SKU-1 ', estoque: 2 };
    const second = { id: '2', codigo_sku: 'sku-1', categoria: 'Categoria' };
    const lowerScore = { id: '3', codigo_sku: 'SKU-1' };

    const result = selectMostCompleteProductsBySku([
        first,
        second,
        lowerScore
    ]);

    assert.deepEqual(result.rows, [first, second]);
    assert.equal(result.removedRows, 1);
    assert.equal(result.tiedGroups, 1);
    assert.equal(result.decisions[0].tied, true);
});

test('não agrupa linhas sem SKU', () => {
    const first = { id: '1', codigo_sku: '' };
    const second = { id: '2', codigo_sku: null };

    const result = selectMostCompleteProductsBySku([first, second]);

    assert.deepEqual(result.rows, [first, second]);
    assert.equal(result.duplicateSkuGroups, 0);
});
