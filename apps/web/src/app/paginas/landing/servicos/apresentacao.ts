import type { ProdutoVitrine } from 'shared/esquemas/vitrine';
import { paraReais } from '../../../comum/moeda';

export interface LinhaFicha {
  quantidade: number;
  nome: string;
}
type Item = string | { nome: string; quantidade?: number; nomePlural?: string };

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pluralPalavra(palavra: string): string {
  if (
    /^(premium|plus|pro|express|online|vip)$/i.test(palavra) ||
    /[sx\d]$/i.test(palavra)
  )
    return palavra;
  const finais = [
    ['ão', 'ões'],
    ['al', 'ais'],
    ['el', 'éis'],
    ['ol', 'óis'],
    ['ul', 'uis'],
    ['il', 'is'],
    ['m', 'ns'],
  ];
  for (const [final, troca] of finais) {
    if (palavra.endsWith(final)) return palavra.slice(0, -final.length) + troca;
  }
  if (/[rz]$/i.test(palavra)) return palavra + 'es';
  return /[aeiouáéíóúâêô]$/i.test(palavra) ? palavra + 's' : palavra;
}

export function plural(nome: string): string {
  let parar = false;
  return nome
    .split(' ')
    .map((palavra) => {
      parar ||= /^(de|da|do|das|dos|em|para|por|com|sem|e|ou|a|o)$|^\(/i.test(
        palavra,
      );
      return parar ? palavra : palavra.split('/').map(pluralPalavra).join('/');
    })
    .join(' ');
}

function extrairQuantidade(original: string): { nome: string; total?: number } {
  let nome = original.replace(/\s+/g, ' ').trim();
  let total: number | undefined;
  const sequencia = /^(.*?)\s*\(\s*\d+\s*(?:de|\/|of)\s*(\d+)\s*\)\s*$/i.exec(
    nome,
  );
  const sufixo = /^(.*?)\s*(?:[×x]\s*(\d+)|\(\s*[×x]?\s*(\d+)\s*\))\s*$/i.exec(
    nome,
  );
  const prefixo = /^(\d+)\s*[×x]\s+(.*)$/i.exec(nome);
  if (sequencia) {
    nome = sequencia[1];
    total = Number(sequencia[2]);
  } else if (sufixo) {
    nome = sufixo[1];
    total = Number(sufixo[2] ?? sufixo[3]);
  } else if (prefixo) {
    nome = prefixo[2];
    total = Number(prefixo[1]);
  }
  nome = nome.trim();
  return { nome, total };
}

export function agruparItens(itens: readonly Item[]): LinhaFicha[] {
  const grupos = new Map<
    string,
    {
      nome: string;
      nomePlural?: string;
      campo?: number;
      total?: number;
      ocorrencias: number;
    }
  >();
  for (const item of itens) {
    const bruto = typeof item === 'string' ? { nome: item } : item;
    const { nome, total } = extrairQuantidade(bruto.nome);
    if (!nome) continue;
    const chave = normalizar(nome).replace(/[^a-z0-9]/g, '');
    const grupo = grupos.get(chave) ?? { nome, ocorrencias: 0 };
    grupo.ocorrencias++;
    if (bruto.quantidade !== undefined)
      grupo.campo = (grupo.campo ?? 0) + bruto.quantidade;
    if (total !== undefined) grupo.total = Math.max(grupo.total ?? 0, total);
    if (bruto.nomePlural) grupo.nomePlural = bruto.nomePlural;
    grupos.set(chave, grupo);
  }
  return [...grupos.values()]
    .map((g) => {
      const quantidade = g.campo ?? g.total ?? g.ocorrencias;
      return {
        quantidade,
        nome: quantidade > 1 ? (g.nomePlural ?? plural(g.nome)) : g.nome,
      };
    })
    .filter((item) => item.quantidade > 0);
}

export interface FichaProduto {
  produto: ProdutoVitrine;
  linhas: LinhaFicha[];
  meta: string;
  condicao: string;
  descricao: string;
  preco: string;
  busca: string;
}

export function apresentar(produto: ProdutoVitrine): FichaProduto {
  const itens = agruparItens(produto.entregaveis);
  const entregaveis = itens.reduce((total, item) => total + item.quantidade, 0);
  const linhas = [...itens];
  const meta: string[] = [];
  if (entregaveis)
    meta.push(
      `${entregaveis} ${entregaveis === 1 ? 'entregável' : 'entregáveis'}`,
    );
  if (produto.quantidadeReunioes > 0) {
    const quantidade = produto.quantidadeReunioes;
    linhas.push({
      quantidade,
      nome: quantidade === 1 ? 'Reunião' : 'Reuniões',
    });
    meta.push(`${quantidade} ${quantidade === 1 ? 'reunião' : 'reuniões'}`);
  }
  if (produto.numeroRevisoesPermitidas > 0)
    linhas.push({
      quantidade: produto.numeroRevisoesPermitidas,
      nome:
        produto.numeroRevisoesPermitidas === 1
          ? 'Revisão por entregável'
          : 'Revisões por entregável',
    });
  const descricao = produto.descricao ?? '';
  const pagamento = apresentarPagamento(descricao);
  return {
    produto,
    linhas,
    meta: meta.join(' · '),
    ...pagamento,
    preco:
      produto.precoCentavos > 0
        ? paraReais(produto.precoCentavos)
        : 'Sob consulta',
    busca: normalizar(
      [produto.nome, descricao, ...linhas.map((item) => item.nome)].join(' '),
    ),
  };
}

function apresentarPagamento(descricao: string): {
  condicao: string;
  descricao: string;
} {
  const parcela =
    /(?:pode ser parcelad[oa] em\s*)?(\d{1,2})\s*x\s*de\s*R\$\s*([\d.]+,\d{2})\.?/i;
  const mensal = /\(?\s*R\$\s*([\d.]+,\d{2})\s*\/\s*m[eê]s\s*\)?/i;
  const parcelas = parcela.exec(descricao);
  const mensalidade = mensal.exec(descricao);
  const condicoes: string[] = [];
  if (parcelas) condicoes.push(`ou ${parcelas[1]}x de R$ ${parcelas[2]}`);
  if (mensalidade) condicoes.push(`R$ ${mensalidade[1]}/mês`);
  return {
    condicao: condicoes.join(' · '),
    descricao: descricao
      .replace(parcela, '')
      .replace(mensal, '')
      .replace(/\s+([.,;])/g, '$1')
      .trim(),
  };
}
