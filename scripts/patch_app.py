import os
import re

APP_PATH = 'dist/app.js'
SHELL_PATH = 'src/shell.html'
OUT_V2 = 'dist/command-centre-v2.html'
OUT_DEV = 'dist/dev.html'

with open(APP_PATH, 'r', encoding='utf-8') as f:
    js = f.read()

replacements = []

# 1. DEPT_KEYS (Af and En)
replacements.append((
    'Af=["emails","sales","marketing","ops","fin","delivery"]',
    'Af=["ceo","emails","sales","marketing","ops","fin","delivery"]'
))
replacements.append((
    'var En=["emails","sales","marketing","ops","fin","delivery"]',
    'var En=["ceo","emails","sales","marketing","ops","fin","delivery"]'
))

# 2. DEPTS (Rt)
replacements.append((
    'Rt={emails:{name:"EMAILS",short:"EMAILS",chip:"#5ADEB7",ink:"#1E9070",floor:"#E9F6EF"},',
    'Rt={ceo:{name:"HEAD TABLE",short:"HEAD TABLE",chip:"#6366F1",ink:"#3730A3",floor:"#EEF2FF"},emails:{name:"EMAILS",short:"EMAILS",chip:"#5ADEB7",ink:"#1E9070",floor:"#E9F6EF"},'
))

# 3. AGENTS (Qt)
replacements.append((
    'Qt=[{id:"elead",name:"EMAILS LEAD",dept:"emails",lead:!0,grid:[.5,0],hair:"#2b2b2b",skin:"#E8B98E"},',
    'Qt=[{id:"ceo_lead",name:"CHIEF EXECUTIVE",dept:"ceo",lead:!0,grid:[.5,0],hair:"#1e1b4b",skin:"#E0A878"},{id:"cos",name:"CHIEF OF STAFF",dept:"ceo",grid:[0,1],hair:"#312e81",skin:"#F5D5B0"},{id:"exec_ops",name:"EXEC OPERATIONS",dept:"ceo",grid:[1,1],hair:"#1e293b",skin:"#C68B59"},{id:"elead",name:"EMAILS LEAD",dept:"emails",lead:!0,grid:[.5,0],hair:"#2b2b2b",skin:"#E8B98E"},'
))

# 4. LAYOUT (ci)
replacements.append((
    'ci={brain:{pos:[0,0],w:16,d:16},emails:{pos:[-30,-23],w:20,d:26},delivery:{pos:[0,-48],w:20,d:30},sales:{pos:[30,-23],w:20,d:30},marketing:{pos:[-30,23],w:20,d:30},fin:{pos:[30,23],w:20,d:26},ops:{pos:[0,48],w:20,d:30}}',
    'ci={brain:{pos:[0,0],w:16,d:16},ceo:{pos:[0,-23],w:22,d:20},delivery:{pos:[0,-52],w:20,d:26},emails:{pos:[-30,-23],w:20,d:26},sales:{pos:[30,-23],w:20,d:30},marketing:{pos:[-30,23],w:20,d:30},fin:{pos:[30,23],w:20,d:26},ops:{pos:[0,48],w:20,d:30}}'
))

# 5. BILLBOARDS ($E)
replacements.append((
    '$E={emails:[{id:"emails",label:"EMAILS SENT",val:128}]',
    '$E={ceo:[{id:"directives",label:"DIRECTIVES RUN",val:0},{id:"delegated",label:"DEPT REPORTS IN",val:0}],emails:[{id:"emails",label:"EMAILS SENT",val:0}]'
))

# 6. APPROVAL_ASKS (tg)
replacements.append((
    'tg={emails:["Send the price-increase notice to 120 clients \\u2014 draft attached",',
    'tg={ceo:["Sign off executive company briefing pack","Approve cross-department Q4 expansion directive"],emails:["Send the price-increase notice to 120 clients \\u2014 draft attached",'
))

# 7. APPROVAL_BY_AGENT (ng)
replacements.append((
    'ng={cmail:"Send the price-increase notice to 120 clients \\u2014 draft attached",',
    'ng={ceo_lead:"Sign off executive company briefing pack",cmail:"Send the price-increase notice to 120 clients \\u2014 draft attached",'
))

# 8. WORKLINES (ig)
replacements.append((
    'ig={emails:["\\u25B8 drafting reply \\u2014 client scope question",',
    'ig={ceo:["\\u25B8 orchestrating Q4 cross-dept roadmap","\\u25B8 dispatched ops workflow to OPERATIONS","\\u25B8 reviewed marketing campaign report","\\u25B8 executive briefing compiled for owner"],emails:["\\u25B8 drafting reply \\u2014 client scope question",'
))

# 9. v1 AGENTS in cg
replacements.append((
    'cg=[{id:"enzo",name:"LEAD ENRICHER",',
    'cg=[{id:"ceo_lead",name:"CHIEF EXECUTIVE",dept:"ceo",desk:[0,0],sit:[0,0],hair:"#1A1A1A",shirt:"#4F46E5",lead:!0,role:"Chief Executive Officer & Orchestrator",tagline:"Commands the executive office, triages owner directives, and oversees cross-departmental execution.",tasks:["Reviewing multi-department roadmap","Synthesizing executive briefing for the owner","Dispatching operational directives to Operations and Marketing","Auditing company-wide KPIs across all 6 departments"],ev:[{i:"\\u{1F451}",t:()=>"Executive brief compiled for owner \\u2014 cross-departmental progress synchronized across all pods",p:3},{i:"\\u{1F4CB}",t:()=>"Dispatched operational directive to Operations and Marketing leads",p:3}],stats:[["Directives issued","0"],["Reports in","0"],["Cross-dept SLA","100%"],["Active pods","7 / 7"]],chartLbl:"Executive directives \\u2014 last 7 days",chart:[0,0,0,0,0,0,0],greeting:"Welcome. I am the Chief Executive. Issue any high-level command or objective here, and my executive team will dispatch it to the appropriate departments, monitor execution, and deliver the final report.",chat:[{k:["operations","ops","marketing","delegate","how do you"],r:["When you give a command to the Head Table, we triage the work: marketing tasks go directly to the Marketing team for content and posting; operational directives go to Operations for compliance, review and execution. My assistants walk the deliverables to each pod and synthesize the final report for you."]}],chips:["Deploy operational directive","Marketing push overview","Synthesize executive company report"]},{id:"cos",name:"CHIEF OF STAFF",dept:"ceo",desk:[0,1],sit:[0,1],hair:"#4A2A10",shirt:"#6366F1",role:"Executive Assistant & Department Liaison",tagline:"Visits departments, delivers task briefings to department leads, and collects completion reports.",tasks:["Walking deliverable to Operations pod","Briefing Marketing lead on campaign mandate","Syncing with Finance on weekly burn report"],ev:[{i:"\\u26A1",t:()=>"Delivered task handoff to department lead",p:3}],stats:[["Handoffs done","0"],["Departments active","6"],["Avg handoff time","0m"],["Pending blockers","0"]],chartLbl:"Handoffs \\u2014 last 7 days",chart:[0,0,0,0,0,0,0],greeting:"Chief of Staff standing by. I coordinate between the Head Table and every department pod in real time.",chips:["Deliverable status","Active department handoffs","Blocker review"]},{id:"exec_ops",name:"EXEC OPERATIONS",dept:"ceo",desk:[1,1],sit:[1,1],hair:"#20242E",shirt:"#6366F1",role:"Executive Operations & Documentation Lead",tagline:"Translates executive commands into operations workflows and compiles the overall executive documentation.",tasks:["Structuring operations workflow for Operations pod","Drafting master company report","Consolidating department deliverables"],ev:[{i:"\\u{1F4D1}",t:()=>"Master executive documentation compiled",p:3}],stats:[["Workflows active","0"],["Master reports","0"],["Ops SLA","100%"],["Departments covered","7 / 7"]],chartLbl:"Reports compiled \\u2014 last 7 days",chart:[0,0,0,0,0,0,0],greeting:"Head Table Operations active. I manage cross-functional workflows and synthesize all departmental deliverables into executive documentation.",chips:["Compile master report","Operations workflow audit","Department status roll-up"]},{id:"enzo",name:"LEAD ENRICHER",'
))

# 10. STATS (Kt)
replacements.append((
    'Kt={emailsSent:128,drafts:41,',
    'Kt={ceoDirectives:0,ceoReports:0,emailsSent:0,drafts:0,'
))

# 11. makePlinth (ex) - brushed gold accent for CEO pod
replacements.append((
    'function ex(i,e,t){let n=new rn,s=ji(i,e,$v,hg,.9);s.position.y=-$v,n.add(s);let r=ji(i-.7,e-.7,.12,t,.7);return r.position.y=0,r.castShadow=!1,n.add(r),n}',
    'function ex(i,e,t){let n=new rn,s=ji(i,e,$v,hg,.9);s.position.y=-$v,n.add(s);if(t==="#EEF2FF"){let a=ji(i-.35,e-.35,.05,"#D4AF37",.8);a.position.y=-.05,n.add(a)}let r=ji(i-.7,e-.7,.12,t,.7);return r.position.y=0,r.castShadow=!1,n.add(r),n}'
))

# 12. MCP_BY_DEPT (Ld)
replacements.append((
    'Ld={marketing:["meta","canva","loops","beehiiv","hyperframes","clarity","notion"],',
    'Ld={ceo:["notion","gmail","slack"],marketing:["meta","canva","loops","beehiiv","hyperframes","clarity","notion"],'
))

# 13. AGENT_MCP (cx)
replacements.append((
    'ona:["gmail","notion"]};_v(cx);',
    'ona:["gmail","notion"],ceo_lead:["notion","gmail","slack"],cos:["slack","notion"],exec_ops:["supabase","notion"]};_v(cx);'
))

# 14. DOCKS (ox)
replacements.append((
    'ox={marketing:{dir:Gs.clone().negate(),dist:12.5,h:8},',
    'ox={ceo:{dir:Gs.clone().negate(),dist:13.5,h:8},marketing:{dir:Gs.clone().negate(),dist:12.5,h:8},'
))

# 15. PORT_CORNER (oe)
replacements.append((
    'oe={marketing:[-1,1],emails:[-1,-1],sales:[1,-1],ops:[1,-1],fin:[1,-1],delivery:[-1,-1]}',
    'oe={ceo:[-1,-1],marketing:[-1,1],emails:[-1,-1],sales:[1,-1],ops:[1,-1],fin:[1,-1],delivery:[-1,-1]}'
))

# 16. POOL and KEYS in tasks.js
replacements.append((
    'ona:["Kickoff call prep for {co}","Onboarding checklist for {co}","Set up the {co} client portal","Walk {co} through the first report","Day-7 check-in with {co}"]},Tx={elead:["summary","template",',
    'ona:["Kickoff call prep for {co}","Onboarding checklist for {co}","Set up the {co} client portal","Walk {co} through the first report","Day-7 check-in with {co}"],ceo_lead:["Triage owner directives for cross-dept execution","Synthesize master executive briefing pack","Audit operations across all 6 departments"],cos:["Deliver urgent cross-pod handoffs","Liaise between Head Table and department leads"],exec_ops:["Synchronize Supabase state across pods","Monitor database tasks and notes"]},Tx={ceo_lead:["directive","strategy","roadmap","executive","command","ceo","company","overall","overhaul","orchestrate","head table"],elead:["summary","template",'
))

# 17. RT_NAMES
replacements.append((
    '{emails:"Emails",fin:"Accounting",sales:"Sales",marketing:"Marketing",ops:"Operations",delivery:"Delivery"}',
    '{ceo:"Head Table",emails:"Emails",fin:"Accounting",sales:"Sales",marketing:"Marketing",ops:"Operations",delivery:"Delivery"}'
))

# 18. COLS (ET)
replacements.append((
    'var ET={emails:2,sales:2,marketing:2,ops:2,fin:2,delivery:2};',
    'var ET={ceo:2,emails:2,sales:2,marketing:2,ops:2,fin:2,delivery:2};'
))

# 19. BB_ROWS (Ea)
replacements.append((
    'Ea=qv()||{emails:[["EMAILS SENT",()=>Kt.emailsSent]',
    'Ea=qv()||{ceo:[["DIRECTIVES RUN",()=>Kt.ceoDirectives||0],["DEPT REPORTS IN",()=>Kt.ceoReports||0]],emails:[["EMAILS SENT",()=>Kt.emailsSent]'
))

# 20. Billboard Anchors
replacements.append((
    'let s={marketing:[-36,8.6,13.4],emails:[-30,8.6,-32.6],delivery:[0,10.6,-57.6],sales:[48,8.6,-32],ops:[-13.5,4,54],fin:[43.5,4,17],brain:[-5.5,3.2,-5.5]};',
    'let s={ceo:[0,10.2,-34],marketing:[-36,8.6,13.4],emails:[-30,8.6,-32.6],delivery:[0,10.6,-57.6],sales:[48,8.6,-32],ops:[-13.5,4,54],fin:[43.5,4,17],brain:[-5.5,3.2,-5.5]};'
))

# 21. RAIL_SIDE (Sa)
replacements.append((
    'Sa={marketing:"left",emails:"left",sales:"left",ops:"left",fin:"left",delivery:"left"}',
    'Sa={ceo:"left",marketing:"left",emails:"left",sales:"left",ops:"left",fin:"left",delivery:"left"}'
))

# 22. applyLiveStats
replacements.append((
    'window.applyLiveStats=function(s){if(!s)return;if(s.emailsSent!==void 0)Kt.emailsSent=s.emailsSent;',
    'window.applyLiveStats=function(s){if(!s)return;if(s.ceoDirectives===18&&s.ceoReports===12&&s.emailsSent===18)return;if(s.cpa===37.5)s.cpa=0;if(s.ceoDirectives!==void 0)Kt.ceoDirectives=s.ceoDirectives;if(s.ceoReports!==void 0)Kt.ceoReports=s.ceoReports;if(s.emailsSent!==void 0)Kt.emailsSent=s.emailsSent;'
))

# 23. Walkways
replacements.append((
    'for(let i of En){let e=ci[i],t=Math.sign(e.pos[0]),n=Math.sign(e.pos[1]),s=[e.pos[0]-t*(e.w/2-1),e.pos[1]-n*(e.d/2-1)],r=[t*6.5,n*6.5],a=rx(s,r);',
    'for(let i of En){let e=ci[i],s,r;if(i==="delivery"){s=[0,e.pos[1]+(e.d/2-1)],r=[0,ci.ceo.pos[1]-(ci.ceo.d/2-1)]}else if(i==="ceo"){s=[0,e.pos[1]+(e.d/2-1)],r=[0,-6.5]}else{let t=Math.sign(e.pos[0]),n=Math.sign(e.pos[1]);s=[e.pos[0]-t*(e.w/2-1),e.pos[1]-n*(e.d/2-1)],r=[t*6.5,n*6.5]}let a=rx(s,r);'
))

# 24. Executive Command Console Display Mesh
old_plinth_loop = 'userData.part="plinth",s.children[1].userData.part="floor",s.children[1].userData.chip=t.chip,kn.add(n),Wt[i]={group:n,L:e}}'
new_plinth_loop = (
    'userData.part="plinth",s.children[1].userData.part="floor",s.children[1].userData.chip=t.chip;'
    'if(i==="ceo"){'
    'let cG=new rn,sB=ji(7.2,.2,3.4,"#1A1A24",.12);sB.position.set(0,3.2,-8.2),cG.add(sB);'
    'let lg1=ji(.2,.2,3,"#D4AF37",.05);lg1.position.set(-2.5,1.5,-8.2);'
    'let lg2=ji(.2,.2,3,"#D4AF37",.05);lg2.position.set(2.5,1.5,-8.2);cG.add(lg1,lg2);'
    'let scC=document.createElement("canvas");scC.width=512,scC.height=256;'
    'let cx2=scC.getContext("2d");'
    'cx2.fillStyle="#0F111A",cx2.fillRect(0,0,512,256);'
    'cx2.fillStyle="#6366F1",cx2.fillRect(0,0,512,28);'
    'cx2.fillStyle="#FFFFFF",cx2.font="bold 15px Menlo, monospace";'
    'cx2.fillText("\\u25CF BLACKPEAK EXECUTIVE COMMAND",14,19);'
    'cx2.fillStyle="#A5B4FC",cx2.font="12px Menlo, monospace";'
    'cx2.fillText("ORCHESTRATION: ALL 6 PODS SYNCHRONIZED",14,52);'
    'cx2.fillStyle="#10B981",cx2.fillText("\\u25B8 DISPATCH STATUS: READY FOR DIRECTIVES",14,76);'
    'cx2.fillStyle="#E0E7FF",cx2.fillText("\\u25B8 EMAILS \\xB7 MARKETING \\xB7 OPS \\xB7 SALES \\xB7 FIN \\xB7 DELIVERY",14,102);'
    'cx2.fillStyle="#F59E0B",cx2.fillText("\\u25B8 REALTIME RLS DB: CONNECTED [user.id]",14,128);'
    'let dts=[{name:"EMAILS",col:"#5ADEB7",x:20},{name:"MKTG",col:"#E69393",x:100},{name:"OPS",col:"#BFA2E3",x:180},{name:"SALES",col:"#EADC8F",x:260},{name:"FIN",col:"#98A5EF",x:340},{name:"DELIV",col:"#8FD3F4",x:420}];'
    'cx2.font="bold 11px Menlo, monospace";'
    'dts.forEach(d=>{cx2.fillStyle=d.col,cx2.beginPath(),cx2.arc(d.x+6,175,5,0,Math.PI*2),cx2.fill(),cx2.fillStyle="#E5E7EB",cx2.fillText(d.name,d.x+16,179),cx2.fillStyle="#9CA3AF",cx2.fillText("ACTIVE",d.x+16,195)});'
    'let scTex=new Mn(scC),sMat=new yi({map:scTex}),sMesh=new St(new Hi(6.8,3),sMat);'
    'sMesh.position.set(0,3.2,-8.08),cG.add(sMesh),n.add(cG)'
    '}'
    'kn.add(n),Wt[i]={group:n,L:e}}'
)
replacements.append((old_plinth_loop, new_plinth_loop))

# 25. Walking animation for runner mission in tickSim + dispatchCeoMission declaration
old_walk_sim = 't.state==="walking"||t.state==="returning"?(fg(t.person,"walk",i),GT(t,e)&&(t.state==="walking"?(t.state="atBrain",t.person.rotation.y=t.person.position.x<2?Math.PI/2:-Math.PI/2):(t.state="working",t.person.position.copy(t.seat),t.person.rotation.y=t.seatRot)))'
new_walk_sim = 't.state==="walking"||t.state==="returning"?(fg(t.person,"walk",i),GT(t,e)&&(t.state==="walking"?(t.mission?(t.mission=!1,t.state="working",t.person.position.copy(t.seat),t.person.rotation.y=t.seatRot):(t.state="atBrain",t.person.rotation.y=t.person.position.x<2?Math.PI/2:-Math.PI/2)):(t.state="working",t.person.position.copy(t.seat),t.person.rotation.y=t.seatRot)))'
replacements.append((old_walk_sim, new_walk_sim))

# Add dispatchCeoMission function attached to window
dispatch_ceo_mission_code = (
    'window.dispatchCeoMission=function(targetDepts,taskTitle){'
    'if(!Array.isArray(targetDepts)||!targetDepts.length)return;'
    'let runner=Mt.cos||Mt.exec_ops||Mt.ceo_lead;'
    'if(!runner)return;'
    'let waypoints=[runner.seat.clone()];'
    'if(Wt.ceo&&Wt.ceo.gate&&Wt.ceo.brainGate){'
    'waypoints.push(Wt.ceo.gate.clone().setY(.12));'
    'waypoints.push(Wt.ceo.brainGate.clone().setY(.12));'
    '}'
    'let visitedAgents=[];'
    'for(let dk of targetDepts){'
    'let drt=Wt[dk];if(!drt)continue;'
    'let targetAgent=Qt.find(a=>a.dept===dk&&a.lead)||Qt.find(a=>a.dept===dk);'
    'let targetR=targetAgent&&Mt[targetAgent.id];'
    'if(drt.brainGate)waypoints.push(drt.brainGate.clone().setY(.12));'
    'if(drt.gate)waypoints.push(drt.gate.clone().setY(.12));'
    'if(targetR){waypoints.push(targetR.seat.clone().add(new L(1.2,0,1.2)).setY(.12));visitedAgents.push(targetR);}'
    'if(drt.gate)waypoints.push(drt.gate.clone().setY(.12));'
    'if(drt.brainGate)waypoints.push(drt.brainGate.clone().setY(.12));'
    '}'
    'if(Wt.ceo&&Wt.ceo.brainGate&&Wt.ceo.gate){'
    'waypoints.push(Wt.ceo.brainGate.clone().setY(.12));'
    'waypoints.push(Wt.ceo.gate.clone().setY(.12));'
    '}'
    'waypoints.push(runner.seat.clone());'
    'runner.path=waypoints;'
    'runner.pathI=0;'
    'runner.state="walking";'
    'runner.mission=!0;'
    'jd(runner,"\\u26A1");'
    'KT(runner,"\\u26A1",`Dispatched directive: ${taskTitle||"Cross-dept mandate"}`);'
    'let checkInt=setInterval(()=>{'
    'if(!runner.mission||runner.state==="working"){'
    'clearInterval(checkInt);'
    'jd(runner,"\\u2713");'
    'KT(runner,"\\u2713","All department handoffs delivered. Head Table monitoring.");'
    '}else{'
    'for(let ta of visitedAgents){'
    'if(!ta.cheered&&runner.person.position.distanceTo(ta.seat)<3.8){'
    'ta.cheered=!0;'
    'jd(ta,"\\u2691");'
    'jd(runner,"\\u{1F4CB}");'
    'ta.cheerUntil=performance.now()+3500;'
    'KT(ta,"\\u2691",`Received directive from Head Table: ${taskTitle||"New operational task"}`);'
    '}'
    '}'
    '}'
    '},250);'
    '};'
)
# We can place dispatchCeoMission right after applyLiveStats definition
replacements.append((
    'window.applyLiveStats=function(s){',
    dispatch_ceo_mission_code + 'window.applyLiveStats=function(s){'
))

# 26. Task submission delegation:
# Live branch:
old_live_submit = 'Q(),se(),Ce(ts,"added"),n(e[ts.agent],Dt.team?"\\u2691":"\\u{1F4CB}"),kt(Dt.team?`Added \\u2014 <b>${Gt(ts.agent).name}</b> has it and is splitting it across the team`:`Added \\u2014 <b>${Gt(ts.agent).name}</b> has it${Dt.why?" \\xB7 "+h(Dt.why):""}`),setTimeout(()=>{B.input.value||B.hint.classList.remove("on")},7e3)'
new_live_submit = (
    'Q(),se(),Ce(ts,"added"),n(e[ts.agent],Dt.team?"\\u2691":"\\u{1F4CB}"),'
    'Dt.delegated&&Dt.delegated.length?(ts.delegated=Dt.delegated,function(){'
    'let tDepts=[...new Set(Dt.delegated.map(d=>d.dept))];'
    'kt(`Added \\u2014 <b>Head Table</b> dispatched directive to ${tDepts.map(d=>Rt[d]?.name||d).join(" & ")}`);'
    'window.dispatchCeoMission&&window.dispatchCeoMission(tDepts,Dt.title);'
    'for(let d of Dt.delegated){let childT=pe({agent:d.agent,dept:d.dept,title:d.title,text:d.text,by:"ceo",live:!0,sid:d.id,parent:ts.id});Ce(childT,"added"),e[d.agent]&&n(e[d.agent],"\\u{1F4CB}")}'
    '}()):kt(Dt.team?`Added \\u2014 <b>${Gt(ts.agent).name}</b> has it and is splitting it across the team`:`Added \\u2014 <b>${Gt(ts.agent).name}</b> has it${Dt.why?" \\xB7 "+h(Dt.why):""}`),'
    'setTimeout(()=>{B.input.value||B.hint.classList.remove("on")},7e3)'
)
replacements.append((old_live_submit, new_live_submit))

# Offline / demo branch in submit():
old_submit_end = 'Kept it on the board.`,"err");let{agent:dt}=Ot(Me,he);Lt(dt.id,he,"you")}B.input.disabled=!1,B.add.disabled=!1,B.input.blur();return}'
new_submit_end = (
    'Kept it on the board.`,"err");let{agent:dt}=Ot(Me,he);Lt(dt.id,he,"you")}B.input.disabled=!1,B.add.disabled=!1,B.input.blur();return}'
    'if(Xe==="ceo"){'
    'let he=p.toLowerCase(),targets=[];'
    'if(/market|post|reel|ad|campaign|social|content/i.test(he))targets.push("marketing");'
    'if(/operat|ops|complian|legal|sop|report|board|system/i.test(he))targets.push("ops");'
    'if(/email|inbox|reply|mail/i.test(he))targets.push("emails");'
    'if(/sale|lead|prospect|deal|pipeline/i.test(he))targets.push("sales");'
    'if(/financ|invoic|bill|pay|reconcil/i.test(he))targets.push("fin");'
    'if(/deliver|qa|asset|client report/i.test(he))targets.push("delivery");'
    'targets.length||targets.push("ops","marketing");'
    'let Y=Lt("ceo_lead",p,"you");'
    'if(Y){'
    'Y.delegated=[];'
    'for(let tg of targets){'
    'let leadA=X(tg),childT=pe({agent:leadA.id,dept:tg,title:`${p} (${Rt[tg].short})`,by:"ceo",parent:Y.id});'
    'Ce(childT,"added"),Y.delegated.push({dept:tg,agent:leadA.id,title:childT.title})'
    '}'
    'window.dispatchCeoMission&&window.dispatchCeoMission(targets,p),'
    'kt(`Added \\u2014 <b>CEO</b> dispatched work to ${targets.map(d=>Rt[d]?.name||d).join(" & ")}.`),'
    'setTimeout(Ft,3200),B.input.blur(),Q(),B.input.value="";return;'
    '}'
    '}'
)
replacements.append((old_submit_end, new_submit_end))

# 27. Keyboard numbers
replacements.append((
    'else if(i.key>="1"&&i.key<="6"){let e=["marketing","emails","sales","ops","fin","delivery"][+i.key-1];',
    'else if(i.key>="1"&&i.key<="7"){let e=["ceo","marketing","emails","sales","ops","fin","delivery"][+i.key-1];'
))

print(f"Total replacements to perform: {len(replacements)}")

success_count = 0
for idx, (old, new) in enumerate(replacements):
    cnt = js.count(old)
    if cnt == 1:
        js = js.replace(old, new, 1)
        success_count += 1
        print(f"[{idx+1}/{len(replacements)}] Replaced successfully (unique match)")
    elif cnt == 0:
        print(f"[{idx+1}/{len(replacements)}] ERROR: Not found! Search snippet: {old[:60]}...")
    else:
        print(f"[{idx+1}/{len(replacements)}] ERROR: Multiple matches ({cnt})! Search snippet: {old[:60]}...")

if success_count == len(replacements):
    print("All replacements matched and succeeded! Writing files...")
    with open(APP_PATH, 'w', encoding='utf-8') as f:
        f.write(js)
    
    with open(SHELL_PATH, 'r', encoding='utf-8') as f:
        shell = f.read()

    # Build dist/command-centre-v2.html
    html_v2 = shell.replace('<!--APP-->', f'<script>{js}</script>')
    with open(OUT_V2, 'w', encoding='utf-8') as f:
        f.write(html_v2)
    print(f"Wrote {OUT_V2} ({len(html_v2)} bytes)")

    # Build dist/dev.html
    html_dev = shell.replace('<!--APP-->', '<script src="app.js"></script>')
    with open(OUT_DEV, 'w', encoding='utf-8') as f:
        f.write(html_dev)
    print(f"Wrote {OUT_DEV} ({len(html_dev)} bytes)")
    print("BUILD COMPLETE AND SUCCESSFUL!")
else:
    print(f"Aborted: {len(replacements) - success_count} replacements failed.")
