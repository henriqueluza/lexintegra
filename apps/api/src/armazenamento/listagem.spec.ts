import { jest } from '@jest/globals';
import type { Bucket } from '@google-cloud/storage';
import { GcsArmazenamento } from './gcs.armazenamento.js';

it('inventario percorre paginas do GCS, preservando prefixo e limite total', async () => {
  const getFiles = jest
    .fn<(opcoes: unknown) => Promise<unknown[]>>()
    .mockResolvedValueOnce([
      [{ name: 'anexos/p1/a' }],
      { pageToken: 'pagina2' },
    ])
    .mockResolvedValueOnce([[{ name: 'anexos/p1/b' }], undefined]);
  const bucket = { getFiles } as unknown as Bucket;
  const armazenamento = new GcsArmazenamento({
    arquivos: bucket,
    quarentena: bucket,
  });
  expect(await armazenamento.listar('arquivos', 'anexos/p1/', 3)).toEqual([
    'anexos/p1/a',
    'anexos/p1/b',
  ]);
  expect(getFiles).toHaveBeenNthCalledWith(2, {
    prefix: 'anexos/p1/',
    maxResults: 2,
    autoPaginate: false,
    pageToken: 'pagina2',
  });
});

it('para no limite sentinela que faz o inventario recusar excesso', async () => {
  const getFiles = jest
    .fn<(opcoes: unknown) => Promise<unknown[]>>()
    .mockResolvedValue([[{ name: 'anexos/p1/a' }], { pageToken: 'pagina2' }]);
  const bucket = { getFiles } as unknown as Bucket;
  const armazenamento = new GcsArmazenamento({
    arquivos: bucket,
    quarentena: bucket,
  });
  expect(
    await armazenamento.listar('quarentena', 'anexos/p1/', 1),
  ).toHaveLength(1);
  expect(getFiles).toHaveBeenCalledTimes(1);
});
