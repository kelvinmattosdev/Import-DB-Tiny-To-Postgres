import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComposicoesOrThrow } from '../dist/main.js';

test('descarta linhas de composição cujo KIT não possui SKU', () => {
    const rows = buildComposicoesOrThrow([
        {
            id_componente: 1,
            sku_componente: 'COMP-1',
            descricao_componente: 'Componente inválido',
            quantidade_componente: 1,
            id_kit_fabricado: 10,
            sku_kit_fabricado: '',
            descricao_kit_fabricado: 'KIT sem SKU'
        },
        {
            id_componente: 2,
            sku_componente: 'COMP-2',
            descricao_componente: 'Componente válido',
            quantidade_componente: 3,
            id_kit_fabricado: 20,
            sku_kit_fabricado: 'KIT-20',
            descricao_kit_fabricado: 'KIT válido'
        }
    ]);

    assert.deepEqual(rows, [
        {
            id_comp: 2,
            sku_comp: 'COMP-2',
            produto_comp: 'Componente válido',
            quantidade_comp: 3,
            id_kit: 20,
            sku_kit: 'KIT-20',
            produto_kit: 'KIT válido'
        }
    ]);
});

test('mantém o marcador de produto excluído para componente sem SKU', () => {
    const rows = buildComposicoesOrThrow([
        {
            id_componente: 1,
            sku_componente: '',
            quantidade_componente: 1,
            id_kit_fabricado: 20,
            sku_kit_fabricado: 'KIT-20'
        }
    ]);

    assert.equal(rows[0].sku_comp, 'PRODUTO_EXCLUIDO');
});
