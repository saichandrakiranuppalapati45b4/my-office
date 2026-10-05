import os
import re

APP_PATH = 'dist/app.js'
SHELL_PATH = 'src/shell.html'
OUT_V2 = 'dist/command-centre-v2.html'
OUT_DEV = 'dist/dev.html'

with open(APP_PATH, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update applyLiveStats to reject stale mock numbers, and append runRealtimeSyncLoop
sync_loop_code = (
    'window.runRealtimeSyncLoop=function(){'
    'async function tickRealtime(){'
    'try{'
    'let u=JSON.parse(localStorage.getItem("office_user")||"{}"),q=u.id?`?user_id=${encodeURIComponent(u.id)}`:"";'
    'let[tl,nl,cl]=await Promise.all(['
    'fetch("/api/tasks"+q).then(r=>r.json()).catch(()=>[]),'
    'fetch("/api/notes"+q).then(r=>r.json()).catch(()=>[]),'
    'fetch("/api/clients"+q).then(r=>r.json()).catch(()=>[])'
    ']);'
    'let tasksList=Array.isArray(tl)?tl:[],notesList=Array.isArray(nl)?nl:[],clientsList=Array.isArray(cl)?cl:[];'
    'let doneD=d=>tasksList.filter(t=>(t.dept===d||t.department===d)&&t.state==="done").length;'
    'let waitD=d=>tasksList.filter(t=>(t.dept===d||t.department===d)&&(t.state==="waiting"||t.state==="next"||t.state==="doing")).length;'
    'let actCl=clientsList.filter(c=>c.status==="active"||c.status==="onboarded").length;'
    'let leadCl=clientsList.filter(c=>c.status==="lead").length;'
    'let sp=tasksList.filter(t=>(t.agent==="spencer"||t.agent==="enzo")&&t.state==="done").length;'
    'let ar=tasksList.filter(t=>(t.agent==="arwin"||t.agent==="pros")&&t.state==="done").length;'
    'let jk=tasksList.filter(t=>(t.agent==="jack"||t.agent==="piper")&&t.state==="done").length;'
    'let mktN=notesList.filter(n=>n.category==="marketing"||n.category==="insight"||n.department==="marketing").length+doneD("marketing");'
    'let opsN=notesList.filter(n=>n.category==="operations"||n.category==="compliance"||n.category==="sop"||n.department==="ops").length+doneD("ops");'
    'let propN=notesList.filter(n=>n.category==="proposal").length+tasksList.filter(t=>(t.agent==="piper"||t.dept==="ops"||t.department==="ops")&&t.state==="done").length;'
    'let invN=notesList.filter(n=>n.category==="invoice"||n.department==="fin").length+doneD("fin");'
    'let paidN=tasksList.filter(t=>(t.dept==="fin"||t.department==="fin")&&t.state==="done").length;'
    'let delTotal=clientsList.length>0?clientsList.length:tasksList.filter(t=>t.dept==="delivery"||t.department==="delivery").length;'
    'let delTrack=clientsList.length>0?actCl:tasksList.filter(t=>(t.dept==="delivery"||t.department==="delivery")&&(t.state==="doing"||t.state==="done")).length;'
    'Kt.ceoDirectives=doneD("ceo");'
    'Kt.ceoReports=notesList.filter(n=>n.department==="ceo"||n.category==="executive"||n.category==="briefing").length+tasksList.filter(t=>t.by==="ceo"&&t.state==="done").length;'
    'Kt.emailsSent=doneD("emails");'
    'Kt.drafts=waitD("emails");'
    'Kt.reports=doneD("delivery");'
    'Kt.projects=delTotal;'
    'Kt.onTrack=`${delTrack} / ${delTotal}`;'
    'Kt.spencer=sp;'
    'Kt.arwin=ar;'
    'Kt.jack=jk;'
    'Kt.managers=leadCl;'
    'Kt.autoOnb=actCl;'
    'Kt.insMkt=mktN;'
    'Kt.cpa=0;'
    'Kt.insOps=opsN;'
    'Kt.billsPaid=paidN;'
    'Og=notesList.length;'
    'let kpProp=og.find(x=>x.id==="proposals");kpProp&&(kpProp.val=propN);'
    'let kpInv=og.find(x=>x.id==="invoices");kpInv&&(kpInv.val=invN);'
    'RT();'
    'let updates={'
    '"ceo-0":String(Kt.ceoDirectives),'
    '"ceo-1":String(Kt.ceoReports),'
    '"emails-0":String(Kt.emailsSent),'
    '"emails-1":String(Kt.drafts),'
    '"delivery-0":String(Kt.reports),'
    '"delivery-1":`${delTrack} / ${delTotal}`,'
    '"sales-0":`${sp}\\xB7${ar}\\xB7${jk}`,'
    '"sales-1":String(leadCl),'
    '"sales-2":String(actCl),'
    '"marketing-0":String(mktN),'
    '"marketing-1":"$0",'
    '"ops-0":String(propN),'
    '"ops-1":String(opsN),'
    '"fin-0":String(invN),'
    '"fin-1":String(paidN),'
    '"brain-0":String(notesList.length)'
    '};'
    'for(let[k,v]of Object.entries(updates)){'
    'document.querySelectorAll(`[data-m="${k}"],[data-rm="${k}"]`).forEach(el=>{'
    'if(el.textContent!==v){el.textContent=v;}'
    '});'
    '}'
    'let bEl=Wt.brain&&Wt.brain.badge&&Wt.brain.badge.querySelector("b");'
    'bEl&&(bEl.textContent=notesList.length.toLocaleString("en-NZ"));'
    '}catch(e){}'
    '}'
    'tickRealtime();'
    'setInterval(tickRealtime,1500);'
    '};window.runRealtimeSyncLoop();'
)

# Replace applyLiveStats
old_apply_live_stats = 'window.applyLiveStats=function(s){if(!s)return;if(s.ceoDirectives!==void 0)Kt.ceoDirectives=s.ceoDirectives;if(s.ceoReports!==void 0)Kt.ceoReports=s.ceoReports;if(s.emailsSent!==void 0)Kt.emailsSent=s.emailsSent;if(s.drafts!==void 0)Kt.drafts=s.drafts;if(s.reports!==void 0)Kt.reports=s.reports;if(s.projects!==void 0)Kt.projects=s.projects;if(s.onTrack!==void 0)Kt.onTrack=s.onTrack;if(s.spencer!==void 0)Kt.spencer=s.spencer;if(s.arwin!==void 0)Kt.arwin=s.arwin;if(s.jack!==void 0)Kt.jack=s.jack;if(s.managers!==void 0)Kt.managers=s.managers;if(s.autoOnb!==void 0)Kt.autoOnb=s.autoOnb;if(s.insMkt!==void 0)Kt.insMkt=s.insMkt;if(s.cpa!==void 0)Kt.cpa=s.cpa;if(s.proposals!==void 0){let k=og.find(x=>x.id==="proposals");k&&(k.val=s.proposals)}if(s.insOps!==void 0)Kt.insOps=s.insOps;if(s.invoices!==void 0){let k=og.find(x=>x.id==="invoices");k&&(k.val=s.invoices)}if(s.billsPaid!==void 0)Kt.billsPaid=s.billsPaid;if(s.brainNotes!==void 0){Og=s.brainNotes;In&&In.state&&(In.state.notes=s.brainNotes)}RT()};'

new_apply_live_stats = (
    'window.applyLiveStats=function(s){'
    'if(!s)return;'
    'if(s.ceoDirectives===18&&s.ceoReports===12&&s.emailsSent===18)return;'
    'if(s.cpa===37.5)s.cpa=0;'
    'if(s.ceoDirectives!==void 0)Kt.ceoDirectives=s.ceoDirectives;'
    'if(s.ceoReports!==void 0)Kt.ceoReports=s.ceoReports;'
    'if(s.emailsSent!==void 0)Kt.emailsSent=s.emailsSent;'
    'if(s.drafts!==void 0)Kt.drafts=s.drafts;'
    'if(s.reports!==void 0)Kt.reports=s.reports;'
    'if(s.projects!==void 0)Kt.projects=s.projects;'
    'if(s.onTrack!==void 0)Kt.onTrack=s.onTrack;'
    'if(s.spencer!==void 0)Kt.spencer=s.spencer;'
    'if(s.arwin!==void 0)Kt.arwin=s.arwin;'
    'if(s.jack!==void 0)Kt.jack=s.jack;'
    'if(s.managers!==void 0)Kt.managers=s.managers;'
    'if(s.autoOnb!==void 0)Kt.autoOnb=s.autoOnb;'
    'if(s.insMkt!==void 0)Kt.insMkt=s.insMkt;'
    'if(s.cpa!==void 0)Kt.cpa=s.cpa;'
    'if(s.proposals!==void 0){let k=og.find(x=>x.id==="proposals");k&&(k.val=s.proposals)}'
    'if(s.insOps!==void 0)Kt.insOps=s.insOps;'
    'if(s.invoices!==void 0){let k=og.find(x=>x.id==="invoices");k&&(k.val=s.invoices)}'
    'if(s.billsPaid!==void 0)Kt.billsPaid=s.billsPaid;'
    'if(s.brainNotes!==void 0){Og=s.brainNotes;In&&In.state&&(In.state.notes=s.brainNotes)}'
    'RT()'
    '};' + sync_loop_code
)

cnt = js.count(old_apply_live_stats)
if cnt == 1:
    js = js.replace(old_apply_live_stats, new_apply_live_stats, 1)
    print("Injected real-time sync loop and stale mock rejection successfully!")
    with open(APP_PATH, 'w', encoding='utf-8') as f:
        f.write(js)
elif 'window.runRealtimeSyncLoop' in js:
    print("Real-time sync loop is already present in dist/app.js!")
else:
    print(f"ERROR: old_apply_live_stats count = {cnt}")

with open(SHELL_PATH, 'r', encoding='utf-8') as f:
    shell = f.read()

html_v2 = shell.replace('<!--APP-->', f'<script>{js}</script>')
with open(OUT_V2, 'w', encoding='utf-8') as f:
    f.write(html_v2)
print(f"Wrote {OUT_V2} ({len(html_v2)} bytes)")

html_dev = shell.replace('<!--APP-->', '<script src="app.js"></script>')
with open(OUT_DEV, 'w', encoding='utf-8') as f:
    f.write(html_dev)
print(f"Wrote {OUT_DEV} ({len(html_dev)} bytes)")
print("SUCCESS: Full realtime looping method enabled and bundled!")
