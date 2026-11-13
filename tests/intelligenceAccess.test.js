import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadIntelligenceRows} from "../src/modules/intelligence/intelligenceService.js";
import {fieldLabel} from "../src/modules/intelligence/fieldLabels.js";

test("Intelligence reads every protected server page and never falls back to raw tables", async () => {
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:Array.from({length:args.page_offset===0?500:1},(_,i)=>({id:args.page_offset+i})),error:null};}};
  const rows=await loadIntelligenceRows(client,"jobs");
  assert.equal(rows.length,501);assert.equal(calls[1].args.page_offset,500);
  assert.ok(calls.every(call=>call.name==="get_intelligence_page"));
});
test("a denied or revoked CFO identity stops reads without returning partial history", async()=>{
  let calls=0;
  const denied={message:"Exclusive CFO access required",code:"42501"};
  await assert.rejects(loadIntelligenceRows({rpc:async()=>++calls===1?{data:Array(500).fill({id:1}),error:null}:{data:null,error:denied}},"jobs"),error=>error===denied);
});
test("the dedicated CFO binding, protected datasets, and account mutations are server controlled",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261113000100_exclusive_intelligence_cfo.sql",import.meta.url),"utf8");
  assert.match(sql,/singleton boolean primary key default true check \(singleton\)/);
  assert.match(sql,/revoke all on public.intelligence_cfo_account from public, anon, authenticated/);
  assert.match(sql,/binding.auth_user_id = auth.uid\(\)/);
  assert.match(sql,/lower\(profile.role\) = 'cfo'/);
  assert.match(sql,/not profile.force_password_change/);
  assert.match(sql,/if not public.can_access_intelligence\(\) then/);
  assert.match(sql,/page_size > 500/);
  assert.ok(!sql.includes("execute format"));
  const admin=readFileSync(new URL("../supabase/functions/admin-users/index.ts",import.meta.url),"utf8");
  assert.ok(admin.indexOf("if (cfoBinding)")<admin.indexOf('body.action === "reset-password"'));
  assert.match(admin,/The exclusive CFO account cannot be changed, reset, synced or deleted/);
});
test("field labels are readable business terms",()=>{
  assert.equal(fieldLabel("tech_labor"),"Technician Labor");
  assert.equal(fieldLabel("invoice_number"),"Invoice Number");
  assert.equal(fieldLabel("customer_id"),"Customer ID");
});
