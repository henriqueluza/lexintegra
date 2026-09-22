# Runbook — exportacao e solicitacao de eliminacao do titular

## Estado e responsabilidade

Somente um usuario autenticado com a claim `role: admin` pode chamar estas
rotas. O escritorio B&C e o controlador; cabe a ele validar a identidade de quem
solicita e a legitimidade do destinatario do pacote. Nenhuma rota e publica e
nenhum Scheduler foi acrescentado.

**A eliminacao efetiva esta bloqueada.** A decisao de setembro de 2026 permite
inventario, exportacao, simulacao e registro retomavel da solicitacao enquanto o
controlador define os documentos, campos, fundamentos e prazos de guarda. Nao ha
executor destrutivo liberado, nem variavel de ambiente capaz de liga-lo.

A politica em `apps/api/src/lgpd/politica.ts` fixa a antecedencia proposta em sete
dias corridos, contados da confirmacao de envio pelo provedor, e mantem o prazo
de guarda como `null`. Nao e prazo legal presumido. Dados cuja conservacao
identificavel seja necessaria nao podem ser descritos como anonimizados.

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
- `POST /api/admin/lgpd/{tipo}/{id}/eliminacao`: cria ou reavalia o mesmo
  protocolo deterministico; responde `200`, com `impedida` ou
  `aguardando_politica`. Isso **nao significa dado eliminado**.
- `POST /api/admin/lgpd/{tipo}/{id}/eliminacao/executar`: registra/reavalia e
  responde `409`, inclusive para pedido inteiramente concluido, pois a politica
  continua pendente.

`tipo` aceita somente `clientes` ou `pre-cadastros`. Titular inexistente retorna
404; perfil sem acesso administrativo e recusado pelo guard global. Pedido
ativo sem todos os entregaveis entregues impede a eliminacao. Reuniao futura
ativa, inclusive `reservada_sem_link`, impede independentemente da situacao do
pedido. Horario inconsistente tambem exige revisao. Cada impedimento identifica
o caminho do pedido ou da reuniao.

O protocolo sobrevive a interrupcao do processo. Repetir a solicitacao recalcula
os impedimentos e preserva o autor inicial. Se o compromisso foi resolvido, a
solicitacao passa a `aguardando_politica`. Nada suspende a conta, modifica o
pedido ou apaga objetos durante essa espera.

## Aviso e executor: pendentes da politica final

Nenhum aviso de exclusao e enviado nesta fase: sem data nem politica aprovada,
o aviso anunciaria uma exclusao que nao pode acontecer. A retomada futura deve:

1. Registrar a versao aprovada da politica e a decisao do controlador para cada
   categoria, incluindo conservacao identificavel, minimizacao e prazo.
2. Implementar e testar trava transacional contra novas escritas, pagamentos,
   uploads, reunioes e tarefas durante o processamento; uma lista de caminhos
   obtida antes da trava nao e um plano destrutivo seguro.
3. Reaproveitar `aviso-exclusao-arquivos` no outbox, com chave por solicitacao
   que nao colida com avisos antigos do titular. Aprovar o texto correspondente.
4. Conferir `estado: enviado` e `enviadoEm` do outbox; aguardar sete dias a
   partir desse instante. Enfileiramento e flag de pedido avisado nao provam envio.
5. Executar passos idempotentes com checkpoints por documento/objeto/conta,
   conferindo novamente impedimentos, escopo e versao da politica.
6. Tratar falhas entre sistemas, reentregas do outbox, URLs de upload ainda
   validas, restauracao de backup e dados de subprocessadores.

Essa continuacao exige codigo, testes e revisao; trocar `aprovada` para `true`
na constante atual nao implementa nem libera exclusao.

## Auditoria e verificacao

`solicitacoes-lgpd` guarda o UID do administrador solicitante, acao, estado,
instantes e vinculo ao titular. Exportacao registra `pacote_preparado`, que nao
afirma que o destinatario recebeu ou baixou o pacote. Logs operacionais carregam
somente acao, protocolo e estado, sem nome, e-mail ou conteudo. Os protocolos de
eliminacao sao pseudonimos, nao dados anonimos.

Testes: `apps/api/src/lgpd/lgpd.integration-spec.ts` exercita HTTP, emuladores,
isolamento, TAR com bytes reais, bloqueios e repeticao concorrente. Storage usa
o adaptador falso, como os demais testes de upload; nao ha acesso a buckets de
producao. Os unitarios defendem os limites e os caminhos negativos.
