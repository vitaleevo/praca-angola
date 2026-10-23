import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:180000,
 expect:{timeout:30000},
 outputDir:'output/playwright/test-results',
 reporter:[['list'],['html',{outputFolder:'output/playwright/report',open:'never'}]],
 use:{baseURL:'http://localhost:3100',channel:process.env.CI?undefined:'chrome',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
});
