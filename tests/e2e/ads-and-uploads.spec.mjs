import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {account,context,cleanup,db,validPng} from './fixtures.mjs';
const ids=[];
test.afterAll(async()=>{if(ids.length)await db.query('DELETE FROM ad_campaigns WHERE id=ANY($1::uuid[])',[ids]);await cleanup();});
test('categorias por setas, upload validado e publicidade em três níveis',async({browser})=>{
 const admin=await account('Publicidade E2E','administrator'),outsider=await account('Visitante E2E'),a=await context(browser,admin),v=await context(browser,outsider);
 try{
  const invalid=await a.request.post('/api/v1/media',{data:Buffer.from([137,80,78,71,13,10,26,10,0,0,0]),headers:{'Content-Type':'image/png'}});expect(invalid.status()).toBe(400);
  const upload=await a.request.post('/api/v1/media',{data:validPng,headers:{'Content-Type':'image/png'}});expect(upload.status()).toBe(201);const asset=await upload.json();expect(asset.mimeType).toBe('image/webp');const stored=await a.request.get(asset.url);expect(stored.status()).toBe(200);expect(stored.headers()['content-type']).toContain('image/webp');expect((await stored.body()).toString('ascii',0,4)).toBe('RIFF');
  expect((await v.request.get('/api/v1/ads/manage')).status()).toBe(403);
  const name=`Campanha E2E ${randomUUID().slice(0,6)}`;
  for(const placement of ['premium','secondary','tertiary']){
   const created=await a.request.post('/api/v1/ads/manage',{data:{marketplaceSlug:'servicos',placement,advertiserName:'Empresa de teste',headline:`${name} ${placement}`,targetUrl:'https://example.org/servicos',imageAssetId:asset.id,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),priority:10}});expect(created.status()).toBe(201);const campaign=await created.json();ids.push(campaign.id);expect(campaign.status).toBe('draft');expect((await a.request.patch(`/api/v1/ads/manage/${campaign.id}`,{data:{status:'approved'}})).status()).toBe(200);
  }
  const items=(await (await v.request.get('/api/v1/ads/placements?marketplace=servicos')).json()).items;expect(items).toHaveLength(3);expect((await (await v.request.get('/api/v1/ads/placements?marketplace=produtos')).json()).items).toHaveLength(0);
  const page=await v.newPage();await page.setViewportSize({width:320,height:900});await page.goto('/servicos');await expect(page.getByText(`${name} premium`)).toBeVisible();await expect(page.getByText(`${name} secondary`)).toBeVisible();await expect(page.getByText(`${name} tertiary`)).toBeVisible();
  const rail=page.getByRole('navigation',{name:'Categorias de serviços'});const next=page.getByRole('button',{name:'Categorias seguintes'});await expect(next).toBeEnabled();await next.click();await expect.poll(()=>rail.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);await page.getByRole('button',{name:'Categorias anteriores'}).click();await expect.poll(()=>rail.evaluate(e=>e.scrollLeft)).toBe(0);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  for(const id of ids)expect((await a.request.patch(`/api/v1/ads/manage/${id}`,{data:{status:'paused'}})).status()).toBe(200);
  await page.reload();await expect(page.getByText(`${name} premium`)).toHaveCount(0);
 }finally{await a.close();await v.close();}
});

