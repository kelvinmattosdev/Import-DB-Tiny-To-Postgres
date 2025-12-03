// ### ./src/services/database.service.ts ###
import dotenv from 'dotenv';
dotenv.config();

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';

const poolConfig: PoolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === 'true'
};
// console.log('poolConfig ->', poolConfig);

const pool = new Pool(poolConfig);

// 2. ADICIONAMOS O "OUVINTE" DE EVENTOS
// Isso vai nos dizer o que está acontecendo por baixo dos panos.
// pool.on('error', (err, client) => {
//     console.error('❌ ERRO INESPERADO no cliente do banco de dados!', err);
//     process.exit(-1); // Em caso de erro grave, encerra a aplicação.
// });

// pool.on('connect', (client) => {
//     console.log('ℹ️ EVENTO: Um cliente se conectou ao banco de dados.');
//     // Podemos até ver de onde ele está se conectando
//     console.log(`   - Processo ID do cliente: ${client.processID}`);
// });

// pool.on('acquire', (client) => {
//     console.log('ℹ️ EVENTO: Uma conexão foi "adquirida" do pool e está pronta para uso.');
// });

// pool.on('remove', (client) => {
//     console.log('ℹ️ EVENTO: Uma conexão foi "removida" e devolvida ao pool.');
// });

/**
 * @description Testa a conexão com o banco de dados usando variáveis de ambiente.
 * @returns {Promise<boolean>} Retorna true se a conexão for bem-sucedida, caso contrário, lança um erro.
 */
export async function conectarAoBanco(): Promise<boolean> {
    const hostBanco = process.env.DB_HOST;
    const user = process.env.DB_USER;

    // console.log(`[database.js] Tentando conectar ao banco no host: ${hostBanco} com o usuário: ${user}`);
    let client: PoolClient | null = null;

    try {
        // console.log('Tentando se conectar ao banco de dados...');
        client = await pool.connect();
        // console.log('Conexão bem-sucedida ao banco de dados!');
        return true; // Retorna true porque a conexão foi bem-sucedida
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(`[database.js] Erro ao conectar ao banco de dados: ${error.message}`);
        } else {
            console.error('[database.js] Erro ao conectar ao banco de dados (erro desconhecido):', error);
        }
        return false; // Retorna false porque houve um erro na conexão
    } finally {
        if (client) {
            // console.log('Devolvendo a conexão ao pool...');
            client.release();
            // console.log('Conexão devolvida ao pool.');
        }
    }
}

export async function executarQueryInDb<T extends QueryResultRow = QueryResultRow>(
    sqlCommand: string,
    params: any[] = []
): Promise<T[]> {
    let client: PoolClient | null = null;

    try {
        client = await pool.connect();
        // console.log('Executando comando:', { sqlCommand, params });
        const resultado: QueryResult<T> = await client.query<T>(sqlCommand, params);
        // console.log(`Comando executado com sucesso, ${resultado.rowCount} linhas retornadas/afetadas.`);
        return resultado.rows;
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('❌ Erro ao executar comando no banco de dados:', error.message);
        } else {
            console.error('❌ Erro ao executar comando no banco de dados (erro desconhecido):', error);
        }
        // Lança o erro para que a função que chamou saiba que algo deu errado
        throw error;
    } finally {
        if (client) {
            // console.log('Devolvendo a conexão ao pool...');
            client.release();
            // console.log('Conexão devolvida ao pool.');
        }
    }
}

export interface SchemaInfo extends QueryResultRow {
    schema: string;
    owner: string;
}

/**
 * @description Lista todos os schemas
 * @returns {Promise<SchemaInfo[]>} Retorna um Array com todos os schemas que o usuário definido nas variáveis do ambiente tem acesso.
 */
export async function listSchemas(): Promise<SchemaInfo[]> {
    const q = `
    -- \dn  (lista schemas e dono)
    SELECT n.nspname AS schema,
        pg_get_userbyid(n.nspowner) AS owner
    FROM pg_namespace n
    ORDER BY 1;
    `;
    const schemas = await executarQueryInDb<SchemaInfo>(q);
    return schemas;
}

export interface TableInfo extends QueryResultRow {
    tablename: string;
}

/**
 * @description Esta função lista todas as tables de um schema específico.
 * @param {string} schema - Este é o nome do schema cujo será buscado as tables de dentro.
 * @returns {Promise<TableInfo[]>} Retorna um Array com todas as tables do schema especificado.
 */
export async function listTablesBySchema(schema: string): Promise<TableInfo[]> {
    const q = `
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = $1
        ORDER BY tablename;
    `;

    const tables = await executarQueryInDb<TableInfo>(q, [schema]);
    return tables;
}

/**
 * @description Sanitiza identificadores de schema/tabela/coluna para evitar SQL injection em nomes.
 * @param {string} identifier
 * @returns {string}
 */
function sanitizeIdentifier(identifier: string): string {
    if (!identifier || typeof identifier !== 'string') {
        throw new Error('Identificador inválido (esperado string não vazia).');
    }

    // Apenas letras, números e underscore, começando por letra ou underscore.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
        throw new Error(`Identificador "${identifier}" contém caracteres inválidos.`);
    }

    return identifier;
}

/**
 * @description Monta o nome totalmente qualificado da tabela: "schema"."table".
 * @param {string} schema
 * @param {string} tableName
 * @returns {string}
 */
function buildQualifiedTableName(schema: string, tableName: string): string {
    const safeSchema = sanitizeIdentifier(schema);
    const safeTable = sanitizeIdentifier(tableName);
    return `"${safeSchema}"."${safeTable}"`;
}

export type TableAction = 'create' | 'rename' | 'drop' | 'truncate';

export interface ManageTablesOptions {
    /** Ação a executar: create, rename, drop, truncate. */
    action: TableAction;
    /** Nome do schema alvo. */
    schema: string;
    /** Nome da tabela alvo (obrigatório em rename, drop, truncate e create). */
    tableName?: string;
    /** Novo nome (para rename). */
    newTableName?: string;
    /** Definição de colunas para CREATE (ex: `"id SERIAL PRIMARY KEY, name TEXT NOT NULL"`). */
    columnsSql?: string;
}

/**
 * @description Executa operações de gerenciamento de TABELAS (DDL): criar, renomear, dropar, truncar.
 * @param {ManageTablesOptions} options
 * @returns {Promise<Array>} Resultado da query (normalmente vazio em DDL).
 */
export async function manageTables(options: ManageTablesOptions): Promise<any[]> {
    const {
        action,
        schema,
        tableName,
        newTableName,
        columnsSql
    } = options || ({} as ManageTablesOptions);

    if (!action) {
        throw new Error('Parâmetro "action" é obrigatório em manageTables.');
    }
    if (!schema) {
        throw new Error('Parâmetro "schema" é obrigatório em manageTables.');
    }

    let sql = '';
    let qualifiedTable: string | null = null;

    if (tableName) {
        qualifiedTable = buildQualifiedTableName(schema, tableName);
    }

    switch (action) {
        case 'create': {
            if (!tableName) {
                throw new Error('"tableName" é obrigatório para criação de tabela.');
            }
            if (!columnsSql) {
                throw new Error('"columnsSql" é obrigatório para criação de tabela.');
            }
            const fullName = buildQualifiedTableName(schema, tableName);
            sql = `CREATE TABLE IF NOT EXISTS ${fullName} (${columnsSql})`;
            break;
        }
        case 'rename': {
            if (!tableName) {
                throw new Error('"tableName" é obrigatório para renomear tabela.');
            }
            if (!newTableName) {
                throw new Error('"newTableName" é obrigatório para renomear tabela.');
            }
            if (!qualifiedTable) {
                throw new Error('Tabela alvo inválida para renomear.');
            }
            const safeNewName = sanitizeIdentifier(newTableName);
            sql = `ALTER TABLE ${qualifiedTable} RENAME TO "${safeNewName}"`;
            break;
        }
        case 'drop': {
            if (!tableName) {
                throw new Error('"tableName" é obrigatório para exclusão de tabela.');
            }
            if (!qualifiedTable) {
                throw new Error('Tabela alvo inválida para exclusão.');
            }
            sql = `DROP TABLE IF EXISTS ${qualifiedTable} CASCADE`;
            break;
        }
        case 'truncate': {
            if (!tableName) {
                throw new Error('"tableName" é obrigatório para truncate de tabela.');
            }
            if (!qualifiedTable) {
                throw new Error('Tabela alvo inválida para truncate.');
            }
            sql = `TRUNCATE TABLE ${qualifiedTable} RESTART IDENTITY CASCADE`;
            break;
        }
        default:
            throw new Error(`Ação "${action}" não suportada em manageTables.`);
    }

    return executarQueryInDb<any>(sql);
}

export type TableDataAction = 'select' | 'insert' | 'update' | 'delete';

export interface ManageTableDataOrderBy {
    /** Nome da coluna para ORDER BY. */
    column: string;
    /** Direção do ORDER BY (padrão: asc). */
    direction?: 'asc' | 'desc';
}

export interface ManageTableDataOptions {
    /** Ação de dados: select, insert, update, delete. */
    action: TableDataAction;
    /** Nome do schema. */
    schema: string;
    /** Nome da tabela. */
    tableName: string;
    /** Valores para INSERT/UPDATE (chave = coluna). */
    values?: Record<string, any>;
    /** Filtro simples de igualdade (coluna = valor). */
    where?: Record<string, any>;
    /** Ordenação para SELECT. */
    orderBy?: ManageTableDataOrderBy;
    /** LIMIT para SELECT. */
    limit?: number;
    /** OFFSET para SELECT. */
    offset?: number;
    /** Permite DELETE sem WHERE se true (cuidado!). */
    allowDeleteAll?: boolean;
}

/**
 * @description Executa operações de dados (DML) em uma tabela: leitura, inserção, edição e exclusão.
 * @param {ManageTableDataOptions} options
 * @returns {Promise<Array>} Linhas afetadas/retornadas pela operação.
 */
export async function manageTableData<T extends QueryResultRow = QueryResultRow>(
    options: ManageTableDataOptions
): Promise<T[]> {
    const {
        action,
        schema,
        tableName,
        values = {},
        where = {},
        orderBy,
        limit,
        offset,
        allowDeleteAll = false
    } = options || ({} as ManageTableDataOptions);

    if (!action) {
        throw new Error('Parâmetro "action" é obrigatório em manageTableData.');
    }
    if (!schema || !tableName) {
        throw new Error('"schema" e "tableName" são obrigatórios em manageTableData.');
    }

    const qualifiedTable = buildQualifiedTableName(schema, tableName);
    const params: any[] = [];
    let sql = '';

    switch (action) {
        case 'select': {
            sql = `SELECT * FROM ${qualifiedTable}`;

            const whereParts: string[] = [];
            Object.entries(where || {}).forEach(([col, val]) => {
                if (val === undefined) return;
                params.push(val);
                whereParts.push(`"${sanitizeIdentifier(col)}" = $${params.length}`);
            });

            if (whereParts.length) {
                sql += ' WHERE ' + whereParts.join(' AND ');
            }

            if (orderBy && orderBy.column) {
                const direction =
                    (orderBy.direction || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
                sql += ` ORDER BY "${sanitizeIdentifier(orderBy.column)}" ${direction}`;
            }

            if (typeof limit === 'number') {
                params.push(limit);
                sql += ` LIMIT $${params.length}`;
            }

            if (typeof offset === 'number') {
                params.push(offset);
                sql += ` OFFSET $${params.length}`;
            }

            break;
        }

        case 'insert': {
            const entries = Object.entries(values || {});
            if (!entries.length) {
                throw new Error('Valores para INSERT não informados em manageTableData.');
            }

            const columns = entries
                .map(([col]) => `"${sanitizeIdentifier(col)}"`)
                .join(', ');

            const placeholders = entries.map(([, val]) => {
                params.push(val);
                return `$${params.length}`;
            });

            sql = `INSERT INTO ${qualifiedTable} (${columns}) VALUES (${placeholders.join(', ')}) RETURNING *`;
            break;
        }

        case 'update': {
            const entries = Object.entries(values || {});
            if (!entries.length) {
                throw new Error('Valores para UPDATE não informados em manageTableData.');
            }

            const setParts: string[] = [];
            entries.forEach(([col, val]) => {
                params.push(val);
                setParts.push(`"${sanitizeIdentifier(col)}" = $${params.length}`);
            });

            sql = `UPDATE ${qualifiedTable} SET ${setParts.join(', ')}`;

            const whereParts: string[] = [];
            Object.entries(where || {}).forEach(([col, val]) => {
                if (val === undefined) return;
                params.push(val);
                whereParts.push(`"${sanitizeIdentifier(col)}" = $${params.length}`);
            });

            if (whereParts.length) {
                sql += ' WHERE ' + whereParts.join(' AND ');
            }

            sql += ' RETURNING *';
            break;
        }

        case 'delete': {
            sql = `DELETE FROM ${qualifiedTable}`;

            const whereEntries = Object.entries(where || {});
            const whereParts: string[] = [];

            whereEntries.forEach(([col, val]) => {
                if (val === undefined) return;
                params.push(val);
                whereParts.push(`"${sanitizeIdentifier(col)}" = $${params.length}`);
            });

            if (!whereParts.length && !allowDeleteAll) {
                throw new Error(
                    'DELETE sem cláusula WHERE bloqueado por segurança. ' +
                    'Defina "where" ou use allowDeleteAll=true conscientemente.'
                );
            }

            if (whereParts.length) {
                sql += ' WHERE ' + whereParts.join(' AND ');
            }

            sql += ' RETURNING *';
            break;
        }

        default:
            throw new Error(`Ação "${action}" não suportada em manageTableData.`);
    }

    return executarQueryInDb<T>(sql, params);
}
