# Runbook — exportacao e solicitacao de eliminacao do titular

## Estado e responsabilidade

Somente um usuario autenticado com a claim `role: admin` pode chamar estas
rotas. O escritorio B&C e o controlador; cabe a ele validar a identidade de quem
solicita e a legitimidade do destinatario do pacote. Nenhuma rota e publica.
O pedido chega pelo e-mail unico de contato, `suportelexintegra@gmail.com`, e
deve ser respondido em ate **15 dias corridos** (decisoes 1.4).

**Desde 05/10/2026 a eliminacao executa**, pela politica de guarda de
`packages/shared/src/politica-de-guarda.ts` (decisoes 2.1, proposta sujeita a
aprovacao do escritorio): 5 anos depois do ultimo pedido para os registros do
cliente, 6 meses para o cadastro inicial sem conta, aviso 7 dias antes, contado
do envio confirmado. A regra completa esta em
[`docs/entrega/lgpd.md`](../entrega/lgpd.md), secao 3. Dados que ficam
guardados por obrigacao legal continuam identificaveis e nao podem ser
descritos como anonimizados.

## Fonte do inventario

`apps/api/src/lgpd/mapa.ts` e a fonte unica das colecoes, subcolecoes, referencias,
campos de Auth e prefixos dos dois buckets. O pacote inclui esse mapa, e a
simulacao o usa para associar cada documento ao tratamento **proposto**.

O leitor percorre clientes, anamnese, pedidos, entregaveis e transicoes,
observacoes, anexos, reunioes, checkouts, pagamentos, estornos, pre-cadastros,
outbox, aceites, reservas de disponibilidade e as proprias solicitacoes LGPD.
Consulta tambem referencias a pedidos e pagamentos: um convite enviado ao
advogado ou um estorno enviado ao gateway nao tem o cliente como destinatario.
Pagamentos anormais ainda vinculados a um checkout do titular entram pelo
`checkoutId`. Pagamentos orfaos sem vinculo recuperavel precisam de conciliacao
humana; o sistema nao adivinha o titular.

O inventario dos buckets inclui versoes antigas e quarentena, apenas por
prefixos dos pedidos encontrados. Nao inclui arquivos locais, copias ja
baixadas pelo escritorio, registros mantidos pelo gateway, caixas de e-mail ou
salas do Teams: esses subprocessadores exigem procedimento proprio. Backups e
PITR tambem precisam entrar na politica final de guarda/restauracao.

## Exportar

1. Localize o UID em `clientes` ou o ID em `pre-cadastros`. A rota nao recebe
   e-mail na URL. Para pre-cadastro com conta de cliente, a resolucao converge
   para essa conta. Perfis de advogado e admin nao sao tratados como clientes.
2. Com uma sessao administrativa, envie
   `POST /api/admin/lgpd/clientes/{uid}/exportacao`, ou
   `POST /api/admin/lgpd/pre-cadastros/{id}/exportacao`.
3. Salve a resposta binaria como `titular.tar`, em armazenamento restrito.
   E um pacote sensivel: nao anexar em PR, issue ou log.
4. Extraia com uma ferramenta TAR comum. `dados.json` traz registros, mapa,
   inventario e a correspondencia entre nome original e arquivo numerado.
   `arquivos/` contem os bytes dos anexos/entregaveis atuais com estado `limpo`.
5. Confira o conteudo antes da entrega por canal privado ao titular.

O portao de arquivos rele propriedade, caminho e estado antes de fornecer bytes.
Quarentena e versoes antigas sem metadados que comprovem a liberacao nao sao
servidas. O aceite comercial de download nao condiciona esta exportacao
administrativa. Tokens, hashes de senha/liberacao, links de acesso e detalhes de
falhas do outbox nao fazem parte do JSON.

O pacote e montado em memoria, nao e salvo em bucket, nao gera URL assinada e a
resposta tem `Cache-Control: no-store`. Limites tecnicos: 2.000 documentos,
2.000 objetos inventariados, limite de arquivo da politica de cada fluxo
(5 MiB para anexos, 20 MiB para entregaveis) e 25 MiB por pacote. Excesso
recusa a operacao; nao produz um pacote silenciosamente truncado. Um titular
acima desses limites exige ampliar o mecanismo com paginacao/streaming antes
do atendimento, sem recorrer a exportacao global do banco.

As leituras sao sucessivas, nao um snapshot atomico entre Firestore, Auth e GCS.
Os instantes inicial/final e essa limitacao constam no JSON. A aplicacao nao
oferece alteracao de e-mail; mudancas manuais no Auth ou documentos legados
exigem conferir vinculos historicos antes de afirmar completude.

## Simular e registrar eliminacao

- `GET /api/admin/lgpd/{tipo}/{id}/simulacao`: inventario sem conteudo dos
  documentos, tratamento proposto, politica e impedimentos.
- `GET .../simulacao` traz tambem o `escopo` (`parcial` dentro dos 5 anos,
  `total` depois), a `guardaAte` e, por documento, a `guarda` e se ele sai
  (`eliminadoNesteEscopo`). E o que se diz ao titular.
- `POST /api/admin/lgpd/{tipo}/{id}/eliminacao`: cria ou reavalia o mesmo
  protocolo deterministico; responde `200` com `impedida` (e a lista) ou
  `aguardando_execucao`. No segundo caso o aviso ja foi escrito no outbox e
  despachado. Isso **ainda nao e dado eliminado**.
- `POST /api/admin/lgpd/{tipo}/{id}/eliminacao/executar`: executa. Responde
  `404` sem solicitacao; `409` com `motivo` (`impedida`,
  `aviso_nao_confirmado`, `aguardando_prazo_do_aviso` com `executavelEm`,
  `em_execucao`, `reavaliar`); `200` com o resumo (`escopo`, `eliminados`,
  `mantidos`, `guardaAte`). Repetir depois de concluida devolve o mesmo resumo.
  A rotina diaria executa sozinha as que ja podem andar.
- `PUT /api/admin/lgpd/{tipo}/{id}/retencao-legal` (corpo `motivo`:
  `obrigacao_legal`, `processo_em_curso` ou `pedido_de_autoridade`, e
  `descricao`) registra a excecao que suspende tudo; `DELETE` a remove. As duas
  vao para a auditoria.

`tipo` aceita somente `clientes` ou `pre-cadastros`. Titular inexistente retorna
404; perfil sem acesso administrativo e recusado pelo guard global. Pedido
ativo sem todos os entregaveis entregues impede a eliminacao. Reuniao futura
ativa, inclusive `reservada_sem_link`, impede independentemente da situacao do
pedido. Horario inconsistente tambem exige revisao. Cada impedimento identifica
o caminho do pedido ou da reuniao.

O protocolo sobrevive a interrupcao do processo. Repetir a solicitacao recalcula
os impedimentos e preserva o autor inicial. Se o compromisso foi resolvido, a
solicitacao passa a `aguardando_execucao` num **ciclo novo**, com aviso novo:
um aviso antigo nunca autoriza uma execucao de agora. Nada suspende a conta,
modifica o pedido ou apaga objetos durante a espera do aviso.

Protocolos anteriores a 05/10/2026 (`aguardando_politica`) precisam ser
reavaliados com `POST .../eliminacao` antes de executar.

## Aviso e executor

O que a lista de setembro pedia, e onde ficou (`apps/api/src/lgpd/eliminacao.service.ts`):

1. **Politica registrada:** `guarda-v1-2026-10-proposta`, com a guarda de cada
   colecao no mapa (`contrato`, `eliminavel`, `limpar_referencia`, `trilha`).
2. **Trava contra escrita nova:** a conta e bloqueada (`disabled` e revogacao)
   antes de apagar; advogado nao escreve porque pedido em andamento e
   impedimento. A lista de caminhos e refeita DEPOIS de tomar o protocolo.
3. **Aviso:** evento proprio, `aviso-eliminacao-titular`, com chave por
   solicitacao e ciclo (`{protocolo}_c{n}`), texto em
   `shared/textos-documentos.ts`.
4. **Envio confirmado:** o executor le `estado: enviado` e `enviadoEm` do
   registro do outbox e so anda 7 dias depois.
5. **Idempotente e retomavel:** arrendamento de 15 minutos no protocolo,
   checkpoint antes de apagar a conta, e todo passo tolera repeticao.
6. **Entre sistemas:** a conta de login sai por ultimo; objeto ausente nao
   falha; pedido parcial sai da fila da retencao (que senao avisaria uma conta
   que nao existe). URLs de upload ja emitidas expiram sozinhas. Restauracao de
   backup e dados de subprocessadores continuam procedimento humano
   (`lgpd.md`, secao 4).

## Auditoria e verificacao

`solicitacoes-lgpd` guarda o UID do administrador solicitante, acao, estado,
instantes e vinculo ao titular. Exportacao registra `pacote_preparado`, que nao
afirma que o destinatario recebeu ou baixou o pacote. Logs operacionais carregam
somente acao, protocolo e estado, sem nome, e-mail ou conteudo. Os protocolos de
eliminacao sao pseudonimos, nao dados anonimos.

Testes: `apps/api/src/lgpd/lgpd.integration-spec.ts` exercita HTTP, emuladores,
isolamento, TAR com bytes reais, bloqueios, repeticao concorrente, a eliminacao
parcial de ponta a ponta e a retencao legal; `eliminacao.spec.ts` cobre os
escopos, o aviso, a retomada e a rotina diaria. Storage usa
o adaptador falso, como os demais testes de upload; nao ha acesso a buckets de
producao. Os unitarios defendem os limites e os caminhos negativos.
