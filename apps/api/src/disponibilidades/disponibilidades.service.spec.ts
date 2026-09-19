import { ConflictException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { semanaDe, semanaSeguinte, type DisponibilidadeSemanal } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { DisponibilidadesService } from './disponibilidades.service.js';

const ANA = 'uid-ana';
const CARLOS = 'uid-carlos';

/**
 * A semana corrente e calculada, nao fixada: o servico usa `new Date()` e a
 * janela editavel anda com o relogio. Um literal aqui faria a suite passar hoje
 * e falhar na segunda-feira seguinte — que e o tipo de teste que ensina todo
 * mundo a ignorar falha vermelha.
 */
function semanaAtual(): string {
  return semanaDe(new Date());
}

/** Um slot de duas horas no dia `dia` (0 = segunda) da semana dada. */
function slot(
  semana: string,
  dia: number,
  hora: number,
): { inicio: string; fim: string } {
  const [ano, mes, primeiro] = semana.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, primeiro + dia, hora));
  const fim = new Date(data.getTime() + 2 * 60 * 60 * 1000);
  return { inicio: data.toISOString(), fim: fim.toISOString() };
}

function montar(): {
  banco: FirestoreFalso;
  disponibilidades: DisponibilidadesService;
} {
  const banco = new FirestoreFalso();
  return {
    banco,
    disponibilidades: new DisponibilidadesService(
      banco as unknown as Firestore,
    ),
  };
}

describe('DisponibilidadesService', () => {
  describe('publicar a semana', () => {
    it('grava um documento por slot, com id deterministico', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const primeiro = slot(semana, 1, 13);

      await disponibilidades.publicar(ANA, { semana, slots: [primeiro] });

      expect([...banco.documentos.keys()]).toEqual([
        `disponibilidades/${ANA}_${primeiro.inicio}`,
      ]);
    });

    /** Salvar a mesma grade duas vezes nao duplica: e o ponto do id
     * deterministico (regra inviolavel 4). */
    it('publicar duas vezes produz os mesmos documentos', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const corpo: DisponibilidadeSemanal = {
        semana,
        slots: [slot(semana, 1, 13), slot(semana, 2, 13)],
      };

      await disponibilidades.publicar(ANA, corpo);
      await disponibilidades.publicar(ANA, corpo);

      expect(banco.documentos.size).toBe(2);
    });

    /**
     * `PUT` e substituicao: o corpo descreve a semana COMO ELA FICA. Com
     * acrescimo, remover um horario exigiria a tela calcular a diferenca — e tela
     * que calcula diferenca erra na primeira falha de rede, deixando o advogado
     * disponivel num horario que ele acabou de tirar.
     */
    it('remove o slot que saiu da grade', async () => {
      const { disponibilidades } = montar();
      const semana = semanaAtual();
      const manha = slot(semana, 1, 13);
      const tarde = slot(semana, 1, 17);

      await disponibilidades.publicar(ANA, { semana, slots: [manha, tarde] });
      await disponibilidades.publicar(ANA, { semana, slots: [manha] });

      const grade = await disponibilidades.obter(ANA, semana);
      expect(grade.map((s) => s.inicio)).toEqual([manha.inicio]);
    });

    it('semana vazia apaga a grade inteira', async () => {
      const { disponibilidades } = montar();
      const semana = semanaAtual();

      await disponibilidades.publicar(ANA, {
        semana,
        slots: [slot(semana, 1, 13)],
      });
      await disponibilidades.publicar(ANA, { semana, slots: [] });

      expect(await disponibilidades.obter(ANA, semana)).toEqual([]);
    });

    /** A grade de um advogado nao pode apagar a de outro: o filtro da transacao
     * inclui `advogadoId`, e sem ele a publicacao de um limparia a do outro. */
    it('nao toca na grade de outro advogado', async () => {
      const { disponibilidades } = montar();
      const semana = semanaAtual();

      await disponibilidades.publicar(CARLOS, {
        semana,
        slots: [slot(semana, 3, 13)],
      });
      await disponibilidades.publicar(ANA, { semana, slots: [] });

      expect(await disponibilidades.obter(CARLOS, semana)).toHaveLength(1);
    });

    it('le a grade atual antes de escrever a nova', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      banco.ordemDeEscrita.length = 0;

      await disponibilidades.publicar(ANA, {
        semana,
        slots: [slot(semana, 1, 13)],
      });

      expect(banco.ordemDeEscrita[0]).toBe('get disponibilidades');
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Slot reservado (Etapa 10)                                               */
  /* ---------------------------------------------------------------------- */

  describe('slot reservado', () => {
    /** Reserva um slot ja publicado, como o agendamento faria. */
    function reservar(
      banco: FirestoreFalso,
      inicio: string,
      reuniaoId = 'r001',
    ): void {
      const caminho = `disponibilidades/${ANA}_${inicio}`;
      banco.documentos.set(caminho, {
        ...(banco.documentos.get(caminho) ?? {}),
        reserva: { pedidoId: 'pedido-1', reuniaoId },
      });
    }

    /**
     * O AVISO DA ETAPA 9 VIRANDO TRAVA. Apagar um slot reservado desmarcaria uma
     * reuniao que o cliente ja agendou — e ele descobriria pela sala vazia no
     * horario, nao por um erro.
     */
    it('recusa publicar a semana sem um slot reservado', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const manha = slot(semana, 1, 13);
      const tarde = slot(semana, 1, 16);

      await disponibilidades.publicar(ANA, {
        semana,
        slots: [manha, tarde],
      });
      reservar(banco, manha.inicio);

      await expect(
        disponibilidades.publicar(ANA, { semana, slots: [tarde] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    /**
     * A MENSAGEM DIZ QUAL HORARIO. O advogado olha uma grade de ate quarenta
     * caixinhas; "ha horario reservado nesta semana" o obrigaria a cacar qual.
     */
    it('a recusa nomeia o horario, no fuso do escritorio', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const manha = slot(semana, 1, 13);

      await disponibilidades.publicar(ANA, { semana, slots: [manha] });
      reservar(banco, manha.inicio);

      /* 13h UTC e 10h em Sao Paulo. A mensagem tem de mostrar 10, nao 13. */
      await expect(
        disponibilidades.publicar(ANA, { semana, slots: [] }),
      ).rejects.toThrow(/10:00/);
    });

    /**
     * RECUSA A SEMANA INTEIRA. Publicar so os livres deixaria a grade num estado
     * que o advogado nao pediu e nao consegue ver.
     */
    it('nao apaga nem grava nada quando recusa', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const manha = slot(semana, 1, 13);
      const tarde = slot(semana, 1, 16);

      await disponibilidades.publicar(ANA, { semana, slots: [manha, tarde] });
      reservar(banco, manha.inicio);
      const antes = [...banco.documentos.keys()].sort();

      await expect(
        disponibilidades.publicar(ANA, { semana, slots: [] }),
      ).rejects.toThrow();

      expect([...banco.documentos.keys()].sort()).toEqual(antes);
    });

    /**
     * O SLOT RESERVADO QUE CONTINUA NA GRADE MANTEM A RESERVA. O `set` e
     * substituicao: sem carregar o campo adiante, republicar a semana — o que o
     * advogado faz toda segunda — deixaria o slot parecendo livre, um segundo
     * cliente o reservaria, e dois clientes teriam o mesmo horario.
     */
    it('republicar a semana preserva a reserva', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const manha = slot(semana, 1, 13);

      await disponibilidades.publicar(ANA, { semana, slots: [manha] });
      reservar(banco, manha.inicio);

      await disponibilidades.publicar(ANA, { semana, slots: [manha] });

      expect(
        banco.documentos.get(`disponibilidades/${ANA}_${manha.inicio}`),
      ).toMatchObject({ reserva: { pedidoId: 'pedido-1', reuniaoId: 'r001' } });
    });

    /** Slot livre continua saindo da grade normalmente. */
    it('nao impede remover slot livre', async () => {
      const { banco, disponibilidades } = montar();
      const semana = semanaAtual();
      const manha = slot(semana, 1, 13);
      const tarde = slot(semana, 1, 16);

      await disponibilidades.publicar(ANA, { semana, slots: [manha, tarde] });
      reservar(banco, manha.inicio);

      await disponibilidades.publicar(ANA, { semana, slots: [manha] });

      expect(banco.documentos.has(`disponibilidades/${ANA}_${tarde.inicio}`)).toBe(
        false,
      );
    });
  });

  describe('janela editavel', () => {
    it('aceita a semana corrente e a seguinte', async () => {
      const { disponibilidades } = montar();

      await expect(
        disponibilidades.publicar(ANA, { semana: semanaAtual(), slots: [] }),
      ).resolves.toEqual([]);
      await expect(
        disponibilidades.publicar(ANA, {
          semana: semanaSeguinte(semanaAtual()),
          slots: [],
        }),
      ).resolves.toEqual([]);
    });

    /**
     * Passado seria reescrever grade que ja produziu — ou deixou de produzir —
     * reuniao. Futuro distante seria compromisso que ninguem lembra de ter
     * assumido quando a data chegar.
     */
    it.each([
      ['no passado', -7],
      ['muito a frente', 21],
    ])('recusa semana %s', async (_nome, dias) => {
      const { disponibilidades } = montar();
      const atual = semanaAtual();
      const [ano, mes, dia] = atual.split('-').map(Number);
      const outra = new Date(Date.UTC(ano, mes - 1, dia + dias))
        .toISOString()
        .slice(0, 10);

      await expect(
        disponibilidades.publicar(ANA, { semana: outra, slots: [] }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('obter', () => {
    /** A semana corrente e CALCULADA na leitura, nao guardada nem aberta por
     * rotina agendada (arquitetura, secao 8). */
    it('sem semana, devolve a corrente', async () => {
      const { disponibilidades } = montar();
      const semana = semanaAtual();
      await disponibilidades.publicar(ANA, {
        semana,
        slots: [slot(semana, 1, 13)],
      });

      expect(await disponibilidades.obter(ANA)).toHaveLength(1);
    });

    it('devolve vazio para semana sem grade', async () => {
      const { disponibilidades } = montar();

      expect(
        await disponibilidades.obter(ANA, semanaSeguinte(semanaAtual())),
      ).toEqual([]);
    });

    it('nao devolve a grade de outro advogado', async () => {
      const { disponibilidades } = montar();
      const semana = semanaAtual();
      await disponibilidades.publicar(CARLOS, {
        semana,
        slots: [slot(semana, 1, 13)],
      });

      expect(await disponibilidades.obter(ANA, semana)).toEqual([]);
    });
  });
});
