# Operação do proprietário global

O papel `platform_owner` dá acesso ao painel global da PUVO e às rotas de moderação de Produtos e Serviços e de gestão de publicidade. O painel agrega contagens operacionais e não mostra dados pessoais.

## Primeira concessão

1. Criar a conta normalmente e concluir a confirmação do endereço de email.
2. Confirmar que o terminal está ligado à base de dados do ambiente pretendido; nunca copiar `DATABASE_URL` para o chat ou para este documento.
3. Executar uma única vez num terminal operacional confiável:

   ```sh
   pnpm --filter @puvo/api platform-owner:bootstrap pessoa@dominio.ao --confirm-once
   ```

O comando aceita apenas uma conta ativa com email confirmado, cria o papel e o evento de auditoria na mesma transação e recusa uma segunda concessão. O PostgreSQL também impõe a existência de, no máximo, um proprietário global. Não existe endpoint público para conceder este papel.

Depois da implantação, abrir `/admin`. A API `GET /api/v1/platform-owner/overview` deve responder 200 para o proprietário e 403 para uma conta comum. O painel liga a `/admin/moderacao`, `/admin/profissionais`, `/admin/denuncias-servicos` e `/admin/publicidade`.

## Estado desta entrega

A migração `011_platform_owner.sql` foi aplicada e verificada apenas no PostgreSQL de desenvolvimento. O código está pronto para ser publicado; a produção continua sem uma conta registada e não recebeu esta migração nem qualquer atribuição de papel nesta etapa. Após publicar o código, criar e confirmar a conta de destino na produção antes de executar o comando com a `DATABASE_URL` de produção.

O proprietário não tem ainda um fluxo de transferência ou substituição pela interface. Uma recuperação deve ser executada por um operador com acesso controlado à base de dados e registada em auditoria.
