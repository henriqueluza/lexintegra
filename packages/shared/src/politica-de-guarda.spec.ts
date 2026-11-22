import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SECOES_PRIVACIDADE } from './documentos-legais.js';
import {
  ANOS_GUARDA_CLIENTE,
  DIAS_AVISO_ELIMINACAO,
  DIAS_GUARDA_REGISTROS_DE_ACESSO,
  DIAS_RECUPERACAO_PITR,
  MESES_GUARDA_PRE_CADASTRO,
  MESES_GUARDA_REGISTROS_DE_ACESSO,
  PRAZO_DIREITOS_TITULAR_DIAS,
  RETENCAO_BACKUP_DIARIO_DIAS,
  RETENCAO_BACKUP_SEMANAL_SEMANAS,
  SEMANAS_MAXIMAS_EM_COPIA,
  TEXTO_COPIAS_DE_SEGURANCA,
  TEXTO_POLITICA_DE_GUARDA,
  ehMotivoRetencaoLegal,
  eliminacaoPermitidaEm,
  fimDaGuardaDoCliente,
  fimDaGuardaDoPreCadastro,
  inicioDaGuardaVigenteDoCliente,
  inicioDaGuardaVigenteDoPreCadastro,
  somarMeses,
} from './politica-de-guarda.js';

const d = (iso: string): Date => new Date(iso);

describe('politica de guarda (decisoes.md 1.4 e 2.1, 05/10/2026)', () => {
  it('fixa os prazos decididos', () => {
    expect(PRAZO_DIREITOS_TITULAR_DIAS).toBe(15);
    expect(ANOS_GUARDA_CLIENTE).toBe(5);
    expect(MESES_GUARDA_PRE_CADASTRO).toBe(6);
    expect(MESES_GUARDA_REGISTROS_DE_ACESSO).toBe(6);
    expect(DIAS_AVISO_ELIMINACAO).toBe(7);
  });

  /** O Marco Civil fixa um MINIMO: a janela em dias nunca e menor que 6 meses. */
  it('a janela dos registros de acesso cobre 6 meses de qualquer calendario', () => {
    expect(DIAS_GUARDA_REGISTROS_DE_ACESSO).toBeGreaterThanOrEqual(31 * 6);
  });

  /** O bucket de logs do Terraform guarda exatamente a janela da constante. */
  it('o bucket registros-de-acesso usa a mesma janela', () => {
    const terraform = readFileSync(
      fileURLToPath(
        new URL(
          '../../../infra/terraform/registros-de-acesso.tf',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    expect(/retention_days\s*=\s*(\d+)/u.exec(terraform)?.[1]).toBe(
      String(DIAS_GUARDA_REGISTROS_DE_ACESSO),
    );
  });

  it('soma meses de calendario segurando no ultimo dia do mes', () => {
    expect(somarMeses(d('2026-08-31T12:00:00Z'), 6).toISOString()).toBe(
      '2027-02-28T12:00:00.000Z',
    );
    expect(somarMeses(d('2027-08-31T00:00:00Z'), 6).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(somarMeses(d('2026-10-05T03:00:00Z'), -6).toISOString()).toBe(
      '2026-04-05T03:00:00.000Z',
    );
    expect(somarMeses(d('2026-01-15T00:00:00Z'), 0).toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
  });

  it('cliente: 5 anos depois do ultimo pedido, inclusive em 29/02', () => {
    expect(fimDaGuardaDoCliente(d('2026-10-05T00:00:00Z')).toISOString()).toBe(
      '2031-10-05T00:00:00.000Z',
    );
    expect(fimDaGuardaDoCliente(d('2028-02-29T10:00:00Z')).toISOString()).toBe(
      '2033-02-28T10:00:00.000Z',
    );
  });

  it('cadastro inicial: 6 meses depois do ultimo envio', () => {
    expect(
      fimDaGuardaDoPreCadastro(d('2026-10-05T00:00:00Z')).toISOString(),
    ).toBe('2027-04-05T00:00:00.000Z');
  });

  /** O limite das consultas e o inverso exato do fim da guarda. */
  it('o inicio da guarda vigente devolve o instante que acabou de vencer', () => {
    const agora = d('2031-10-05T00:00:00Z');
    expect(inicioDaGuardaVigenteDoCliente(agora).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(
      fimDaGuardaDoCliente(inicioDaGuardaVigenteDoCliente(agora)).getTime(),
    ).toBe(agora.getTime());
    expect(
      inicioDaGuardaVigenteDoPreCadastro(
        d('2027-04-05T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-10-05T00:00:00.000Z');
  });

  it('a eliminacao avisada so vem 7 dias depois do envio confirmado', () => {
    expect(eliminacaoPermitidaEm(d('2026-10-05T10:00:00Z')).toISOString()).toBe(
      '2026-10-12T10:00:00.000Z',
    );
  });

  it('reconhece so as tres excecoes decididas', () => {
    expect(ehMotivoRetencaoLegal('processo_em_curso')).toBe(true);
    expect(ehMotivoRetencaoLegal('pedido_de_autoridade')).toBe(true);
    expect(ehMotivoRetencaoLegal('obrigacao_legal')).toBe(true);
    expect(ehMotivoRetencaoLegal('vontade_do_admin')).toBe(false);
    expect(ehMotivoRetencaoLegal(undefined)).toBe(false);
  });

  /** O texto publico diz os numeros das constantes, e nao outros. */
  it('a politica de privacidade publica os prazos das constantes', () => {
    const privacidade = SECOES_PRIVACIDADE.map((s) => s.texto).join(' ');
    expect(privacidade).toContain(TEXTO_POLITICA_DE_GUARDA);
    expect(privacidade).toContain('em até 15 dias corridos');
    expect(TEXTO_POLITICA_DE_GUARDA).toContain(
      '5 anos depois do seu último pedido',
    );
    expect(TEXTO_POLITICA_DE_GUARDA).toContain(
      '6 meses depois do último envio',
    );
    expect(TEXTO_POLITICA_DE_GUARDA).toContain(
      'Marco Civil da Internet (art. 15)',
    );
    expect(TEXTO_POLITICA_DE_GUARDA).toContain('pelo menos 7 dias antes');
  });

  /**
   * COPIAS DE SEGURANCA (lote de novembro de 2026, ADR-23). Backup e dado
   * pessoal: cada copia guarda os dados de todos os titulares ate expirar. Os
   * numeros que a politica de privacidade publica sao os da infraestrutura, e
   * estes testes sao o que impede um de mudar sem o outro.
   */
  describe('copias de seguranca do banco', () => {
    function terraform(arquivo: string): string {
      return readFileSync(
        fileURLToPath(
          new URL(`../../../infra/terraform/${arquivo}`, import.meta.url),
        ),
        'utf8',
      );
    }

    /** O `default` de uma variavel do Terraform, lido do bloco dela. */
    function padraoDaVariavel(nome: string): string | undefined {
      const bloco = new RegExp(
        `variable "${nome}" \\{[\\s\\S]*?\\n\\}`,
        'u',
      ).exec(terraform('variables.tf'))?.[0];
      return /\n\s*default\s*=\s*(\d+)/u.exec(bloco ?? '')?.[1];
    }

    it('fixa as retencoes propostas', () => {
      expect(DIAS_RECUPERACAO_PITR).toBe(7);
      expect(RETENCAO_BACKUP_DIARIO_DIAS).toBe(7);
      expect(RETENCAO_BACKUP_SEMANAL_SEMANAS).toBe(8);
    });

    it('o Terraform guarda os backups pelo mesmo prazo das constantes', () => {
      expect(padraoDaVariavel('backup_diario_retencao_dias')).toBe(
        String(RETENCAO_BACKUP_DIARIO_DIAS),
      );
      expect(padraoDaVariavel('backup_semanal_retencao_semanas')).toBe(
        String(RETENCAO_BACKUP_SEMANAL_SEMANAS),
      );
    });

    /**
     * As variaveis so valem se os dois agendamentos as usarem. Um literal no
     * lugar da variavel passaria no teste acima e guardaria por outro prazo.
     */
    it('os dois agendamentos existem e leem as variaveis', () => {
      const firestore = terraform('firestore.tf');

      expect(firestore).toMatch(
        /resource "google_firestore_backup_schedule" "diario"[\s\S]*?retention = "\$\{var\.backup_diario_retencao_dias \* 86400\}s"[\s\S]*?daily_recurrence \{\}/u,
      );
      expect(firestore).toMatch(
        /resource "google_firestore_backup_schedule" "semanal"[\s\S]*?retention = "\$\{var\.backup_semanal_retencao_semanas \* 7 \* 86400\}s"[\s\S]*?weekly_recurrence \{/u,
      );
    });

    it('o PITR continua ligado, com a janela que a constante diz', () => {
      expect(terraform('firestore.tf')).toContain(
        'point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"',
      );
    });

    /** O prazo publicado e o MAIOR dos tres: e o pior caso para o titular. */
    it('o prazo maximo em copia e o do backup semanal', () => {
      expect(SEMANAS_MAXIMAS_EM_COPIA).toBe(RETENCAO_BACKUP_SEMANAL_SEMANAS);
    });

    it('a politica de privacidade diz o prazo e o que acontece com o eliminado', () => {
      const privacidade = SECOES_PRIVACIDADE.map((s) => s.texto).join(' ');

      expect(privacidade).toContain(TEXTO_COPIAS_DE_SEGURANCA);
      expect(TEXTO_COPIAS_DE_SEGURANCA).toContain('por até 8 semanas');
      expect(TEXTO_COPIAS_DE_SEGURANCA).toContain(
        'continua nas cópias já feitas até que elas expirem',
      );
      expect(TEXTO_COPIAS_DE_SEGURANCA).toContain('são refeitas');
    });
  });
});
