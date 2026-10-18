import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel:'msedge', headless:true })
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}})
 const errors=[], external=[]
 page.on('pageerror', e=>errors.push(e.message))
 await page.route('**/*', route=>{ if(new URL(route.request().url()).origin !== 'http://127.0.0.1:5175'){external.push(route.request().url());return route.abort()}return route.continue() })
 await page.goto('http://127.0.0.1:5175')
 await page.locator('.workspace-sidebar').getByRole('link',{name:'Payments and balances'}).click()
 const balance=page.locator('.simple-balance strong')
 assert.match(await balance.innerText(),/7,000.00/)
 await page.getByRole('button',{name:'Record cash payment'}).click()
 await page.getByLabel('How much was received? (PHP)').fill('2500.25')
 await page.getByRole('button',{name:'Review payment',exact:true}).click()
 assert.match(await page.locator('.payment-review').innerText(),/September 2026/)
 assert.match(await page.locator('.payment-review').innerText(),/October 2026/)
 await page.getByRole('button',{name:'Save pending record'}).click()
 assert.match(await balance.innerText(),/7,000.00/)
 await page.getByRole('button',{name:'Review cash',exact:true}).last().click()
 await page.getByRole('button',{name:'Confirm as James (preview)'}).click()
 assert.match(await balance.innerText(),/4,499.75/)
 await page.getByRole('button',{name:'Review cash',exact:true}).click()
 assert.doesNotMatch(await page.locator('.payment-review').innerText(),/September 2026/)
 await page.getByRole('button',{name:'Confirm as James (preview)'}).click()
 assert.match(await balance.innerText(),/3,499.75/)
 await page.evaluate(()=>scrollTo(0,0))
 await page.screenshot({path:'docs/screenshots/payments-simple.png',fullPage:true})
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await page.setViewportSize({width:390,height:900})
 await page.screenshot({path:'docs/screenshots/payments-simple-mobile.png',fullPage:true})
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 console.log('PASS: pending does not settle; oldest-first split; confirmation reallocation; narrow reflow; no external requests/errors')
}finally{await browser.close()}
