# Runbook — medir a verificação de segurança dos arquivos

**Quando usar:** alguém diz que "a verificação de segurança é lenta", ou antes
e depois de qualquer mudança no scanner (CPU, memória, instância mínima, carga
da base), para comparar com número em vez de impressão.

**Quem executa:** os envios, qualquer advogado e cliente de teste; a leitura,
quem tem acesso de leitura aos logs do projeto. O script só lê.

Projeto: `plataforma-juridica-36bda`. Região: `southamerica-east1`.

---

## O que é medido, e onde

Cada arquivo que recebe veredito deixa **uma linha de log** na API, com o sinal
`arquivo.varrido` (`apps/api/src/varredura/medicao.ts`). Ela tem só números, o
fluxo e o veredito: nenhum nome de arquivo, caminho ou conteúdo.

| Campo | Fase |
|---|---|
| `envioMs` | Da URL assinada emitida até o navegador confirmar o envio. É o lado de quem envia: rede e tamanho do arquivo |
| `filaMs` | Da confirmação até a API começar a varredura. É o Cloud Tasks |
| `scannerMs` | A chamada inteira ao scanner, vista pela API |
| `scannerFrio`, `bootMs` | Se foi a primeira varredura da instância do scanner, e quanto ele levou para subir |
| `downloadMs` | O scanner baixando o arquivo do bucket |
| `clamMs` | O antivírus (`clamdscan`) |
| `conferenciaMs` | A API conferindo o conteúdo contra o tipo declarado |
| `moverMs` | Mover da quarentena para o bucket de arquivos |
| `totalMs` | Da confirmação até o veredito gravado |
| `tentativa` | Quantas vezes o Cloud Tasks já tinha tentado. Maior que zero é reentrega |

Duração que não se soube medir sai `null` e não entra na conta. É o caso do
arquivo enviado antes desta medição existir.

O scanner deixa ainda uma linha `scanner.pronto` por instância que sobe, com o
tempo de baixar a base de assinaturas, de subir o `clamd` e do boot inteiro.

**O que as linhas não mostram:**

- **O tempo até a pessoa ver o resultado.** A tela não se atualiza sozinha: o
  arquivo fica disponível, e a tela só muda quando a página é recarregada.
  Anote à mão o que você percebeu, para comparar com o `totalMs`.
- **O tempo do Cloud Run até o contêiner começar a subir** (baixar a imagem e
  iniciar). Aparece como a diferença entre `scannerMs` e a soma de `bootMs`,
  `downloadMs` e `clamMs` numa varredura a frio.

---

## 1. Produzir as amostras

O que separa uma medição útil de uma impressão é ter amostras **a frio** e **a
quente**, nos dois fluxos e em dois tamanhos.

1. **A frio.** Espere pelo menos 15 minutos sem nenhum envio (o scanner desce a
   zero instâncias quando fica parado) e envie **um** arquivo. Confira no painel
   do Cloud Run que o serviço `scanner-lexintegra` estava sem instância.
2. **A quente.** Logo em seguida, envie mais **cinco**, um de cada vez,
   esperando cada um ficar disponível.
3. Repita os dois passos no **outro fluxo**: entregável (como advogado, num
   pedido em elaboração) e anexo (como cliente).
4. Varie o **tamanho**: metade dos envios com um PDF pequeno (perto de 100 kB)
   e metade com um perto do teto (20 MB no entregável, 5 MB no anexo).

Doze envios por fluxo já dão uma tabela legível. Com menos de cinco amostras
numa coluna, leia o p95 como "o pior caso que vimos".

Use arquivos sem dado real. O conteúdo não é registrado, mas o arquivo fica no
pedido até a retenção apagá-lo.

## 2. Ler a tabela

```
node scripts/medir-varredura.mjs plataforma-juridica-36bda 7
```

O segundo argumento é a janela, em dias (1 a 30). A saída é Markdown: as
contagens, a tabela de p50 e p95 por fase em três colunas (frio, quente e
todos, cada uma com o seu `n`) e a subida do scanner.

Para olhar as linhas cruas no Logs Explorer:

```
resource.type="cloud_run_revision"
jsonPayload.sinal="arquivo.varrido"
```

## 3. Como ler o resultado

| O que aparece | O que significa |
|---|---|
| `totalMs` a quente de poucos segundos, a frio de dezenas | Normal para a arquitetura: o scanner sobe do zero e carrega cerca de 1 GB de assinaturas |
| `bootMs` domina o frio | O custo é a subida. As opções são CPU extra no boot, carga mais rápida da base, ou manter uma instância em horário comercial |
| `scannerMs` muito maior que `bootMs` + `downloadMs` + `clamMs` | O tempo está antes do script de entrada: o Cloud Run baixando a imagem e iniciando o contêiner |
| `clamMs` cresce com o tamanho e domina o quente | O limite é CPU do scanner durante a varredura |
| `filaMs` alto com `tentativa` maior que zero | Houve reentrega: o scanner estourou o prazo de 120 s da API e a fila esperou para tentar de novo. É defeito, não lentidão normal |
| `envioMs` domina | O tempo é do navegador de quem envia (rede e tamanho), não da plataforma |
| O `totalMs` é baixo e a pessoa esperou muito | A tela não avisou. É a atualização automática do estado, que não custa infraestrutura |

**Qualquer opção que mude o custo mensal vai para aprovação antes de ser
aplicada.** E nenhuma delas pode servir arquivo antes de `limpo` nem pular a
varredura (regra inviolável 6).

## 4. App Check (cadastro, recuperação de senha e checkout)

O App Check não participa do envio de arquivos nem do login. Onde ele existe, a
medição é manual e não justifica código: abra as ferramentas do navegador na
aba Rede, recarregue a página do checkout e clique no primeiro campo do
formulário. As requisições para `recaptchaenterprise` e
`firebaseappcheck.googleapis.com` mostram quanto a obtenção do token levou. Faça
três vezes, uma delas com o cache desligado, e anote os tempos no PR.

## Relacionados

- [scanner-indisponivel](scanner-indisponivel.md): arquivo parado em
  quarentena e base do ClamAV velha.
