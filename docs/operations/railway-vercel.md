# Operação do deployment público — Vercel e Railway

Esta é a topologia pública atualmente usada. Os runbooks de Compose neste diretório descrevem uma instalação alternativa e não configuram automaticamente os serviços geridos.

| Componente | Endereço ou serviço |
| --- | --- |
| Web | `https://praca.vitaleevo.ao` na Vercel |
| API | `https://pracaapi-production.up.railway.app` na Railway |
| Dados | PostgreSQL e Redis privados no projeto Railway |
| Imagens carregadas | Volume persistente da API em `/app/apps/api/uploads` |
| Email | SMTP Resend configurado na API; entrega real exige ensaio de registo e recuperação |

## Publicação

1. Confirmar CI verde para o commit exato a publicar, incluindo migrations e E2E.
2. Confirmar cópia recuperável de PostgreSQL e media antes de aplicar migrations.
3. Publicar o mesmo commit na Vercel e Railway. A API executa `node apps/api/scripts/migrate.mjs && node dist/main.js` no arranque.
4. Confirmar `GET https://praca.vitaleevo.ao/api/v1/health/ready` e `GET https://pracaapi-production.up.railway.app/api/v1/health/ready` com `status: ok`.
5. Confirmar catálogo, serviços, login, registo, confirmação de email, recuperação de conta e upload controlado. Não usar uma conta real de cliente para o ensaio.
6. Registar IDs dos deployments, commit, hora, resultados e responsável. Se a API falhar, reverter o deployment da Railway para o commit anterior e confirmar readiness antes de reabrir tráfego.

O ambiente local usa Compose com watchers e hot reload. O build das imagens é necessário apenas para publicar uma nova versão de produção ou alterar dependências/imagens locais.

## Backups

- Ativar backups diários e semanais nos volumes PostgreSQL e API em **Backups** de cada serviço Railway. Registar o primeiro snapshot criado e a retenção apresentada no painel.
- Ativar PITR do PostgreSQL quando disponível no plano/projeto. Confirmar que o primeiro backup base terminou e que a janela de restauro é apresentada.
- Guardar também dumps lógicos cifrados e uma cópia dos media fora do projeto Railway; snapshots de volume não sobrevivem à eliminação do volume/projeto.
- Restaurar um dump numa base isolada e extrair uma cópia de media para um diretório isolado. Comparar contagens e pelo menos uma imagem, sem substituir dados de produção durante o ensaio.
- Registar hora do último backup, checksum, destino fora do projeto, duração do restauro e resultado. Não declarar o RPO/RTO atingido sem estas evidências.

## Alertas

- Monitor externo: consultar `health/ready` por HTTPS a cada minuto; alertar após 2 falhas consecutivas e confirmar recuperação.
- API Railway: acompanhar 5xx, latência, CPU, memória e utilização do volume. Alertar também para `rate limit unavailable`, SMTP recusado e outbox atrasado.
- PostgreSQL/media: alertar quando o snapshot esperado não aparecer ou quando um restauro de ensaio falhar.
- Configurar destinatário e escalonamento de incidentes e disparar um alerta de teste. Uma regra sem destinatário testado não conta como ativa.

## Estado de verificação

Este ficheiro define o procedimento. A ativação de snapshots, PITR, alertas e o ensaio de entrega SMTP devem ser registados com evidência do ambiente Railway; não são inferidos a partir do código ou de uma resposta 200 no healthcheck.
