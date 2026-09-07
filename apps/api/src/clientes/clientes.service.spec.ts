import { NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { normalizarParaBusca } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { ClientesService } from './clientes.service.js';

const PESSOAS = [
  {
    uid: 'uid-1',
    nome: 'José Antônio Ribeiro',
    email: 'jose@empresa.com.br',
    produtos: ['Parecer Juridico Trabalhista'],
  },
  {
    uid: 'uid-2',
    nome: 'Ana Conceição',
    email: 'ana.silva@outra.com.br',
    produtos: ['Due Diligence Simplificada'],
  },
  {
    uid: 'uid-3',
    nome: 'Bruno Alves',
    email: 'bruno@empresa.com.br',
    produtos: ['Parecer Juridico Trabalhista', 'Due Diligence Simplificada'],
  },
];

function montar(): { banco: FirestoreFalso; clientes: ClientesService } {
  const banco = new FirestoreFalso();

  for (const pessoa of PESSOAS) {
    banco.documentos.set(`clientes/${pessoa.uid}`, {
      nome: pessoa.nome,
      email: pessoa.email,
      nomeNormalizado: normalizarParaBusca(pessoa.nome),
      emailNormalizado: normalizarParaBusca(pessoa.email),
      produtosContratados: pessoa.produtos,
    });
  }

  return {
    banco,
    clientes: new ClientesService(banco as unknown as Firestore),
  };
}

describe('ClientesService', () => {
  describe('busca (item 2.5.8)', () => {
    it('sem filtro, devolve todos ordenados por nome', async () => {
      const { clientes } = montar();

      const encontrados = await clientes.buscar({});

      expect(encontrados.map((cliente) => cliente.nome)).toEqual([
        'Ana Conceição',
        'Bruno Alves',
        'José Antônio Ribeiro',
      ]);
    });

    /**
     * O caso que a denormalizacao existe para resolver (arquitetura 5.5): quem
     * digita sem acento — que e a maioria, num campo de busca — precisa
     * encontrar quem tem acento no nome.
     */
    it.each([
      ['jose', 'José Antônio Ribeiro'],
      ['José', 'José Antônio Ribeiro'],
      ['ANTONIO', 'José Antônio Ribeiro'],
      ['conceicao', 'Ana Conceição'],
    ])('acha por "%s"', async (termo, esperado) => {
      const { clientes } = montar();

      const encontrados = await clientes.buscar({ busca: termo });

      expect(encontrados.map((cliente) => cliente.nome)).toEqual([esperado]);
    });

    it('acha por parte do e-mail', async () => {
      const { clientes } = montar();

      const encontrados = await clientes.buscar({ busca: 'empresa.com.br' });

      expect(encontrados.map((cliente) => cliente.uid).sort()).toEqual([
        'uid-1',
        'uid-3',
      ]);
    });

    it('filtra por produto contratado', async () => {
      const { clientes } = montar();

      const encontrados = await clientes.buscar({
        produto: 'Due Diligence Simplificada',
      });

      expect(encontrados.map((cliente) => cliente.uid).sort()).toEqual([
        'uid-2',
        'uid-3',
      ]);
    });

    it('combina produto e termo', async () => {
      const { clientes } = montar();

      const encontrados = await clientes.buscar({
        produto: 'Due Diligence Simplificada',
        busca: 'bruno',
      });

      expect(encontrados.map((cliente) => cliente.uid)).toEqual(['uid-3']);
    });

    it('devolve vazio quando nada casa', async () => {
      const { clientes } = montar();

      expect(await clientes.buscar({ busca: 'ninguem' })).toEqual([]);
    });

    it('termo vazio nao filtra', async () => {
      const { clientes } = montar();

      expect(await clientes.buscar({ busca: '' })).toHaveLength(3);
    });
  });

  describe('obter', () => {
    it('devolve o cliente', async () => {
      const { clientes } = montar();

      expect(await clientes.obter('uid-2')).toMatchObject({
        uid: 'uid-2',
        nome: 'Ana Conceição',
      });
    });

    it('recusa quem nao existe', async () => {
      const { clientes } = montar();

      await expect(clientes.obter('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('nomesDe', () => {
    it('resolve varios de uma vez', async () => {
      const { clientes } = montar();

      const nomes = await clientes.nomesDe(['uid-1', 'uid-2']);

      expect(nomes.get('uid-1')).toBe('José Antônio Ribeiro');
      expect(nomes.get('uid-2')).toBe('Ana Conceição');
    });

    /** Dez pedidos do mesmo cliente sao UMA leitura, nao dez. */
    it('deduplica antes de ler', async () => {
      const { banco, clientes } = montar();
      banco.ordemDeEscrita.length = 0;

      await clientes.nomesDe(['uid-1', 'uid-1', 'uid-1']);

      expect(banco.ordemDeEscrita).toEqual(['get clientes/uid-1']);
    });

    it('cliente ausente vira texto, nao excecao', async () => {
      const { clientes } = montar();

      const nomes = await clientes.nomesDe(['sumido']);

      expect(nomes.get('sumido')).toBe('(cliente nao encontrado)');
    });

    it('lista vazia nao le nada', async () => {
      const { banco, clientes } = montar();
      banco.ordemDeEscrita.length = 0;

      expect(await clientes.nomesDe([])).toEqual(new Map());
      expect(banco.ordemDeEscrita).toEqual([]);
    });
  });

  describe('anamnese', () => {
    it('devolve os campos na ordem gravada', async () => {
      const { banco, clientes } = montar();
      banco.documentos.set('clientes/uid-1/anamnese/ficha-1', {
        campos: [
          { rotulo: 'Area do direito', valor: 'Trabalhista' },
          { rotulo: 'Ja houve acao judicial?', valor: 'Nao' },
        ],
        criadoEm: 1,
      });

      const fichas = await clientes.anamneseDe('uid-1');

      expect(fichas).toHaveLength(1);
      expect(fichas[0].campos.map((campo) => campo.rotulo)).toEqual([
        'Area do direito',
        'Ja houve acao judicial?',
      ]);
    });

    it('cliente sem anamnese devolve lista vazia', async () => {
      const { clientes } = montar();

      expect(await clientes.anamneseDe('uid-3')).toEqual([]);
    });
  });
});
