import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { fixtures, client, admin, totp, invitationLink, sql, api, anon } from './local-fixtures'

async function signIn(page:Page,user:{email:string;password:string}) {
  await page.goto('/')
  await page.getByLabel('Email address',{exact:true}).fill(user.email)
  await page.getByLabel('Password',{exact:true}).fill(user.password)
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
}
async function enroll(page:Page) {
  await page.getByRole('button',{name:'Set up authenticator',exact:true}).click()
  const secret=await page.getByLabel('Manual setup key').inputValue()
  await page.getByLabel('Six-digit authenticator code').fill(totp(secret))
  await page.getByRole('button',{name:'Verify code',exact:true}).click()
  return secret
}
async function browserClient(page:Page) {
  // Session is kept in memory for direct API assertions; never logged or persisted.
  const session=await page.evaluate(()=> {
    const key=Object.keys(sessionStorage).find(k=>k.endsWith('-auth-token'))
    return key?JSON.parse(sessionStorage.getItem(key)!):null
  })
  if(!session) throw new Error('No browser session')
  const c=client(); const {error}=await c.auth.setSession(session);if(error)throw new Error('Cannot use browser session for API check');return c
}
async function checkReflow(page:Page) {
  await page.setViewportSize({width:320,height:900})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.setViewportSize({width:1280,height:900})
  await page.evaluate(()=>{document.documentElement.style.zoom='2'})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.evaluate(()=>{document.documentElement.style.zoom='1'})
}

test('real local account flow, identity binding, MFA, isolation, revocation and recovery',async({browser})=>{
  test.setTimeout(240000)
  const f=await fixtures();const contexts=[]
  const open=async()=>{const context=await browser.newContext();contexts.push(context);return context.newPage()}
  try {
    const owner=await open(), renter=await open(), clerk=await open(), invited=await open()
    await signIn(owner,f.users.owner)
    await expect(owner.getByRole('heading',{name:'Staff security check'})).toBeVisible()
    await checkReflow(owner)
    const low=client(); await low.auth.signInWithPassword(f.users.owner)
    expect((await low.from('tenants').select('id')).data).toEqual([])
    const denied=await low.rpc('find_account_for_assignment',{p_property_id:f.property,p_email:f.users.alice.email})
    expect(denied.error?.code).toBe('42501')
    const ownerSecret=await enroll(owner)
    await expect(owner.getByRole('heading',{name:'Owner tenant directory'})).toBeVisible()
    await owner.getByLabel('Authorized property').selectOption(f.property)
    const ownerApi=await browserClient(owner)
    await owner.getByLabel('Location label').fill('Fictional section')
    await owner.getByRole('button',{name:'Create location',exact:true}).click()
    await expect(owner.getByText('Location saved without occupancy or billing rules.',{exact:true})).toBeVisible()
    await owner.getByLabel('Location type').selectOption('unit')
    await owner.getByLabel('Parent building or section').selectOption({label:'Fictional section'})
    await owner.getByLabel('Location label').fill('Fictional unit 1')
    await owner.getByRole('button',{name:'Create location',exact:true}).click()
    await expect(owner.getByText('Fictional unit 1',{exact:true})).toBeVisible()
    await checkReflow(owner)
    await owner.screenshot({path:'test-results/local-owner-directory.png',fullPage:true})

    await signIn(renter,f.users.alice)
    await expect(renter.getByText(`Fictional Renter A ${f.tag}`,{exact:true})).toBeVisible()
    await expect(renter.getByText(`Fictional Renter B ${f.tag}`,{exact:true})).toHaveCount(0)
    const renterApi=await browserClient(renter)
    expect((await renterApi.from('tenants').select('id').eq('id',f.tenantB)).data).toEqual([])
    await signIn(clerk,f.users.clerk);await enroll(clerk)
    await expect(clerk.getByRole('heading',{name:'Clerk tenant directory'})).toBeVisible()
    await expect(clerk.getByRole('heading',{name:'Owner: assign or disable access'})).toHaveCount(0)
    await expect(clerk.locator('#account-type option[value=staff]')).toHaveCount(0)
    await expect(clerk.getByRole('button',{name:'Create location',exact:true})).toHaveCount(0)
    const clerkApi=await browserClient(clerk)
    const assignment={p_property_id:f.property,p_user_id:f.users.unassigned.id,p_expected_email:f.users.unassigned.email,p_kind:'staff',p_tenant_id:null,p_role:'owner',p_enabled:true,p_reason:'Browser test'}
    expect((await clerkApi.rpc('assign_account_access',assignment)).error?.code).toBe('42501')
    expect((await clerkApi.functions.invoke('invite-account',{body:{propertyId:f.property,accountType:'staff',email:`denied-${f.tag}@example.invalid`}})).error).toBeTruthy()
    expect((await ownerApi.rpc('assign_account_access',{...assignment,p_expected_email:f.users.alice.email})).error?.code).toBe('22023')
    expect((await ownerApi.rpc('assign_account_access',{...assignment,p_role:'administrator'})).error?.code).toBe('22023')
    expect((await ownerApi.rpc('set_staff_access',{p_property_id:f.property,p_user_id:f.users.unassigned.id,p_role:'owner',p_reason:'Bypass attempt'})).error).toBeTruthy()

    const email=`invited-${f.tag}@example.invalid`;f.invitedEmails.push(email)
    await clerk.getByLabel('Invitation email').fill(email);await clerk.getByRole('button',{name:'Send invitation',exact:true}).click()
    await expect(clerk.getByRole('status')).toContainText('Invitation pending')
    await owner.getByLabel('Exact account email').fill(email);await owner.getByRole('button',{name:'Find account',exact:true}).click()
    await expect(owner.getByText('Invitation pending',{exact:true})).toBeVisible()
    let link:string|null=null
    await expect.poll(async()=>{link=await invitationLink(email);return !!link}).toBe(true)
    await invited.goto(link!)
    await expect(invited.getByRole('heading',{name:'Set your password'})).toBeVisible()
    const password=`${randomUUID()}zZ1!`
    await invited.getByLabel('New password (at least 12 characters)').fill(password)
    await invited.getByLabel('Confirm new password').fill(password)
    await invited.getByRole('button',{name:'Save password'}).click()
    await expect(invited.getByRole('heading',{name:'Invitation accepted but access not assigned'})).toBeVisible()
    const invitedApi=await browserClient(invited)
    expect((await invitedApi.from('tenants').select('id')).data).toEqual([])
    await owner.getByRole('button',{name:'Find account',exact:true}).click()
    await expect(owner.getByText('Invitation accepted but access not assigned',{exact:true})).toBeVisible()
    await owner.getByLabel('Tenant record',{exact:true}).selectOption(f.tenantB)
    await owner.getByLabel('Reason for this change').fill('Verified fictional contact')
    await owner.getByRole('button',{name:'Review assignment',exact:true}).click()
    await owner.getByLabel('Retype the matched account email').fill(email)
    await owner.getByLabel('Retype the matched account email').press('Tab')
    await expect(owner.getByRole('button',{name:'Edit assignment',exact:true})).toBeFocused()
    await checkReflow(owner)
    await owner.getByRole('button',{name:'Confirm access change',exact:true}).click()
    await expect(owner.getByRole('status').filter({hasText:'Access change saved'})).toBeVisible()
    await invited.getByRole('button',{name:'Refresh access'}).click()
    await expect(invited.getByText(`Fictional Renter B ${f.tag}`,{exact:true})).toBeVisible()
    await expect(invited.getByText(`Fictional Renter A ${f.tag}`,{exact:true})).toHaveCount(0)

    await owner.getByLabel('Action',{exact:true}).selectOption('disable')
    await owner.getByRole('button',{name:'Review assignment',exact:true}).click()
    await owner.getByLabel('Retype the matched account email').fill(email)
    await owner.getByRole('button',{name:'Confirm access change',exact:true}).click()
    await expect(owner.getByRole('status').filter({hasText:'Access change saved'})).toBeVisible()
    // Same previously issued JWT loses access immediately at the database boundary.
    expect((await invitedApi.from('tenants').select('id')).data).toEqual([])
    await invited.getByRole('button',{name:'Refresh access'}).click()
    await expect(invited.getByRole('heading',{name:'Access disabled'})).toBeVisible()
    await invited.getByRole('button',{name:'Sign out',exact:true}).click()
    await expect(invited.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible()
    await invited.goto(link!)
    await expect(invited.getByRole('alert')).toContainText('invalid, expired or already used')

    const expiredEmail=`expired-${f.tag}@example.invalid`;f.invitedEmails.push(expiredEmail)
    const expired=await admin.auth.admin.generateLink({type:'invite',email:expiredEmail,options:{redirectTo:'http://127.0.0.1:5173/auth/callback'}})
    if(expired.error)throw new Error('Expiry fixture creation failed')
    sql(`update auth.users set confirmation_sent_at=now()-interval '2 hours', invited_at=now()-interval '2 hours' where id='${expired.data.user.id}'`)
    await invited.goto(expired.data.properties.action_link)
    await expect(invited.getByRole('alert')).toContainText('invalid, expired or already used')

    // Owner explicitly grants staff access; the recipient must then enroll MFA.
    await owner.getByLabel('Access type').selectOption('staff')
    await owner.getByLabel('Staff role').selectOption('clerk')
    await owner.getByLabel('Action',{exact:true}).selectOption('enable')
    await owner.getByRole('button',{name:'Review assignment',exact:true}).click()
    await owner.getByLabel('Retype the matched account email').fill(email)
    await owner.getByRole('button',{name:'Confirm access change',exact:true}).click()
    await expect(owner.getByRole('status').filter({hasText:'Access change saved'})).toBeVisible()
    await invited.getByRole('button',{name:'Return to sign-in'}).click()
    await signIn(invited,{email,password})
    await expect(invited.getByRole('heading',{name:'Staff security check'})).toBeVisible()
    await enroll(invited)
    await expect(invited.getByRole('heading',{name:'Clerk tenant directory'})).toBeVisible()

    // A second enrolled factor is the supported self-service MFA recovery path.
    await owner.getByRole('button',{name:'Add backup authenticator',exact:true}).click()
    const backupSecret=await enroll(owner)
    await expect(owner.getByRole('heading',{name:'Add a backup authenticator'})).toHaveCount(0)
    await owner.getByRole('button',{name:'Sign out',exact:true}).click()
    await signIn(owner,f.users.owner)
    await expect(owner.getByRole('heading',{name:'Staff security check'})).toBeVisible()
    await owner.getByLabel('Authenticator',{exact:true}).selectOption({index:1})
    await owner.getByLabel('Six-digit authenticator code').fill(totp(backupSecret))
    await owner.getByRole('button',{name:'Verify code',exact:true}).click()
    await expect(owner.getByRole('heading',{name:'Owner tenant directory'})).toBeVisible()
    // Clerk cannot use Admin Auth to reset an owner's factors.
    const clerkSession=(await clerkApi.auth.getSession()).data.session!
    const factors=await admin.auth.admin.mfa.listFactors({userId:f.users.owner.id})
    const adminAttempt=await fetch(`${api}/auth/v1/admin/users/${f.users.owner.id}/factors/${factors.data!.factors[0].id}`,{method:'DELETE',headers:{apikey:anon,Authorization:`Bearer ${clerkSession.access_token}`}})
    expect([401,403]).toContain(adminAttempt.status)
    // Password recovery retains the MFA requirement.
    const recovery=await admin.auth.admin.generateLink({type:'recovery',email:f.users.owner.email,options:{redirectTo:'http://127.0.0.1:5173/auth/callback'}})
    if(recovery.error)throw new Error('Recovery test setup failed')
    const recoveryPage=await open();await recoveryPage.goto(recovery.data.properties.action_link)
    await expect(recoveryPage.getByRole('heading',{name:'Staff security check'})).toBeVisible()
    await recoveryPage.getByLabel('Six-digit authenticator code').fill(totp(ownerSecret))
    await recoveryPage.getByRole('button',{name:'Verify code',exact:true}).click()
    await expect(recoveryPage.getByRole('heading',{name:'Set your password'})).toBeVisible()
    const resetPassword=`${randomUUID()}rR2!`
    await recoveryPage.getByLabel('New password (at least 12 characters)').fill(resetPassword)
    await recoveryPage.getByLabel('Confirm new password').fill(resetPassword)
    await recoveryPage.getByRole('button',{name:'Save password'}).click()
    await expect(recoveryPage.getByRole('heading',{name:'Owner tenant directory'})).toBeVisible()
    expect((await low.rpc('find_account_for_assignment',{p_property_id:f.property,p_email:f.users.alice.email})).error?.code).toBe('42501')

    // Revoke clerk with an existing session, without touching any other property.
    const currentOwner=await browserClient(recoveryPage)
    expect((await currentOwner.rpc('assign_account_access',{...assignment,p_user_id:f.users.clerk.id,p_expected_email:f.users.clerk.email,p_role:null,p_enabled:false})).error).toBeNull()
    expect((await clerkApi.from('tenants').select('id')).data).toEqual([])
    await expect(clerk.getByRole('heading',{name:'Access disabled'})).toBeVisible()
    await renter.context().setOffline(true)
    await renter.getByRole('button',{name:'Refresh access'}).click()
    await expect(renter.getByRole('alert')).toContainText('Records are hidden')
    await expect(renter.getByText(`Fictional Renter A ${f.tag}`,{exact:true})).toHaveCount(0)
    await renter.context().setOffline(false)
  } finally { for(const context of contexts) await context.close();await f.cleanup() }
})

test('callback errors, keyboard focus, 200% text zoom and narrow reflow',async({page})=>{
  await page.goto('/auth/callback#error=access_denied&error_code=otp_expired')
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used')
  expect(new URL(page.url()).hash).toBe('')
  await page.getByRole('button',{name:'Return to sign-in'}).click()
  await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible()
  await page.goto('/auth/callback')
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used')
  await page.getByRole('button',{name:'Return to sign-in'}).click()
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible()
  await page.getByRole('link',{name:'Skip to content'}).focus()
  await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused()
  await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused()
  await page.getByLabel('Email address').focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Password',{exact:true})).toBeFocused()
  await page.getByLabel('Email address').fill('nobody@example.invalid');await page.getByLabel('Password',{exact:true}).fill('NotARealPassword12!')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page.getByRole('alert')).toBeFocused()
  await page.setViewportSize({width:320,height:900})
  await page.evaluate(()=>{document.documentElement.style.fontSize='225%'})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  const targets=await page.locator('button,input').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().height))
  expect(targets.every(h=>h>=44)).toBe(true)
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible()
})
