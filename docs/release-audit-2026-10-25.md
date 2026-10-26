# Publicação PUVO — 25/10/2026

## Integração Meta posterior

A app Meta própria PUVO (`2161321067754105`) foi criada no negócio Agência Holyweb e está em modo Live. A revisão `6538580` adiciona OAuth para ligar Páginas Facebook/Instagram profissionais por loja, armazenamento cifrado de tokens, receção idempotente de Messenger/Instagram/WhatsApp e envio de respostas de texto pelo inbox. O deployment Railway `e053900e-2ed6-4b20-b480-7ada40112f66` aplicou a migração 023; verificação Meta e assinatura HMAC continuam a passar. Consultar `docs/meta-webhook-puvo.md`; a app “Agentes” existente não foi modificada.

## Estado

**Publicado em produção** a partir da revisão `ddb1d84` (`codex/account-sidebars`). A API e o worker de IA estão no Railway; o site e a gestão estão no Vercel.

| Componente | Destino | Deploy | Verificação |
| --- | --- | --- | --- |
| Site | https://puvo.vitaleevo.ao | `dpl_2ZvqsanKMiCzdfdmAXNtH9N74sBR` | `/` e `/produtos` HTTP 200 |
| Gestão | https://gestao.puvo.vitaleevo.ao | `dpl_2nif6CcaiESGGH6AKGPafoN2RPUk` | `/` e `/entrar` HTTP 200 |
| API | Railway `@praca/api` | `ca92741f-8640-486d-baf0-befe2c1ca86d` | `/api/v1/health/ready` HTTP 200 no domínio da API e pelo site |
| Worker de IA | Railway `ai-worker` | `7faec658-1921-448a-b9f2-3c4f85c6c348` | `/api/v1/ai/status` HTTP 200 via site e gestão, resposta `status: ok` |

Os registos DNS `puvo` e `gestao.puvo` foram criados na zona Vercel de `vitaleevo.ao`. As migrações `020_courier_approval.sql` e `021_order_delivery_pricing.sql` foram aplicadas pela API no arranque. Antes disso, foi criado o backup PostgreSQL não expirável `pre-release-51b3562` (`ba337715-0f37-4bed-8afa-5d07b384ece6`).

## Correções e validação

- Checkout com estafeta usa cotação de frete no servidor por loja, persiste valor e destino cifrado e rejeita divergência de total. Despacho só utiliza o modo de entrega contratado.
- API: 55/55 testes. Worker: 7/7 testes. TypeScript, lint e builds de API, site e gestão passaram localmente.
- E2E local: 21/22 passaram numa execução integral; o cenário restante passou isoladamente. A suite em Next dev mostrou intermitência de espera/reload. Não existe uma execução única de 22/22 nesta revisão.
- Em produção, site, gestão, proxy da API, readiness e ligação API → worker responderam corretamente sem criar encomendas ou alterar dados reais.
- O painel de gestão restringe o host de produção; a URL temporária do Vercel devolve 404 por desenho.

## Limites operacionais

- A API de gestão omnichannel está publicada; para concluir a operação, falta adicionar o URL de retorno OAuth nas definições Meta, subscrever Page/Instagram e autorizar as contas reais através do CRM. O WhatsApp pede o `phone_number_id` e token de System User no formulário seguro do CRM. A integração personalizada de IA também requer configuração de hosts permitidos. Estas credenciais não foram inventadas.
- Não foi executado um fluxo autenticado de pagamento/entrega em produção para evitar transações reais sem contas de ensaio. O fluxo foi coberto pelos testes locais.
- A CLI Railway não conseguiu abrir SSH (`ssh.railway.com` sem resolução DNS local); a ligação ao worker foi verificada pelo endpoint da própria API.
- O serviço Railway Web antigo permanece sem uso como origem do domínio público. Não foi removido nesta publicação.
- TypeSafe Jev devolveu HTTP 401 e não foi repetido; a chave precisa de substituição.

## Recuperação

Os deploys anteriores continuam no histórico do Vercel e Railway. Em caso de falha, promover a versão anterior do Vercel e fazer rollback da API/worker no Railway; para dados, usar o backup identificado acima ou PITR conforme a janela pretendida. A migração 021 acrescenta colunas e não remove dados antigos.
