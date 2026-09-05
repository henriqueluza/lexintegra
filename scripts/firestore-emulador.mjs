/**
 * Escrita no EMULADOR do Firestore pela API REST, sem `firebase-admin`.
 *
 * A mesma escolha de `semear-emulador.mjs`, e pelo mesmo motivo: `Authorization:
 * Bearer owner` e um atalho que so o emulador aceita. O Firestore de verdade
 * recusa esse token, entao nao existe caminho de codigo daqui ate producao —
 * nem apontando a variavel de ambiente a mao. Importar `firebase-admin` aqui
 * traria resolucao de credencial junto, e com ela esse caminho.
 *
 * O encoder existe porque a REST do Firestore nao aceita JSON comum: cada valor
 * vai tipado (`stringValue`, `integerValue`, ...). Sao vinte linhas em troca de
 * manter a garantia acima.
 */

/** Um valor JavaScript no formato `Value` da REST do Firestore. */
export function paraValor(valor) {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (typeof valor === 'string') return { stringValue: valor };
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };

  if (typeof valor === 'number') {
    // `integerValue` vai como STRING na REST — o Firestore usa int64, que nao
    // cabe em number do JSON. Mandar numero faz o campo virar double, e
    // `precoCentavos` deixaria de ser inteiro no banco.
    return Number.isInteger(valor)
      ? { integerValue: String(valor) }
      : { doubleValue: valor };
  }

  if (Array.isArray(valor)) {
    return { arrayValue: { values: valor.map(paraValor) } };
  }

  return { mapValue: { fields: paraCampos(valor) } };
}

export function paraCampos(objeto) {
  return Object.fromEntries(
    Object.entries(objeto).map(([chave, valor]) => [chave, paraValor(valor)]),
  );
}

/**
 * Confirma que o host e emulador ANTES de escrever.
 *
 * O teste e a propria credencial: `Bearer owner` so passa no emulador. Um
 * Firestore real responde 401 ou 403 a esta chamada, entao 200 aqui e prova de
 * emulador — nao uma heuristica sobre o formato da resposta.
 */
export async function confirmarEmuladorFirestore(host, projeto) {
  // `:listCollectionIds` e nao um GET em `/documents`: o GET responde 404 num banco
  // vazio, que e exatamente o estado de um emulador recem-subido — a checagem
  // acusaria falha na primeira semeadura de toda maquina nova.
  const resposta = await fetch(
    `http://${host}/v1/projects/${projeto}/databases/(default)/documents:listCollectionIds`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner',
      },
      body: '{}',
    },
  );

  if (!resposta.ok) {
    throw new Error(
      `${host} nao respondeu como emulador de Firestore (HTTP ${resposta.status}). Recusando escrever.`,
    );
  }
}

/**
 * Grava um documento com id conhecido. `PATCH` cria ou substitui, entao semear
 * duas vezes e idempotente — o emulador guarda estado enquanto esta no ar, e
 * `pnpm semear` precisa poder rodar de novo sem estourar.
 */
export async function gravarDocumento(host, projeto, caminho, dados) {
  const url = `http://${host}/v1/projects/${projeto}/databases/(default)/documents/${caminho}`;
  const resposta = await fetch(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer owner',
    },
    body: JSON.stringify({ fields: paraCampos(dados) }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`PATCH ${caminho} respondeu ${resposta.status}: ${corpo}`);
  }
}
