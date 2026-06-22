const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SR = process.env.SUPABASE_SERVICE_ROLE_KEY, SECRET = process.env.AGENT_ROUTE_SECRET;
const RID = "0de3c0de-0001-4a00-8a00-000000000001";
const ITEM = "0de3c0de-0003-4a00-8a00-000000000020"; // ساندويتش فراخ مشوية, 65
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();
const draft = (fulfillment) => ({ lines:[{itemId:ITEM,name:"ساندويتش فراخ مشوية",quantity:1,unitPrice:65,choices:[],modifiers:[],lineTotal:65}], fulfillment, deliveryZone:fulfillment==="delivery"?"مدينة نصر":null, deliveryFee:0, subtotal:65, tax:0, taxRate:0, total:65, currency:"ج.م", finalized:false });
const RECAP = "طلبك دلوقتي:\n- ١× ساندويتش فراخ مشوية — ٦٥ ج.م\n**الإجمالي: ٦٥ ج.م**\nتأكد الطلب؟";
async function seed(fulfillment){
  const phone=`2010${Math.floor(1e8+Math.random()*8e8)}`;
  const c=await fetch(`${SB}/rest/v1/customers`,{method:"POST",headers:REP,body:JSON.stringify({restaurant_id:RID,phone,name:"confirm test"})}).then(j);
  const conv=await fetch(`${SB}/rest/v1/conversations`,{method:"POST",headers:REP,body:JSON.stringify({restaurant_id:RID,customer_id:c[0].id,channel:"whatsapp"})}).then(j);
  await fetch(`${SB}/rest/v1/messages`,{method:"POST",headers:H,body:JSON.stringify({restaurant_id:RID,conversation_id:conv[0].id,direction:"outbound",sender:"ai",text:RECAP,status:"sent",meta:{draft:draft(fulfillment),model:"seed"}})});
  return {customerId:c[0].id, conversationId:conv[0].id};
}
async function clean(cid,custId){for(const t of["agent_runs","conversation_signals","messages"])await fetch(`${SB}/rest/v1/${t}?conversation_id=eq.${cid}`,{method:"DELETE",headers:H});await fetch(`${SB}/rest/v1/conversations?id=eq.${cid}`,{method:"DELETE",headers:H});await fetch(`${SB}/rest/v1/customers?id=eq.${custId}`,{method:"DELETE",headers:H});}
async function agent(cid,text){return fetch(`${BASE}/api/agent/respond`,{method:"POST",headers:{"Content-Type":"application/json","x-agent-secret":SECRET},body:JSON.stringify({restaurantId:RID,conversationId:cid,text})}).then(j);}
const LOOP_MARK="من السيستم"; // safeConfirmReply marker (the bug)
let pass=0,fail=0; const ok=(n,c,note)=>{if(c)pass++;else fail++;console.log(`  ${c?"✅":"❌"} ${n} — ${note}`);};

const A=await seed(null); // no fulfillment
let r=await agent(A.conversationId,"تأكيد الطلب");
ok("A: confirm w/o fulfillment → asks pickup/delivery, NOT the generic loop",
   !(r.reply||"").includes(LOOP_MARK) && /استلام|توصيل/.test(r.reply||""),
   `tools=[${(r.toolsUsed||[]).join(",")}] reply="${String(r.reply||"").slice(0,60)}"`);
// loop-breaker: re-confirm → still actionable, not the dead generic deferral
let r2=await agent(A.conversationId,"اكد");
ok("C: re-confirm spam → NOT the verbatim generic deferral", !(r2.reply||"").includes(LOOP_MARK), `reply="${String(r2.reply||"").slice(0,50)}"`);
await clean(A.conversationId,A.customerId);

const B=await seed("pickup"); // fulfillment set
let rb=await agent(B.conversationId,"تأكيد الطلب");
ok("B: confirm WITH fulfillment → finalizes (happy path completes)",
   (rb.reply||"").includes("تم تسجيل الطلب") && rb.draft?.finalized===true,
   `finalized=${rb.draft?.finalized} reply="${String(rb.reply||"").slice(0,55)}"`);
await clean(B.conversationId,B.customerId);

console.log(`\n──────── CONFIRM-FLOW PROOF: ${pass}/${pass+fail} ────────`);
process.exit(fail===0?0:1);
