import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/quote-ui',fullyParallel:false,workers:1,retries:0,timeout:45000,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:8788',browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
  {name:'desktop',use:{viewport:{width:1440,height:1000}}},
  {name:'mobile-390',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  {name:'mobile-360',use:{viewport:{width:360,height:800},isMobile:true,hasTouch:true}},
 ],
 webServer:{command:'node scripts/quote-ui-server.mjs',url:'http://127.0.0.1:8788/api/quote-reference',reuseExistingServer:false,timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:2000}},
});
