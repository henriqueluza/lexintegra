import { pendente } from './pendencias-escritorio.js';
import {
  TEXTO_CANCELAR_NAO_DEVOLVE,
  TEXTO_DIREITOS_PRESERVADOS,
  TEXTO_PRAZOS_ESTORNO,
  TEXTO_REGRA_ESTORNO,
} from './regra-estorno.js';

/**
 * Termos de uso e política de privacidade (B2, decisoes.md 1.2), redigidos a
 * partir das decisões fechadas na B2: regra de estorno (3.3), prazos (5.3),
 * contestação (5.4), reuniões (ADR-21, confirmado), retenção (2.2 e 2.3),
 * encarregado e canal (1.3), remetente (5.1) e cartão (3.4). O escritório não
 * enviou texto próprio: o Henrique revisa e leva para aprovação.
 *
 * O QUE AINDA DEPENDE DO ESCRITÓRIO aparece como `[PENDENTE-ESCRITORIO: …]`,
 * pela função `pendente` — nunca escrito à mão (ver `pendencias-escritorio.ts`).
 *
 * A ORDEM DAS SEÇÕES IMPORTA: a página pública (`apps/web/.../conteudo-legal.ts`)
 * troca a última seção dos termos e a primeira e as duas últimas da
 * privacidade pelas versões com os contatos do rodapé.
 */
export const SECOES_TERMOS = [
  {
    titulo: 'A plataforma e o atendimento',
    texto:
      'A LexIntegra organiza a consulta, a contratação e o acompanhamento de serviços jurídicos com escopo definido. O trabalho jurídico de cada pedido é realizado pelo escritório responsável, por meio do advogado a quem o pedido é distribuído. O conteúdo institucional do site explica a plataforma e não substitui a análise individual do seu caso. Navegar no site não constitui contratação.',
  },
  {
    titulo: 'Cadastro inicial e responsabilidade pelas informações',
    texto:
      'O cadastro inicial pede nome, e-mail e telefone e libera a consulta ao catálogo por sete dias neste navegador. Ele não cria senha nem obriga a compra. Informe dados corretos e um e-mail ao qual você tenha acesso. Quem contrata em nome de uma empresa declara estar autorizado a fazê-lo e a compartilhar as informações do serviço.',
  },
  {
    titulo: 'Conta e acesso à área do cliente',
    texto:
      'A conta nasce com a confirmação do primeiro pagamento: você recebe por e-mail um link pessoal para criar a sua senha. A conta reúne todos os pedidos feitos com o mesmo e-mail. Não compartilhe a senha nem os links recebidos. Se perder o acesso, use "Esqueci minha senha" na página de entrada. Os e-mails da plataforma saem de um endereço que não recebe respostas; use os canais indicados nesta página.',
  },
  {
    titulo: 'Escopo, entregáveis e condições da oferta',
    texto:
      'Cada serviço do catálogo informa o que será entregue, o valor, a quantidade de reuniões e de revisões e o prazo de validade das reuniões. Essas condições são registradas no pedido no momento da contratação, e mudanças posteriores do catálogo não alteram o que você já contratou. Atividades fora do escopo descrito não estão incluídas e dependem de conversa e contratação específicas.',
  },
  {
    titulo: 'Carrinho e confirmação da compra',
    texto:
      'O carrinho permite revisar os serviços antes de pagar. O total é confirmado no checkout. Cada serviço pago gera um pedido independente, com suas próprias reuniões, revisões e documentos. Confira seus dados e o resumo antes de confirmar.',
  },
  {
    titulo: 'Pagamento',
    texto:
      'O pagamento é processado pelo prestador de pagamentos contratado pela plataforma. No PIX, observe a validade do código; o pedido nasce quando o prestador confirma o pagamento. O cartão de crédito, quando estiver disponível, é processado na página segura do prestador, com redirecionamento; enquanto não estiver, a opção aparece indicada como "em breve". A exibição de uma cobrança não equivale à confirmação do pagamento: evite pagar duas vezes enquanto a confirmação estiver pendente e procure o atendimento em caso de divergência.',
  },
  {
    titulo: 'Início do trabalho e colaboração do cliente',
    texto:
      'O trabalho começa depois da confirmação do pagamento e da distribuição do pedido a um advogado. Preencha a ficha inicial e envie, se quiser, até três arquivos de apoio por pedido (JPG ou PDF, até 5 MB cada). Informações incompletas podem atrasar ou impedir o andamento. Prazos específicos são combinados no contexto do serviço e não decorrem do conteúdo institucional do site.',
  },
  {
    titulo: 'Documentos, revisões e confirmação de entrega',
    texto:
      'Os documentos do pedido ficam disponíveis na sua área. Você pode pedir as revisões incluídas no serviço, até o saldo indicado no pedido; uma revisão não é um serviço novo. Ao receber a versão final, confirme a entrega: a confirmação registra o recebimento na plataforma e não afasta os seus direitos legais. Antes de baixar cada versão, você aceita o termo de download daquela versão.',
  },
  {
    titulo: 'Reuniões',
    texto:
      'As reuniões são marcadas na sua área, nos horários disponíveis do advogado do pedido, dentro do saldo e do prazo de validade do serviço, contados da confirmação do pagamento, e respeitando o intervalo mínimo entre reuniões do mesmo pedido. A sala on-line e o convite chegam por e-mail. Cancelar ou remarcar com pelo menos 24 horas de antecedência devolve a reunião ao saldo; com menos de 24 horas, só é possível cancelar, e a reunião é consumida. A reunião em que você não comparece também é consumida. Se o escritório desmarcar, a reunião volta ao saldo, com qualquer antecedência, e você recebe um e-mail para marcar de novo. O agendamento on-line depende da habilitação da integração de reuniões.',
  },
  {
    titulo: 'Cancelamento, estorno e direitos legais',
    texto: [
      TEXTO_REGRA_ESTORNO,
      TEXTO_CANCELAR_NAO_DEVOLVE,
      TEXTO_PRAZOS_ESTORNO,
      TEXTO_DIREITOS_PRESERVADOS,
    ].join(' '),
  },
  {
    titulo: 'Contestação do pagamento',
    texto:
      'Se o pagamento for contestado junto ao meio de pagamento, todos os pedidos daquela compra ficam pausados até a conclusão: nada muda neles, e as reuniões futuras são desmarcadas com devolução ao saldo. Você recebe um e-mail avisando. Se a contestação for encerrada a favor do escritório, os pedidos voltam ao normal. Se for encerrada a seu favor, os pedidos são encerrados como estornados, sem nova devolução, porque o valor já voltou pelo meio de pagamento.',
  },
  {
    titulo: 'Arquivos e prazo de armazenamento',
    texto:
      'Envie apenas arquivos relacionados ao serviço e que você esteja autorizado a compartilhar. Todo arquivo passa por verificação antes de ficar disponível. Os documentos entregues e os arquivos de apoio de um pedido são excluídos da plataforma 30 dias depois de todos os documentos do pedido terem a entrega confirmada, e nunca antes de 7 dias após um e-mail de aviso. Baixe e guarde as suas cópias: a plataforma não é arquivo permanente. A exclusão dos arquivos não apaga o histórico do pedido, os pagamentos nem os registros de aceite.',
  },
  {
    titulo: 'Uso adequado e limites do serviço',
    texto:
      'Não use a plataforma para enviar material ilícito, prejudicar outras pessoas, tentar acessar pedidos alheios ou interferir no funcionamento do serviço. A prestação de serviços jurídicos não garante resultado, decisão favorável ou êxito econômico. A plataforma não é canal de plantão: situações urgentes ou com prazo próximo devem ser comunicadas diretamente ao atendimento.',
  },
  {
    titulo: 'Atualizações e dúvidas',
    texto:
      'Estes termos valem junto com as condições registradas em cada pedido. Uma versão nova não altera o texto que você aceitou numa contratação anterior. Dúvidas sobre contratação, acesso, cancelamento ou documentos devem ser enviadas ao atendimento.',
  },
] as const;

export const SECOES_PRIVACIDADE = [
  {
    titulo: 'O que esta política abrange',
    texto:
      'Esta política explica como a LexIntegra trata dados pessoais na navegação, no cadastro inicial, na consulta ao catálogo, na contratação e no acompanhamento dos serviços jurídicos.',
  },
  {
    titulo: 'Dados do cadastro inicial',
    texto:
      'Nome, e-mail e telefone, usados para registrar o seu interesse e liberar o catálogo. O cadastro inicial não pede documento nem dado de cartão. Não registramos endereço IP, navegador ou origem da visita junto com o cadastro.',
  },
  {
    titulo: 'Dados da conta e da contratação',
    texto:
      'Na compra: nome, e-mail, os pedidos com as condições contratadas, a situação dos pagamentos e os registros de aceite dos termos (versão aceita e data). A senha é guardada pelo serviço de autenticação e nunca é vista pelo escritório. Dados de cartão são digitados na página do prestador de pagamentos e não passam pela plataforma.',
  },
  {
    titulo: 'Dados do atendimento',
    texto:
      'A ficha inicial traz informações da sua empresa — cadastro, operação, faturamento, passivo trabalhista, autuações e reclamações —, que são tratadas como confidenciais e lidas apenas pelo advogado do pedido e pela administração. A ficha não pede dado pessoal sensível. Documentos, observações e informações de reuniões podem conter dados de outras pessoas: envie apenas o necessário para o serviço.',
  },
  {
    titulo: 'Para que usamos os dados',
    texto:
      'Para executar o contrato e os procedimentos que o antecedem (cadastro, compra, atendimento, reuniões e entrega), cumprir obrigações legais e exercer direitos em processos e contestações. Não usamos os seus dados para publicidade nem os vendemos. Aceitar os termos não autoriza usos diferentes dos descritos aqui.',
  },
  {
    titulo: 'Quem acessa',
    texto:
      'Você vê os seus próprios pedidos. O advogado vê apenas os pedidos distribuídos a ele. A administração vê o necessário para gerir a plataforma, e cada ação administrativa sobre contas e pagamentos fica registrada.',
  },
  {
    titulo: 'Prestadores de tecnologia',
    texto:
      'A plataforma usa Google Cloud e Firebase (infraestrutura, banco de dados no Brasil e autenticação), Resend (envio de e-mails), AbacatePay (pagamentos) e, quando as reuniões on-line estiverem habilitadas, Microsoft Teams. Cada prestador recebe só o necessário à sua função. A autenticação e o envio de e-mails são processados fora do Brasil, pelos prestadores, sob as salvaguardas contratuais deles.',
  },
  {
    titulo: 'Armazenamento no seu navegador',
    texto:
      'O navegador guarda o necessário para o site funcionar: a liberação do catálogo por sete dias, os itens do carrinho e a sessão da sua conta. Não usamos cookies de publicidade nem rastreamento de terceiros. Apagar esses dados do navegador encerra a sessão e esvazia o carrinho.',
  },
  {
    titulo: 'Segurança',
    texto:
      'Usamos controle de acesso por perfil, verificação de identidade em cada requisição, verificação de arquivos contra vírus e registros técnicos sem conteúdo dos documentos. Nenhuma medida garante segurança absoluta. Se suspeitar de uso indevido da sua conta, troque a senha e avise o atendimento.',
  },
  {
    titulo: 'Por quanto tempo guardamos',
    texto: `Os documentos entregues e os arquivos de apoio de cada pedido são excluídos 30 dias depois de todos os documentos do pedido terem a entrega confirmada, com aviso por e-mail pelo menos 7 dias antes; durante uma contestação do pagamento, a exclusão fica suspensa. Os demais registros — cadastro, pedidos, pagamentos e aceites — seguem a política de guarda do escritório: ${pendente('politica-de-guarda')}.`,
  },
  {
    titulo: 'Seus direitos',
    texto: `Você pode pedir confirmação de que tratamos seus dados, acesso, correção, anonimização ou eliminação do que for desnecessário, portabilidade, informação sobre compartilhamento e revisão de decisões, além de revogar consentimentos. A confirmação e o acesso em formato simplificado são respondidos imediatamente, e a declaração completa em até 15 dias, como prevê a LGPD. Para os demais pedidos: ${pendente('prazo-direitos-art-18')}. Poderemos pedir uma confirmação proporcional de identidade. Você também pode peticionar à Autoridade Nacional de Proteção de Dados.`,
  },
  {
    titulo: 'Atualizações',
    texto:
      'Esta política pode mudar para refletir mudanças do serviço. A data no topo identifica a versão em vigor, e as versões anteriores aceitas continuam registradas.',
  },
] as const;
