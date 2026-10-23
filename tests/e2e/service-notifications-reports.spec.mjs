import {test,expect} from '@playwright/test';
import {account,context,cleanup,db,json,professionalSettings} from './fixtures.mjs';

test.afterEach(async()=>{await cleanup();});

test('serviços: notificações privadas, preferência de email, outbox e denúncias moderadas',async({browser})=>{
 const pro=await account('Profissional avisos E2E'),buyer=await account('Cliente avisos E2E'),outsider=await account('Terceiro avisos E2E'),mod=await account('Moderador avisos E2E','moderator');
 const p=await context(browser,pro),b=await context(browser,buyer),x=await context(browser,outsider),m=await context(browser,mod);
 try{
  const profile=(await json(await p.request.put('/api/v1/services/me',{data:professionalSettings(pro.name)}))).profile;
  await json(await m.request.patch(`/api/v1/services/moderation/${profile.id}`,{data:{status:'published'}}));
  expect((await json(await p.request.get('/api/v1/services/notification-preferences'))).emailEnabled).toBe(false);
  await json(await p.request.put('/api/v1/services/notification-preferences',{data:{emailEnabled:true}}));
  const job=await json(await b.request.post('/api/v1/services/requests',{data:{title:'Identidade visual avisos E2E',description:'Pedido de identidade visual para verificar notificações, denúncias e privacidade.',categorySlug:'design-grafico',province:'Luanda',workMode:'online',targetProfileId:profile.id}}));
  const proNotices=await json(await p.request.get('/api/v1/services/notifications'));
  expect(proNotices.items.map(n=>n.kind)).toContain('request');expect(proNotices.unread).toBe(1);
  expect((await json(await b.request.get('/api/v1/services/notifications'))).items).toHaveLength(0);
  expect((await json(await x.request.get('/api/v1/services/notifications'))).items).toHaveLength(0);
  expect((await json(await x.request.patch(`/api/v1/services/notifications/${proNotices.items[0].id}/read`))).updated).toBe(false);
  expect((await json(await p.request.patch(`/api/v1/services/notifications/${proNotices.items[0].id}/read`))).updated).toBe(true);
  expect((await json(await p.request.get('/api/v1/services/notifications'))).unread).toBe(0);
  expect((await db.query('SELECT count(*)::int AS n FROM service_notification_outbox o JOIN service_notifications n ON n.id=o.notification_id WHERE n.user_id=$1',[pro.id])).rows[0].n).toBe(1);
  await json(await p.request.put('/api/v1/services/notification-preferences',{data:{emailEnabled:false}}));
  expect((await json(await p.request.get('/api/v1/services/notification-preferences'))).emailEnabled).toBe(false);
  expect((await db.query("SELECT count(*)::int AS n FROM service_notification_outbox o JOIN service_notifications n ON n.id=o.notification_id WHERE n.user_id=$1 AND o.status IN ('pending','failed')",[pro.id])).rows[0].n).toBe(0);
  const bid=await json(await p.request.post(`/api/v1/services/requests/${job.id}/proposals`,{data:{amount:85000,description:'Criação de identidade visual e entrega de manual de marca completo.',deliveryDays:7}}));
  expect((await json(await b.request.get('/api/v1/services/notifications'))).items.map(n=>n.kind)).toContain('proposal');
  const message=await json(await p.request.post(`/api/v1/services/proposals/${bid.id}/messages`,{data:{body:'Podemos alinhar as cores da marca?'}}));
  expect((await json(await b.request.get('/api/v1/services/notifications'))).items.map(n=>n.kind)).toContain('message');
  await json(await b.request.post(`/api/v1/services/proposals/${bid.id}/messages`,{data:{body:'Sim, vamos definir os detalhes antes de começar.'}}));
  expect((await json(await p.request.get('/api/v1/services/notifications'))).items.map(n=>n.kind)).toContain('message');
  await json(await b.request.post(`/api/v1/services/requests/${job.id}/accept`,{data:{proposalId:bid.id}}));
  expect((await b.request.post(`/api/v1/services/requests/${job.id}/accept`,{data:{proposalId:bid.id}})).status()).toBe(409);
  await json(await b.request.post(`/api/v1/services/requests/${job.id}/complete`));
  const afterComplete=await json(await p.request.get('/api/v1/services/notifications'));
  expect(afterComplete.items.map(n=>n.kind)).toEqual(expect.arrayContaining(['request','message','accepted','completed']));
  expect(afterComplete.items.filter(n=>n.kind==='accepted')).toHaveLength(1);
  expect((await db.query('SELECT count(*)::int AS n FROM service_notification_outbox o JOIN service_notifications n ON n.id=o.notification_id WHERE n.user_id=$1',[pro.id])).rows[0].n).toBeLessThanOrEqual(1);
  const reportBody={reason:'abuse',details:'O conteúdo deve ser revisto pela equipa de moderação deste marketplace.'};
  expect((await x.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'message',targetId:message.id}})).status()).toBe(404);
  expect((await p.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'message',targetId:message.id}})).status()).toBe(404);
  expect((await b.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'request',targetId:job.id}})).status()).toBe(403);
  expect((await p.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'profile',targetId:profile.id}})).status()).toBe(403);
  expect((await x.request.get('/api/v1/services/reports/moderation')).status()).toBe(403);
  const report=await json(await b.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'message',targetId:message.id}}));
  expect((await b.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'message',targetId:message.id}})).status()).toBe(409);
  await json(await b.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'profile',targetId:profile.id}}));
  await json(await p.request.post('/api/v1/services/reports',{data:{...reportBody,targetType:'request',targetId:job.id}}));
  expect((await json(await x.request.get('/api/v1/services/reports/mine'))).items).toHaveLength(0);
  expect((await json(await m.request.get('/api/v1/services/reports/moderation'))).items).toHaveLength(3);
  const notificationsPage=await p.newPage();await notificationsPage.goto('/servicos/notificacoes');await expect(notificationsPage.getByRole('heading',{name:'Notificações de serviços'})).toBeVisible();await expect(notificationsPage.getByText('Recebeste um pedido de serviço')).toBeVisible();await notificationsPage.screenshot({path:'output/playwright/service-notifications-desktop.png',fullPage:true});
  const moderationPage=await m.newPage();await moderationPage.goto('/admin/denuncias-servicos');await expect(moderationPage.getByRole('heading',{name:'Denúncias de serviços'})).toBeVisible();await expect(moderationPage.getByText('Podemos alinhar as cores da marca?')).toBeVisible();await moderationPage.screenshot({path:'output/playwright/service-reports-moderation-desktop.png',fullPage:true});
  await json(await m.request.patch(`/api/v1/services/reports/moderation/${report.id}`,{data:{status:'resolved',note:'Mensagem revista pela equipa de moderação.'}}));
  expect((await json(await b.request.get('/api/v1/services/reports/mine'))).items.find(r=>r.id===report.id).status).toBe('resolved');
  expect((await json(await m.request.get('/api/v1/services/reports/moderation'))).items).toHaveLength(2);
  await notificationsPage.setViewportSize({width:320,height:900});await notificationsPage.reload();await expect.poll(()=>notificationsPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await notificationsPage.screenshot({path:'output/playwright/service-notifications-mobile.png',fullPage:true});
 }finally{await p.close();await b.close();await x.close();await m.close();}
});

test('serviços: outbox entrega aviso genérico por email e respeita opt-out',async({browser,request})=>{
 const pro=await account('Profissional email E2E'),buyer=await account('Cliente email E2E'),mod=await account('Moderador email E2E','moderator');
 const p=await context(browser,pro),b=await context(browser,buyer),m=await context(browser,mod);
 try{
  const profile=(await json(await p.request.put('/api/v1/services/me',{data:professionalSettings(pro.name)}))).profile;
  await json(await m.request.patch(`/api/v1/services/moderation/${profile.id}`,{data:{status:'published'}}));
  await json(await p.request.put('/api/v1/services/notification-preferences',{data:{emailEnabled:true}}));
  const privateDescription='Detalhes privados do pedido que não devem aparecer no aviso por email.';
  const first=await json(await b.request.post('/api/v1/services/requests',{data:{title:'Pedido de aviso E2E',description:privateDescription,categorySlug:'design-grafico',province:'Luanda',workMode:'online',targetProfileId:profile.id}}));
  await expect.poll(async()=>(await db.query('SELECT status FROM service_notification_outbox o JOIN service_notifications n ON n.id=o.notification_id WHERE n.user_id=$1 AND n.event_key=$2',[pro.id,`request:${first.id}`])).rows[0]?.status,{timeout:45000,interval:1000}).toBe('sent');
  const inbox=await (await request.get('http://localhost:8025/api/v1/messages')).json();
  const email=inbox.messages.find(item=>item.To?.some(to=>to.Address===pro.email));expect(email).toBeTruthy();
  const full=await (await request.get(`http://localhost:8025/api/v1/message/${email.ID}`)).json();
  expect(full.Text).toContain(`/servicos/pedidos/${first.id}`);expect(full.Text).not.toContain(privateDescription);
  await json(await p.request.put('/api/v1/services/notification-preferences',{data:{emailEnabled:false}}));
  const second=await json(await b.request.post('/api/v1/services/requests',{data:{title:'Outro pedido de aviso E2E',description:'Segundo pedido dirigido para confirmar que a preferência de email é respeitada.',categorySlug:'design-grafico',province:'Luanda',workMode:'online',targetProfileId:profile.id}}));
  expect((await db.query('SELECT count(*)::int AS n FROM service_notification_outbox o JOIN service_notifications n ON n.id=o.notification_id WHERE n.user_id=$1 AND n.event_key=$2',[pro.id,`request:${second.id}`])).rows[0].n).toBe(0);
 }finally{await p.close();await b.close();await m.close();}
});
