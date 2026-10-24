# Operação das lojas

Atualização de 22/10/2026: convites com aceitação, contexto explícito de loja e revisão responsiva já foram implementados. A entrega atual e os testes E2E estão em [marketplaces-v2.md](marketplaces-v2.md). As avaliações técnicas no fim deste documento registam a fase anterior.

Implementação local de contactos públicos, condições comerciais e equipa. As novas colunas são aditivas, com valores vazios/privados por omissão. A migração `004_store_operations.sql` também repõe a associação do proprietário à equipa.

## Permissões

| Ação | Proprietário | Editor | Suporte |
| --- | --- | --- | --- |
| Dados comerciais, contactos, marca e recebimentos | Sim | Não | Não |
| Gerir equipa | Sim | Não | Não |
| Criar/editar/pausar anúncios | Sim | Sim | Não |
| Consultar encomendas e responder a conversas | Sim | Sim | Sim |
| Confirmar transferências, reembolsos e entrega | Sim | Sim | Não |

Somente o comprador elegível recebe o destino completo do método de pagamento escolhido na encomenda. O proprietário vê os dados da própria loja no painel e o identificador mascarado. A API não publica dados de recebimento no catálogo.

## Contratos

- `GET /api/v1/seller/profile`: perfil e papel da loja selecionada na sessão; sem seleção válida, prioriza loja própria e depois associação mais antiga. Seletor disponível em `/vendedor`, com GET `/seller/stores` e PUT `/seller/active-store`.
- `PUT /api/v1/seller/profile`: aceita `contactEmail`, `contactEmailPublic`, `contactPhone`, `contactPhonePublic`, `deliveryPolicy`, `returnsPolicy`, `termsPolicy` e as configurações manuais `mcxEnabled` / `clearPaymentDestination` e `bankTransferEnabled` / `clearBankTransfer`. Dados recebidos são cifrados; atualizações parciais preservam campos não alterados. A resposta inclui métodos ativados, nome de destinatário e identificador mascarado apenas para o proprietário.
- `POST /api/v1/orders/payment-options`: requer sessão, valida até 20 produtos publicados e o stock, e lista os métodos ativos por loja sem divulgar os dados de recebimento. `POST /api/v1/orders` valida novamente as opções e grava o destino escolhido cifrado na encomenda.
- `GET /api/v1/seller/team`: até 50 membros, disponível ao proprietário.
- `POST /api/v1/seller/team`: deixou de conceder acesso direto; responde 400 `INVITATION_REQUIRED`. Usar POST `/seller/invitations`, seguido de aceitação autenticada com o e-mail confirmado destinatário. Limite de 50 membros incluindo proprietário; token expira em sete dias e pode ser revogado.
- `PUT /api/v1/seller/team/:userId`: muda papel de um membro da loja do proprietário.
- `DELETE /api/v1/seller/team/:userId`: revoga acesso. O proprietário não pode ser removido ou despromovido por estas rotas.
- `GET /api/v1/catalog/stores/:slug`: contactos apenas com autorização ativa; condições comerciais e marca opcionais.
- `GET /api/v1/orders/:id`: inclui `canManage` para esconder ações indisponíveis ao suporte; a autorização continua na API.

Alterações de membros e respetivos eventos de auditoria usam a mesma transação. Anúncios editados continuam a passar por revisão; não é possível publicar diretamente um rascunho/rejeitado/em revisão pela rota de estado. Editor pode manter imagens já anexadas, mas não anexar um asset privado arbitrário de outra pessoa.

## Imagens e desenvolvimento

Logótipos, capas e pré-visualizações usam `next/image` com dimensões/sizes e formatos AVIF/WebP. O otimizador mantém originais quando a conversão não traz benefício. Upload conserva o limite de 5 MB; validação integral do descodificador e limite de pixels na entrada continuam pendentes.

Não foi necessário build de imagem Docker. A alteração em `next.config.ts` provocou o reinício automático do servidor Next; alterações de componentes continuam pelo Fast Refresh e a API pelo watcher Nest.

## Verificação

Typechecks Web/API e ESLint dos oito ficheiros Web afetados passaram. Script de integração, restrito a `NODE_ENV=development`:

```powershell
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml exec -T api node apps/api/scripts/check-store-operations.mjs
```

Resultado atual: 32 pedidos HTTP verificados, incluindo convite/aceitação, consentimento, privacidade MCX, proteção do proprietário, editor/suporte/terceiro, preservação de imagens, moderação, revogação, permissões de encomenda e conversão PNG→WebP pelo Next. Contas, sessões, loja, anúncio, encomenda e ficheiro temporários são eliminados em `finally`. O primeiro ensaio de otimização usou PNG de um pixel e conservou PNG; o ensaio final usa imagem de 512×256 para verificar conversão com benefício real.

GETs via entrada local: `/lojas`, loja com ordenação inválida normalizada, `/vendedor` e health da API devolveram 200. Não houve revisão visual em browser; Lighthouse e usabilidade estão por medir. O lint global anterior tinha erros em outros ficheiros; não foi declarado limpo.

## Avaliação técnica provisória

Estimativas por inspeção de código, sem certificação visual: UX 89, UI 88, acessibilidade 87, desempenho 85, consistência 90, conversão 88, escalabilidade 83 — precisa de refinamento. Correção mínima: revisão real em 320/768/1440 px com teclado, medir desempenho, reduzir a extensão do formulário por secções progressivas e oferecer contexto explícito para múltiplas lojas.

DATABASE CONTROL REPORT: schema `seller_profiles` e `store_memberships`; relações existentes com utilizadores/assets preservadas. Design 85, integridade 88, desempenho 84, segurança 85, escalabilidade 80, manutenção 84; DB Score 84,6. Índice por loja/papel e limites de tamanho aplicados. Risco: migração deve ser aplicada antes do código no próximo ambiente; recuperação aditiva deve preservar colunas/dados, revertendo apenas aplicação se necessário. Production Ready: NO — falta ensaio operacional de backup/restauro e implantação pública.

API: design 82, segurança 84, desempenho 82, consistência 87, observabilidade 68, versionamento 90; score 82,7. SQL parametrizado, sessão, propriedade e papéis verificados. Falta separar regras/dados dos controllers existentes, métricas de latência e política de abuso para procura de membros. Production Ready: NO.

## Próxima etapa

Convites, seleção e revisão responsiva concluídos nesta entrega. Próximas pendências de lojas: validação de dimensões de upload, horários comerciais, comentários/respostas de avaliações e sitemap completo. A operação pública ainda depende de domínio/TLS real, SMTP, backups e monitorização. Serviços tem percurso próprio e próximos passos descritos em `marketplaces-v2.md`.
