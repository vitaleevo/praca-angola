import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { account,context,db,emails,password,json,storeSettings,professionalSettings,listingSettings,validPng,cleanup } from './fixtures.mjs';

test.afterEach(async()=>{await cleanup();});

test('conta única: registo, confirmação de e-mail, entrada e saída',async({page,request})=>{
 const email=`e2e-${randomUUID()}@puvo.invalid`;emails.push(email);
 await page.goto('/registar');await page.getByLabel('Nome completo').fill('Pessoa E2E');await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill(password);await page.locator('#auth-password-confirm').fill(password);
 await page.getByRole('button',{name:'Criar conta',exact:true}).click();await expect(page).toHaveURL(/confirmar-email/);
 let messageId;
 await expect.poll(async()=>{const inbox=await (await request.get('http://localhost:8025/api/v1/messages')).json();messageId=inbox.messages.find(m=>m.To?.some(t=>t.Address===email))?.ID;return Boolean(messageId);},{timeout:20000}).toBeTruthy();
 const mail=await (await request.get(`http://localhost:8025/api/v1/message/${messageId}`)).json();
 const link=mail.Text.match(/http:\/\/localhost:3100\/verificar-email\?token=[A-Za-z0-9_-]+/)[0];
 await page.goto(link);await page.getByRole('button',{name:'Confirmar e-mail',exact:true}).click();await expect(page.getByRole('heading',{name:'E-mail confirmado'})).toBeVisible();
 await page.getByRole('link',{name:'Entrar na minha conta',exact:true}).click();await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill(password);await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();await expect(page).toHaveURL(/\/conta$/);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page).toHaveURL('/');await expect(page.getByRole('link',{name:'Entrar',exact:true}).first()).toBeVisible();
});

test('convite exige aceitação, é de uso único e seleção isola lojas',async({browser})=>{
 const owner=await account('Loja principal E2E'),staff=await account('Colaborador E2E'),wrong=await account('Outra conta E2E');
 const o=await context(browser,owner),s=await context(browser,staff),w=await context(browser,wrong);
 try{
  const shop=(await json(await o.request.put('/api/v1/seller/profile',{data:storeSettings('Loja convite E2E')}))).profile;
  const own=(await json(await s.request.put('/api/v1/seller/profile',{data:storeSettings('Loja própria E2E')}))).profile;
  const remoteItem=await json(await o.request.post('/api/v1/seller/listings',{data:listingSettings('Anúncio equipa E2E')}));
  const ownItem=await json(await s.request.post('/api/v1/seller/listings',{data:listingSettings('Anúncio próprio E2E')}));
  const ownerPage=await o.newPage();await ownerPage.goto('/vendedor');await ownerPage.getByLabel('E-mail da conta').fill(staff.email);await ownerPage.getByRole('button',{name:'Enviar convite',exact:true}).click();
  const input=ownerPage.getByLabel('Ligação do convite');await expect(input).toBeVisible();const invitation=await input.inputValue(),token=new URL(invitation).searchParams.get('token');
  expect((await db.query('SELECT 1 FROM store_memberships WHERE seller_profile_id=$1 AND user_id=$2',[shop.id,staff.id])).rowCount).toBe(0);
  expect((await w.request.post('/api/v1/team-invitations/accept',{data:{token}})).status()).toBe(403);
  const staffPage=await s.newPage();await staffPage.goto(invitation);await staffPage.getByRole('button',{name:'Aceitar convite'}).click();await expect(staffPage).toHaveURL(/\/vendedor$/);await expect(staffPage.getByLabel('Loja em gestão')).toHaveValue(shop.id);
  expect((await s.request.post('/api/v1/team-invitations/accept',{data:{token}})).status()).toBe(409);
  const activeItems=await json(await s.request.get('/api/v1/seller/listings'));expect(activeItems.items.map(i=>i.id)).toContain(remoteItem.id);expect(activeItems.items.map(i=>i.id)).not.toContain(ownItem.id);
  await staffPage.getByLabel('Loja em gestão').selectOption(own.id);await expect(staffPage.getByLabel('Nome público')).toHaveValue('Loja própria E2E');
  expect((await s.request.put(`/api/v1/seller/listings/${remoteItem.id}`,{data:listingSettings('Tentativa cruzada E2E')})).status()).toBe(400);
  expect((await w.request.put('/api/v1/seller/active-store',{data:{storeId:shop.id}})).status()).toBe(403);
  await staffPage.getByLabel('Loja em gestão').selectOption(shop.id);await expect(staffPage.getByText('Permissões da loja',{exact:true})).toBeVisible();
  expect((await o.request.delete(`/api/v1/seller/team/${owner.id}`)).status()).toBe(404);
  await json(await o.request.delete(`/api/v1/seller/team/${staff.id}`));expect((await s.request.post('/api/v1/seller/listings',{data:listingSettings('Sem acesso E2E')})).status()).toBe(403);
  const expired=await json(await o.request.post('/api/v1/seller/invitations',{data:{email:staff.email,role:'support'}}));await db.query("UPDATE store_invitations SET expires_at=now()-interval '1 minute' WHERE id=$1",[expired.id]);const expiredToken=new URL(expired.invitationUrl,'http://localhost:3100').searchParams.get('token');expect((await s.request.post('/api/v1/team-invitations/accept',{data:{token:expiredToken}})).status()).toBe(409);
  const revoked=await json(await o.request.post('/api/v1/seller/invitations',{data:{email:staff.email,role:'support'}}));await json(await o.request.delete(`/api/v1/seller/invitations/${revoked.id}`));const revokedToken=new URL(revoked.invitationUrl,'http://localhost:3100').searchParams.get('token');expect((await s.request.get(`/api/v1/team-invitations/${revokedToken}`)).status()).toBe(404);
 }finally{await o.close();await s.close();await w.close();}
});

test('serviços: perfil → revisão → pedido → proposta → conversa → conclusão → avaliação',async({browser})=>{
 const suffix=randomUUID().slice(0,6),pro=await account(`Profissional E2E ${suffix}`),buyer=await account('Cliente de serviços E2E'),admin=await account('Moderador E2E','moderator'),outsider=await account('Terceiro E2E');
 const p=await context(browser,pro),b=await context(browser,buyer),a=await context(browser,admin),x=await context(browser,outsider);
 try{
  const professionalPage=await p.newPage();await professionalPage.goto('/profissional');await expect(professionalPage.getByLabel('Nome público')).toBeVisible();
  await professionalPage.getByLabel('Nome público').fill(pro.name);await professionalPage.getByLabel('Especialidade principal').selectOption('design-grafico');await professionalPage.getByLabel('Título profissional').fill('Design de marcas e comunicação visual');await professionalPage.getByLabel('Apresentação',{exact:true}).fill('Crio identidades visuais completas para negócios. Perfil temporário de verificação E2E.');await professionalPage.getByLabel('Especialidades e competências').fill('Logótipos, identidade visual e comunicação');await professionalPage.getByLabel('Preço indicativo a partir de (Kz)').fill('80000');await professionalPage.getByLabel('Anos de experiência').fill('4');
  await professionalPage.getByLabel('Fotografia ou logótipo').setInputFiles({name:'e2e.png',mimeType:'image/png',buffer:validPng});
  await expect(professionalPage.getByRole('button',{name:'Guardar e enviar para revisão'})).toBeEnabled();
  await professionalPage.getByLabel('Trabalhos do portefólio (até 8)').setInputFiles({name:'portfolio-e2e.png',mimeType:'image/png',buffer:validPng});
  await expect(professionalPage.getByRole('button',{name:'Guardar e enviar para revisão'})).toBeEnabled();await professionalPage.getByRole('button',{name:'Guardar e enviar para revisão'}).click();await expect(professionalPage.getByRole('status').filter({hasText:'Perfil enviado para revisão'})).toBeVisible();
  const mine=(await json(await p.request.get('/api/v1/services/me'))).profile;expect((await x.request.get(`/api/v1/services/professionals/${mine.slug}`)).status()).toBe(404);
  const adminPage=await a.newPage();await adminPage.goto('/admin/profissionais');const card=adminPage.locator('article').filter({has:adminPage.getByRole('heading',{name:pro.name,exact:true})});await card.getByRole('button',{name:'Aprovar perfil'}).click();await expect(adminPage.getByRole('status').filter({hasText:'Decisão de moderação guardada'})).toBeVisible();
  const clientPage=await b.newPage();await clientPage.goto(`/servicos?q=${encodeURIComponent(pro.name)}`);await expect(clientPage.getByRole('link',{name:pro.name,exact:true})).toBeVisible();await clientPage.screenshot({path:'output/playwright/services-with-professional-desktop.png',fullPage:true});await clientPage.getByRole('link',{name:'Pedir orçamento',exact:true}).first().click();await clientPage.getByLabel('Título do pedido').fill(`Identidade visual E2E ${suffix}`);await clientPage.getByLabel('Descreve o serviço').fill('Preciso de um logótipo e manual de marca para uma loja em Luanda. O trabalho será acompanhado online.');await clientPage.getByLabel('Orçamento máximo (Kz, opcional)').fill('100000');await clientPage.getByRole('checkbox',{name:/Concordo em partilhar/}).check();await clientPage.getByRole('button',{name:'Publicar pedido de orçamento'}).click();await expect(clientPage).toHaveURL(/\/servicos\/pedidos\/[0-9a-f-]{36}$/);const requestId=clientPage.url().split('/').pop();
  expect((await x.request.get(`/api/v1/services/requests/${requestId}`)).status()).toBe(404);
  expect((await b.request.post(`/api/v1/services/requests/${requestId}/reviews`,{data:{rating:5,body:'Avaliação prematura inválida'}})).status()).toBe(403);
  await professionalPage.goto('/servicos/pedidos');await professionalPage.getByRole('link').filter({hasText:`Identidade visual E2E ${suffix}`}).click();await professionalPage.getByLabel('Valor da proposta (Kz)').fill('85000');await professionalPage.getByLabel('Prazo em dias').fill('7');await professionalPage.getByLabel('Âmbito e condições').fill('Inclui logótipo, três propostas iniciais e manual de marca. Entrega em sete dias após alinhamento.');await professionalPage.getByRole('button',{name:'Enviar proposta',exact:true}).click();await expect(professionalPage.getByText('Proposta enviada',{exact:true})).toBeVisible();
  await professionalPage.getByText('Conversa sobre esta proposta',{exact:true}).click();await professionalPage.getByLabel('Mensagem',{exact:true}).fill('Olá! Podemos alinhar as cores e o público da marca?');await professionalPage.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(professionalPage.getByText('Olá! Podemos alinhar as cores e o público da marca?',{exact:false})).toBeVisible();
  await clientPage.reload();await clientPage.getByText('Conversa sobre esta proposta',{exact:true}).click();await expect(clientPage.getByText('Olá! Podemos alinhar as cores e o público da marca?',{exact:false})).toBeVisible();await clientPage.getByLabel('Mensagem',{exact:true}).fill('Sim, vou partilhar o contexto e os objetivos por aqui.');await clientPage.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  const bid=(await json(await b.request.get(`/api/v1/services/requests/${requestId}`))).proposals[0];expect((await x.request.get(`/api/v1/services/proposals/${bid.id}/messages`)).status()).toBe(404);
  clientPage.once('dialog',d=>d.accept());await clientPage.getByRole('button',{name:'Aceitar proposta',exact:true}).click();await expect(clientPage.getByText('Em execução',{exact:true})).toBeVisible();
  clientPage.once('dialog',d=>d.accept());await clientPage.getByRole('button',{name:'Confirmar trabalho concluído'}).click();await expect(clientPage.getByText('Concluído',{exact:true})).toBeVisible();await clientPage.getByLabel('Como foi a experiência?').fill('Trabalho bem entregue e comunicação clara durante todo o projeto.');await clientPage.getByRole('button',{name:'Publicar avaliação'}).click();await expect(clientPage.getByText('Trabalho bem entregue e comunicação clara durante todo o projeto.')).toBeVisible();
  expect((await b.request.post(`/api/v1/services/requests/${requestId}/reviews`,{data:{rating:1,body:'Tentativa duplicada'}})).status()).toBe(409);expect((await p.request.post(`/api/v1/services/proposals/${bid.id}/messages`,{data:{body:'Mensagem depois do fecho'}})).status()).toBe(409);
  await clientPage.goto(`/servicos/profissionais/${mine.slug}`);await expect(clientPage.getByText('Trabalho bem entregue e comunicação clara durante todo o projeto.')).toBeVisible();await expect(clientPage.getByRole('img',{name:/Trabalho 1 de/})).toBeVisible();await clientPage.screenshot({path:'output/playwright/professional-profile-desktop.png',fullPage:true});
  const refused=await json(await b.request.post('/api/v1/services/requests',{data:{title:'Pedido para recusar E2E',description:'Pedido dirigido para validar recusa por indisponibilidade profissional.',categorySlug:'design-grafico',province:'Luanda',workMode:'online',targetProfileId:mine.id}}));
  expect((await x.request.post(`/api/v1/services/requests/${refused.id}/decline`,{data:{reason:'Não posso aceitar este pedido.'}})).status()).toBe(404);
  await professionalPage.goto(`/servicos/pedidos/${refused.id}`);await professionalPage.getByText('Não podes realizar este trabalho?',{exact:true}).click();await professionalPage.getByLabel('Motivo da recusa').fill('Não tenho disponibilidade para este prazo.');await professionalPage.getByRole('button',{name:'Recusar pedido',exact:true}).click();await expect(professionalPage.getByText('Recusado',{exact:true})).toBeVisible();
  expect((await json(await b.request.get(`/api/v1/services/requests/${refused.id}`))).request.provider_decline_reason).toBe('Não tenho disponibilidade para este prazo.');
  // An open request compares independent proposals, while each provider sees only their own.
  const otherProfile=await json(await x.request.put('/api/v1/services/me',{data:professionalSettings('Outro profissional E2E')}));await json(await a.request.patch(`/api/v1/services/moderation/${otherProfile.profile.id}`,{data:{status:'published'}}));
  const open=await json(await b.request.post('/api/v1/services/requests',{data:{title:'Comparar propostas E2E',description:'Pedido aberto para comparar propostas independentes de design gráfico.',categorySlug:'design-grafico',province:'Luanda',workMode:'online'}}));
  const bid1=await json(await p.request.post(`/api/v1/services/requests/${open.id}/proposals`,{data:{amount:10000,description:'Proposta A com um âmbito completo e prazo definido.',deliveryDays:2}}));const bid2=await json(await x.request.post(`/api/v1/services/requests/${open.id}/proposals`,{data:{amount:12000,description:'Proposta B com outro âmbito completo e prazo definido.',deliveryDays:3}}));
  expect((await json(await b.request.get(`/api/v1/services/requests/${open.id}`))).proposals).toHaveLength(2);expect((await json(await p.request.get(`/api/v1/services/requests/${open.id}`))).proposals).toHaveLength(1);
  const race=await Promise.all([b.request.post(`/api/v1/services/requests/${open.id}/accept`,{data:{proposalId:bid1.id}}),b.request.post(`/api/v1/services/requests/${open.id}/accept`,{data:{proposalId:bid2.id}})]);expect(race.map(r=>r.status()).sort()).toEqual([201,409]);
 }finally{await p.close();await b.close();await a.close();await x.close();}
});

test('produtos: catálogo → carrinho → transferência manual → entrega → conclusão',async({browser})=>{
 const owner=await account('Comerciante E2E'),buyer=await account('Comprador E2E'),admin=await account('Moderador produtos E2E','moderator');const o=await context(browser,owner),b=await context(browser,buyer),a=await context(browser,admin);
 try{
  await json(await o.request.put('/api/v1/seller/profile',{data:storeSettings('Loja produtos E2E')}));const product=await json(await o.request.post('/api/v1/seller/listings',{data:listingSettings('Sofá teste E2E '+randomUUID().slice(0,6))}));await json(await a.request.patch(`/api/v1/admin/listings/${product.id}`,{data:{action:'approved'}}));
  const page=await b.newPage();await page.goto(`/produtos/${product.slug}`);await page.getByRole('button',{name:'Adicionar ao carrinho'}).click();await page.goto('/carrinho');await page.getByRole('button',{name:'Continuar para pagamento'}).click();await expect(page).toHaveURL(/\/conta\/encomendas\/[0-9a-f-]{36}$/);const orderId=page.url().split('/').pop();await expect(page.getByText('Destinatário E2E',{exact:true})).toBeVisible();await page.getByLabel('Referência da transferência').fill('E2E-TRANSFERENCIA-FICTICIA');await page.getByRole('button',{name:'Já fiz a transferência'}).click();await expect(page.getByRole('heading',{name:'Transferência reportada',exact:true})).toBeVisible();
  const sellerPage=await o.newPage();await sellerPage.goto(`/conta/encomendas/${orderId}`);await sellerPage.getByRole('button',{name:'Confirmar receção',exact:true}).click();await expect(sellerPage.getByRole('heading',{name:'A preparar',exact:true})).toBeVisible();await sellerPage.getByRole('button',{name:'Pronto para levantamento'}).click();await page.reload();await page.getByRole('button',{name:'Confirmar receção',exact:true}).click();await expect(page.getByRole('heading',{name:'Concluída',exact:true})).toBeVisible();
  const response=await b.request.post('/api/v1/reviews',{data:{orderId,rating:5,body:'Avaliação E2E de encomenda concluída.'}});expect(response.status()).toBe(201);
 }finally{await o.close();await b.close();await a.close();}
});

test('novos visuais responsivos: 320, 768 e 1440 px, filtros e navegação',async({page})=>{
 for(const width of [320,768,1440])for(const path of ['/produtos','/servicos']){
  await page.setViewportSize({width,height:1000});await page.goto(path);await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  if(width===320){await page.getByRole('button',{name:/^Filtros [＋−]$/}).click();await expect(page.getByRole('button',{name:'Aplicar filtros'})).toBeVisible();await page.getByRole('button',{name:/^Filtros [＋−]$/}).click();await page.getByRole('button',{name:'Abrir menu'}).click();await expect(page.getByRole('navigation',{name:'Navegação móvel'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('navigation',{name:'Navegação móvel'})).not.toBeVisible();await expect(page.getByRole('button',{name:'Abrir menu'})).toBeFocused();}
  await page.screenshot({path:`output/playwright/${path.slice(1)}-${width}.png`,fullPage:true});
 }
});


