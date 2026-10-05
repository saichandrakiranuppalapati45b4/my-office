import os
import re

APP_PATH = 'dist/app.js'
SHELL_PATH = 'src/shell.html'
OUT_V2 = 'dist/command-centre-v2.html'
OUT_DEV = 'dist/dev.html'

with open(APP_PATH, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update B initialization to query chatPanel and tpanel, plus define addChatMsg
old_b_init = (
    'let fe=document.getElementById("tpanel"),B={dd:fe.querySelector(".tp-dd"),'
    'ddName:fe.querySelector(".tp-dd .tp-ddn"),ddDot:fe.querySelector(".tp-dd .dot"),'
    'menu:fe.querySelector(".tp-menu"),input:fe.querySelector(".tp-in"),'
    'add:fe.querySelector(".tp-add"),hint:fe.querySelector(".tp-hint"),'
    'chips:fe.querySelector(".tp-chips"),rows:fe.querySelector(".tp-rows"),'
    'scope:fe.querySelector(".tp-scope"),rep:fe.querySelector(".tp-rep"),'
    'repRow:fe.querySelector(".tp-rep-row"),cad:fe.querySelector(".tp-cad"),'
    'at:fe.querySelector(".tp-at"),okc:fe.querySelector(".tp-okc"),'
    'next:fe.querySelector(".tp-next"),model:fe.querySelector(".tp-model"),'
    'effort:fe.querySelector(".tp-effort"),bigBtn:fe.querySelector(".tp-big-btn"),'
    'team:fe.querySelector(".tp-team")},He='
)

new_b_init = (
    'let fe=document.getElementById("tpanel"),_cp=document.getElementById("chatPanel"),B={'
    'dd:(_cp||fe).querySelector(".tp-dd"),ddName:(_cp||fe).querySelector(".tp-dd .tp-ddn"),'
    'ddDot:(_cp||fe).querySelector(".tp-dd .dot"),menu:(_cp||fe).querySelector(".tp-menu"),'
    'input:(_cp||fe).querySelector(".tp-in"),add:(_cp||fe).querySelector(".tp-add"),'
    'hint:(_cp||fe).querySelector(".tp-hint"),chips:fe.querySelector(".tp-chips"),'
    'rows:fe.querySelector(".tp-rows"),scope:fe.querySelector(".tp-scope"),'
    'rep:(_cp||fe).querySelector(".tp-rep"),repRow:(_cp||fe).querySelector(".tp-rep-row"),'
    'cad:(_cp||fe).querySelector(".tp-cad"),at:(_cp||fe).querySelector(".tp-at"),'
    'okc:(_cp||fe).querySelector(".tp-okc"),next:fe.querySelector(".tp-next"),'
    'model:(_cp||fe).querySelector(".tp-model"),effort:(_cp||fe).querySelector(".tp-effort"),'
    'bigBtn:(_cp||fe).querySelector(".tp-big-btn"),team:(_cp||fe).querySelector(".tp-team")};'
    'function addChatMsg(w,t,u,d){'
    'let s=document.getElementById("cpMessages");if(!s)return;'
    'let m=document.createElement("div");m.className="cp-msg "+(u?"user":"agent");'
    'let tm=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});'
    'm.innerHTML=`<div class="cp-msg-head">${d?`<span class="cp-avatar" style="border-color:${d};background:${d}22;color:${d}">${(w||"A")[0].toUpperCase()}</span>`:""}<span class="cp-sender">${esc(w)}</span><span class="cp-time">${tm}</span></div><div class="cp-msg-body">${esc(t)}</div>`;'
    's.appendChild(m);s.scrollTop=s.scrollHeight;'
    '}window.addChatMsg=addChatMsg;'
    'setTimeout(()=>{'
    'addChatMsg("Chief Executive","Welcome to the Executive Office. Directives entered here are routed through Head Table and dispatched to all 6 departments.",!1,"#2563eb");'
    'document.querySelectorAll("#cpQuickPrompts .cp-chip").forEach(btn=>{'
    'btn.addEventListener("click",()=>{'
    'if(btn.dataset.text&&B.input){B.input.value=btn.dataset.text;B.input.focus();Ft();}'
    '});'
    '});'
    '},100);let He='
)

if old_b_init in js:
    js = js.replace(old_b_init, new_b_init, 1)
    print("1. Replaced B initialization and added chat message handling ✓")
else:
    print("WARNING: old_b_init not found directly in js, checking with flexible whitespace")

# 2. Update typing event listeners on B.input
old_typing = 'B.input.addEventListener("input",()=>{fe.querySelector(".tp-cmd").classList.toggle("typing",!!B.input.value),ze(),Ft()}),B.input.addEventListener("blur",()=>{B.input.value||fe.querySelector(".tp-cmd").classList.remove("typing")})'
new_typing = 'B.input.addEventListener("input",()=>{(_cp||fe).querySelector(".tp-cmd").classList.toggle("typing",!!B.input.value),ze(),Ft()}),B.input.addEventListener("blur",()=>{B.input.value||(_cp||fe).querySelector(".tp-cmd").classList.remove("typing")})'
if old_typing in js:
    js = js.replace(old_typing, new_typing, 1)
    print("2. Replaced typing listeners ✓")

# 3. Update It (setDept) to update cpScope badge and default to ceo
old_it = 'function It(p){Xe=p,B.ddName.textContent=Rt[p].short,B.ddDot.style.background=Rt[p].chip,U.dept.textContent=Rt[p].name.toUpperCase(),U.dot.style.background=Rt[p].chip,B.input.placeholder=`Type a task for ${Rt[p].name.toLowerCase()}\\u2026`,Ft()}'
new_it = 'function It(p){Xe=p,B.ddName.textContent=Rt[p].short,B.ddDot.style.background=Rt[p].chip,U.dept.textContent=Rt[p].name.toUpperCase(),U.dot.style.background=Rt[p].chip,B.input.placeholder=`Type a task or command for ${Rt[p].name.toLowerCase()}\\u2026`,Ft();let s=document.getElementById("cpScope");s&&(s.textContent=Rt[p].name.toUpperCase(),s.style.borderColor=Rt[p].chip,s.style.color=Rt[p].chip)}'
if old_it in js:
    js = js.replace(old_it, new_it, 1)
    print("3. Replaced setDept (It) ✓")

# Set default dept to ceo in app.js
old_dept_init = 'let Xe="marketing",tr="all";'
new_dept_init = 'let Xe="ceo",tr="all";'
if old_dept_init in js:
    js = js.replace(old_dept_init, new_dept_init, 1)
    print("3b. Default dept set to ceo ✓")

# 4. In Xn (submit), add user chat message
old_xn_start = 'async function Xn(){let p=B.input.value.trim().replace(/[.!]+$/,"");if(!p)return;He.classList.remove("on"),p=p.charAt(0).toUpperCase()+p.slice(1);'
new_xn_start = 'async function Xn(){let p=B.input.value.trim().replace(/[.!]+$/,"");if(!p)return;He.classList.remove("on"),p=p.charAt(0).toUpperCase()+p.slice(1);window.addChatMsg&&window.addChatMsg("You",p,!0);'
if 'window.addChatMsg&&window.addChatMsg("You"' not in js and old_xn_start in js:
    js = js.replace(old_xn_start, new_xn_start, 1)
    print("4. Added user message logging to Xn ✓")

# 5. In Xn (submit), add agent/CEO responses
old_del_msg = 'kt(`Added \\u2014 <b>Head Table</b> dispatched directive to ${tDepts.map(d=>Rt[d]?.name||d).join(" & ")}`);'
new_del_msg = 'kt(`Added \\u2014 <b>Head Table</b> dispatched directive to ${tDepts.map(d=>Rt[d]?.name||d).join(" & ")}`);window.addChatMsg&&window.addChatMsg("Head Table",`Directive dispatched to ${tDepts.map(d=>Rt[d]?.name||d).join(" & ")}. Tracking in real time.`,!1,"#2563eb");'
if 'window.addChatMsg&&window.addChatMsg("Head Table"' not in js and old_del_msg in js:
    js = js.replace(old_del_msg, new_del_msg, 1)
    print("5. Added Head Table response logging ✓")

# 6. In _d (overviewPos), balance between left Task Status panel (380px) and right Chat panel (400px)
old_overview_pos = 'function _d(){let i=($e?$e.panelWidth():400)+30,e=Ma.zoom*innerHeight/(2*wa),t=i/2/e;return[Ma.base[0]+Ox.x*t,0,Ma.base[2]+Ox.z*t]}'
new_overview_pos = 'function _d(){let leftW=380+18,rightW=($e?$e.panelWidth():400)+18,net=(rightW-leftW)/2,e=Ma.zoom*innerHeight/(2*wa),t=net/e;return[Ma.base[0]+Ox.x*t,0,Ma.base[2]+Ox.z*t]}'
if old_overview_pos in js:
    js = js.replace(old_overview_pos, new_overview_pos, 1)
    print("6. Balanced overview camera centering ✓")

# 7. In billboard clamping, prevent collision with left panel
old_bb_clamp = 'if(a.sideBadge){let u=innerWidth-(($e?$e.panelWidth():400)+26);c=wr(c,64+l/2,innerHeight-l/2-8),a.sideLeft?(o=wr(o,d+8,u),h="translate(-100%,-50%)"):(o=wr(o,8,u-d),h="translate(0,-50%)")}else{let u=innerWidth-(($e?$e.panelWidth():400)+26);c=wr(c,l+64,innerHeight-12),o=wr(o,d/2+8,u-d/2),h="translate(-50%,-100%)"}'
new_bb_clamp = 'let le=380+26;if(a.sideBadge){let u=innerWidth-(($e?$e.panelWidth():400)+26);c=wr(c,64+l/2,innerHeight-l/2-8),a.sideLeft?(o=wr(o,le+d,u),h="translate(-100%,-50%)"):(o=wr(o,le,u-d),h="translate(0,-50%)")}else{let u=innerWidth-(($e?$e.panelWidth():400)+26);c=wr(c,l+64,innerHeight-12),o=wr(o,d/2+le,u-d/2),h="translate(-50%,-100%)"}'
if old_bb_clamp in js:
    js = js.replace(old_bb_clamp, new_bb_clamp, 1)
    print("7. Updated billboard clamping for both left and right edges ✓")

# 8. In return object of tasks init, update panelWidth
old_pw = 'panelWidth:()=>fe.offsetWidth,'
new_pw = 'panelWidth:()=>((_cp||fe).offsetWidth),'
if old_pw in js:
    js = js.replace(old_pw, new_pw, 1)
    print("8. Updated panelWidth in return object ✓")

with open(APP_PATH, 'w', encoding='utf-8') as f:
    f.write(js)
print(f"Saved {APP_PATH}")

# Re-bake into HTML bundles
with open(SHELL_PATH, 'r', encoding='utf-8') as f:
    shell = f.read()

html_v2 = shell.replace('<!--APP-->', f'<script>{js}</script>')
with open(OUT_V2, 'w', encoding='utf-8') as f:
    f.write(html_v2)
print(f"Wrote {OUT_V2} ({len(html_v2)} bytes)")

OUT_INDEX = 'dist/index.html'
with open(OUT_INDEX, 'w', encoding='utf-8') as f:
    f.write(html_v2)
print(f"Wrote {OUT_INDEX} ({len(html_v2)} bytes)")

html_dev = shell.replace('<!--APP-->', '<script src="app.js"></script>')
with open(OUT_DEV, 'w', encoding='utf-8') as f:
    f.write(html_dev)
print(f"Wrote {OUT_DEV} ({len(html_dev)} bytes)")
print("ALL DONE: Split panels and live chat successfully deployed!")
