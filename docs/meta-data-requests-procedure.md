# PUVO — procedimento para pedidos oficiais de dados Meta

**Estado:** proposta operacional de 28/10/2026. Requer aprovação e aplicação pelo responsável da Vitaleevo antes de ser declarada como controlo existente no App Review. Não substitui aconselhamento jurídico.

## Âmbito e responsabilidade

Aplica-se a pedidos de autoridades públicas relativos a dados obtidos pela PUVO da Meta, incluindo identificadores, mensagens, comentários, imagens, dados de Páginas e tokens. A Vitaleevo é a entidade indicada pelo titular como responsável pelos dados, sediada em Luanda, Angola. O responsável da Vitaleevo designa por escrito quem recebe pedidos e quem autoriza uma resposta. Ninguém da equipa de suporte responde diretamente sem essa autorização.

## Fluxo obrigatório

1. **Registar.** Guardar o pedido original, data de receção, autoridade, fundamento invocado, prazo, canal de contacto, dados solicitados, pessoa que o recebeu e identificador interno. Restringir acesso ao registo e não copiar dados de clientes para tickets abertos.
2. **Analisar a legalidade.** Verificar identidade e competência da autoridade, autenticidade do documento, jurisdição, base legal, finalidade, período, categoria de titulares, proporcionalidade, prazo e eventual obrigação de sigilo. Consultar advogado local quando a base ou o alcance não estiver claro. Pedir esclarecimentos antes de recolher dados.
3. **Contestar ou limitar.** Se o pedido for inválido, excessivo ou fora da jurisdição, não entregar dados até resolver a questão. Documentar a objeção, pedir correção ou delimitação e, quando necessário, contestar pelo meio legal disponível. Escalar pedidos urgentes ao responsável e ao advogado.
4. **Minimizar.** Se a entrega for legalmente exigida, identificar apenas os registos, campos e intervalo temporal estritamente abrangidos. Excluir tokens, segredos e dados de outras lojas ou pessoas que não estejam no pedido. Rever a extração por uma segunda pessoa antes de qualquer entrega.
5. **Autorizar e transmitir.** Obter aprovação escrita do responsável e, quando aplicável, parecer jurídico. Enviar por canal seguro à autoridade autenticada. Registar exatamente o que foi entregue, quando, por quem e a quem, sem guardar cópias desnecessárias.
6. **Notificar ou restringir.** Avaliar, com aconselhamento jurídico, se os titulares e a Meta devem ser notificados e se existe proibição legal de o fazer. Registar a decisão e a sua base.
7. **Encerrar e rever.** Guardar pedido, análise, objeções, aprovações, conjunto entregue, comprovativo de transmissão e decisão de notificação em repositório com acesso restrito. Definir prazo de conservação compatível com a lei e eliminar quando expirar. Rever o processo após cada caso.

## Registo mínimo por pedido

| Campo | Valor a preencher |
| --- | --- |
| ID interno e data de receção | |
| Autoridade, contacto verificado e documento original | |
| Base legal, jurisdição e prazo | |
| Lojas, titulares, categorias e período pedidos | |
| Análise de legalidade e responsável pela análise | |
| Objeção, esclarecimento ou contestação e resultado | |
| Critérios de minimização e revisão por segunda pessoa | |
| Aprovação escrita e parecer jurídico, se aplicável | |
| Dados entregues, canal seguro, destinatário e data | |
| Decisão de notificação e fundamento | |
| Data de encerramento, retenção e eliminação | |

## Prestadores e revisão

O titular confirmou Railway (API e base de dados) e Vercel (site) como prestadores da PUVO. Antes do App Review, o responsável deve confirmar quais deles efetivamente recebem dados Meta, as entidades jurídicas contratadas, a localização do tratamento e se serviços de IA, email, armazenamento ou observabilidade também recebem mensagens, comentários ou tokens. Manter a lista e as finalidades atualizadas na documentação de privacidade e nos contratos aplicáveis.

As fontes dos próprios prestadores ajudam a preencher as localizações, mas não substituem a configuração real da conta: [Railway DPA](https://railway.com/legal/dpa), [regiões Railway](https://docs.railway.com/deployments/regions) e [Vercel DPA](https://vercel.com/legal/dpa). A Railway indica operações principais nos EUA e permite deploy em Amsterdam; a Vercel indica operações principais nos EUA e possível processamento noutros países onde opera. O formulário Meta exige **todos** os países de processamento, incluindo acesso remoto; confirmar esta lista com os prestadores antes de guardar cada entrada.

## Ativação

O responsável deve aprovar este procedimento, designar titulares para receção e autorização, criar um repositório restrito para o registo e comunicar o fluxo à equipa. Só depois de os quatro passos (análise, contestação, minimização e documentação) estarem operacionais é correto assinalá-los como existentes no formulário Meta. Até lá, selecionar **None of the above**.
