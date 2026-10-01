import {
  TEXTO_COMPLETO_ESTORNO,
  TEXTO_PRAZOS_ESTORNO,
  TEXTO_REGRA_ESTORNO,
} from './regra-estorno.js';

/**
 * O texto acompanha a regra do servidor (`impedimentoDoEstorno`). Cada
 * condicao do decisoes.md 3.3 e cada prazo do 5.3 precisa estar escrito.
 */
describe('regra de estorno (decisoes.md 3.3, 5.3 e 5.4)', () => {
  it.each([
    'o trabalho ainda não começou',
    'nenhum documento foi enviado pelo advogado',
    'nenhuma reunião do pedido já aconteceu',
    'arquivos de apoio que você enviou não impedem',
    'Reuniões ainda futuras são desmarcadas',
    'contestação do pagamento',
  ])('a regra diz: %s', (trecho) => {
    expect(TEXTO_REGRA_ESTORNO).toContain(trecho);
  });

  it.each([
    '5 dias úteis',
    'PIX',
    'operadora do cartão',
    '2 dias úteis',
    '30 dias',
  ])('os prazos dizem: %s', (trecho) => {
    expect(TEXTO_PRAZOS_ESTORNO).toContain(trecho);
  });

  it('o texto completo junta as quatro partes', () => {
    expect(TEXTO_COMPLETO_ESTORNO).toContain('Código de Defesa do Consumidor');
    expect(TEXTO_COMPLETO_ESTORNO).toContain('não devolve o valor');
  });
});
