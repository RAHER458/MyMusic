/* RH Social Core — IndexedDB, ветки комментариев и реакции без внешних библиотек */
(function(){
"use strict";
const DB_NAME="rh_media_social",DB_VERSION=1,STORES=["users","posts","comments","reactions","media"];
const $=id=>document.getElementById(id);
const cache={comments:{},reactions:[],ready:false};
const ui={postId:null,sort:"new",replyTo:null,editing:null,collapsed:new Set()};
const EMOJI=["❤️","😂","🔥","👍","😮"];
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const parse=(key,fallback)=>{try{const x=JSON.parse(localStorage.getItem(key)||"null");return x===null?fallback:x}catch(e){return fallback}};
const currentUser=()=>{const name=localStorage.getItem("rh_local_session")||"",u=parse("rh_local_users",{})[name.toLowerCase()];return u&&u.status!=="banned"?u:null};
const userId=()=>{const u=currentUser();return u?String(u.username).toLowerCase():""};
const toast=s=>{const t=$("toast");if(t){t.textContent=s;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2400)}};
let dbPromise;
function openDB(){
 if(!("indexedDB" in window))return Promise.reject(Error("IndexedDB недоступна в этом браузере"));
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{const db=req.result;
   if(!db.objectStoreNames.contains("users"))db.createObjectStore("users",{keyPath:"id"});
   if(!db.objectStoreNames.contains("posts"))db.createObjectStore("posts",{keyPath:"id"});
   if(!db.objectStoreNames.contains("comments"))db.createObjectStore("comments",{keyPath:"id"});
   if(!db.objectStoreNames.contains("reactions"))db.createObjectStore("reactions",{keyPath:"id"});
   if(!db.objectStoreNames.contains("media"))db.createObjectStore("media",{keyPath:"id"});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error("Не удалось открыть IndexedDB"));
 });
 return dbPromise;
}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error("Ошибка IndexedDB"))})}
async function all(store){const db=await openDB();return request(db.transaction(store,"readonly").objectStore(store).getAll())}
async function put(store,value){const db=await openDB();return request(db.transaction(store,"readwrite").objectStore(store).put(value))}
async function remove(store,id){const db=await openDB();return request(db.transaction(store,"readwrite").objectStore(store).delete(id))}
async function migrate(){
 if(localStorage.getItem("rh_idb_migration_v1")==="done")return;
 const us=parse("rh_local_users",{}),ps=parse("rh_demo_posts",[]),cs=parse("rh_local_comments",{}),likes=parse("rh_demo_likes",{});
 const db=await openDB(),tx=db.transaction(STORES,"readwrite");
 const userStore=tx.objectStore("users"),postStore=tx.objectStore("posts"),commentStore=tx.objectStore("comments"),reactionStore=tx.objectStore("reactions"),mediaStore=tx.objectStore("media");
 Object.values(us).forEach(u=>{if(u&&u.username){userStore.put({...u,id:String(u.username).toLowerCase()});if(u.avatar)mediaStore.put({id:"avatar:"+String(u.username).toLowerCase(),owner:String(u.username).toLowerCase(),kind:"avatar",url:u.avatar,mime:"image/*",updated_at:new Date().toISOString()})}});
 (Array.isArray(ps)?ps:[]).forEach(p=>{if(!p||p.id==null)return;postStore.put(p);(Array.isArray(p.media)?p.media:[]).forEach((m,i)=>mediaStore.put({id:"post:"+p.id+":"+i,postId:String(p.id),kind:"post",...m}))});
 Object.entries(cs||{}).forEach(([postId,list])=>{(Array.isArray(list)?list:[]).forEach((c,i)=>{const id=String(postId)+"::"+String(c.id||i);commentStore.put({id,legacyId:c.id||null,postId:String(postId),parentId:null,depth:0,body:String(c.body||""),username:String(c.username||"user"),display_name:String(c.display_name||c.username||"Участник"),created_at:c.created_at||new Date().toISOString(),updated_at:c.updated_at||null,status:c.status||"approved",deleted:c.status==="deleted",reactions:{}})})});
 Object.entries(likes||{}).forEach(([postId,entry])=>{const list=Array.isArray(entry)?entry:(entry&&Array.isArray(entry.users)?entry.users:[]);[...new Set(list.map(x=>String(x).toLowerCase()))].forEach(uid=>reactionStore.put({id:"post:"+postId+":"+uid,targetType:"post",targetId:String(postId),userId:uid,emoji:"❤️",created_at:new Date().toISOString()}))});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Миграция отменена"))});
 localStorage.setItem("rh_idb_migration_v1","done");
}
async function refreshCache(){
 const [cs,rs]=await Promise.all([all("comments"),all("reactions")]);
 cache.comments={};cs.forEach(c=>{(cache.comments[c.postId]||(cache.comments[c.postId]=[])).push(c)});
 cache.reactions=rs;cache.ready=true;
 document.dispatchEvent(new CustomEvent("rh-social-ready"));
 refreshVisible();
}
function activeComments(postId){return (cache.comments[String(postId)]||[]).filter(c=>!c.deleted&&c.status!=="deleted"&&(c.status==="approved"||!c.status))}
function countPostReactions(postId){return cache.reactions.filter(r=>r.targetType==="post"&&String(r.targetId)===String(postId)).length}
function hasPostReaction(postId){return cache.reactions.some(r=>r.targetType==="post"&&String(r.targetId)===String(postId)&&r.userId===userId())}
function refreshVisible(){
 if(!cache.ready)return;
 document.querySelectorAll('[data-action="like"][data-id]').forEach(b=>{const id=b.dataset.id,count=countPostReactions(id);b.innerHTML=(hasPostReaction(id)?"♥ ":"♡ ")+count;b.classList.toggle("liked",hasPostReaction(id))});
 document.querySelectorAll('[data-action="comments"][data-id]').forEach(b=>{const id=b.dataset.id;b.innerHTML="▤ "+activeComments(id).length});
}
function modalShell(){
 const root=$("modalRoot");if(!root)return null;
 root.innerHTML='<div class="modal-backdrop rh-social-backdrop" data-social-close><section class="modal rh-social-modal" role="dialog" aria-modal="true" aria-labelledby="rhSocialTitle"><h2 id="rhSocialTitle">Обсуждение</h2><p class="modal-sub">Комментарии сообщества RH</p><div id="rhSocialBody"></div><div class="rh-social-compose" id="rhSocialCompose"></div><div class="modal-actions"><button type="button" class="secondary" data-social-close>Закрыть</button></div></section></div>';
 return root.querySelector(".rh-social-modal");
}
function treeFor(postId){
 const list=activeComments(postId),map=new Map(list.map(c=>[c.id,{...c,children:[]} ])),roots=[];
 map.forEach(c=>{const p=c.parentId&&map.get(c.parentId);if(p&&c.depth<=2)p.children.push(c);else roots.push(c)});
 const sort=(arr)=>{arr.sort((a,b)=>ui.sort==="old"?new Date(a.created_at)-new Date(b.created_at):ui.sort==="popular"?reactionCount(b)-reactionCount(a):new Date(b.created_at)-new Date(a.created_at));arr.forEach(x=>sort(x.children))};sort(roots);return roots;
}
function reactionCount(c){return cache.reactions.filter(r=>r.targetType==="comment"&&r.targetId===c.id).length}
function renderNode(c){
 const collapsed=ui.collapsed.has(c.id),mine=c.username===userId(),editable=mine&&Date.now()-new Date(c.created_at).getTime()<=15*60*1000;
 const reactions=EMOJI.map(em=>{const n=cache.reactions.filter(r=>r.targetType==="comment"&&r.targetId===c.id&&r.emoji===em).length,own=cache.reactions.some(r=>r.targetType==="comment"&&r.targetId===c.id&&r.userId===userId()&&r.emoji===em);return '<button class="rh-emoji-reaction '+(own?"active":"")+'" data-social-emoji="'+esc(em)+'" data-social-comment="'+esc(c.id)+'" aria-label="Реакция '+em+'">'+em+' <small>'+n+'</small></button>'}).join("");
 let body=ui.editing===c.id?'<textarea id="rhSocialEdit">'+esc(c.body)+'</textarea><button data-social-saveedit="'+esc(c.id)+'">Сохранить</button><button data-social-canceledit>Отмена</button>':'<p class="rh-comment-body">'+esc(c.body)+'</p>';
 return '<article class="rh-comment" style="--depth:'+Math.min(c.depth,2)+'"><div class="rh-comment-head"><b>'+esc(c.display_name||c.username)+'</b><small>@'+esc(c.username)+' · '+esc(new Date(c.created_at).toLocaleString("ru-RU"))+(c.updated_at?" · изменено":"")+'</small></div>'+body+'<div class="rh-comment-tools"><button data-social-collapse="'+esc(c.id)+'">'+(collapsed?"Развернуть":"Свернуть ветку")+'</button>'+(c.depth<2?'<button data-social-reply="'+esc(c.id)+'">Ответить</button>':"")+(editable?'<button data-social-edit="'+esc(c.id)+'">Изменить</button>':"")+(mine?'<button data-social-delete="'+esc(c.id)+'">Удалить</button>':"")+'</div><div class="rh-comment-reactions">'+reactions+'</div>'+(collapsed?"":c.children.map(renderNode).join(""))+'</article>';
}
function renderComments(){
 const body=$("rhSocialBody"),compose=$("rhSocialCompose");if(!body||!compose)return;
 const roots=treeFor(ui.postId),all=activeComments(ui.postId);
 body.innerHTML='<div class="rh-social-toolbar"><label>Сортировка <select id="rhSocialSort"><option value="new" '+(ui.sort==="new"?"selected":"")+'>Новые</option><option value="old" '+(ui.sort==="old"?"selected":"")+'>Старые</option><option value="popular" '+(ui.sort==="popular"?"selected":"")+'>Популярные</option></select></label><span>'+all.length+' комментариев</span></div>'+(roots.length?roots.map(renderNode).join(""):'<div class="rh-social-empty"><b>Здесь пока тихо</b><span>Оставь первый комментарий и начни обсуждение.</span></div>');
 const parent=ui.replyTo?cache.comments[ui.postId]?.find(c=>c.id===ui.replyTo):null;
 compose.innerHTML=(parent?'<div class="rh-social-replying">Ответ для '+esc(parent.display_name)+' <button data-social-cancelreply>Отмена</button></div>':"")+'<textarea id="rhSocialNew" maxlength="1500" placeholder="'+(parent?"Напиши ответ…":"Напиши комментарий…")+'"></textarea><button class="primary" data-social-send>Отправить</button>';
}
async function openComments(postId){
 if(!userId()){toast("Войди, чтобы участвовать в обсуждении");return}
 try{await refreshCache();ui.postId=String(postId);ui.replyTo=null;ui.editing=null;ui.collapsed.clear();modalShell();renderComments()}catch(e){toast("Не удалось загрузить обсуждение: "+e.message)}
}
async function togglePostLike(postId){
 if(!userId()){toast("Войди, чтобы поставить реакцию");return}
 try{const id="post:"+postId+":"+userId(),existing=cache.reactions.find(r=>r.id===id);if(existing)await remove("reactions",id);else await put("reactions",{id,targetType:"post",targetId:String(postId),userId:userId(),emoji:"❤️",created_at:new Date().toISOString()});await refreshCache();const b=document.querySelector('[data-action="like"][data-id="'+CSS.escape(String(postId))+'"]');if(b){b.classList.remove("rh-reaction-pop");void b.offsetWidth;b.classList.add("rh-reaction-pop")} }catch(e){toast("Не удалось сохранить реакцию. Проверь свободное место в браузере.")}
}
async function sendComment(){
 if(!userId()){toast("Войди, чтобы комментировать");return}
 const field=$("rhSocialNew"),body=field?.value.trim();if(!body)return;
 const parent=ui.replyTo?cache.comments[ui.postId]?.find(c=>c.id===ui.replyTo):null,depth=parent?Math.min(2,(parent.depth||0)+1):0;
 const u=currentUser(),id="c-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
 try{await put("comments",{id,postId:ui.postId,parentId:parent?parent.id:null,depth,body,username:userId(),display_name:u.display_name||u.username,created_at:new Date().toISOString(),status:"approved",deleted:false,reactions:{}});ui.replyTo=null;await refreshCache();renderComments()}catch(e){toast("Не удалось сохранить комментарий в IndexedDB")}
}
async function handleSocialClick(e){
 const b=e.target.closest("[data-action],[data-social-close],[data-social-send],[data-social-reply],[data-social-edit],[data-social-saveedit],[data-social-canceledit],[data-social-delete],[data-social-emoji],[data-social-collapse],[data-social-cancelreply]");
 if(!b)return;
 if(b.dataset.action==="like"&&b.dataset.id){e.preventDefault();e.stopImmediatePropagation();togglePostLike(b.dataset.id);return}
 if(b.dataset.action==="comments"&&b.dataset.id){e.preventDefault();e.stopImmediatePropagation();openComments(b.dataset.id);return}
 if(b.hasAttribute("data-social-close")){if(b.classList.contains("rh-social-backdrop")&&e.target!==b)return;$("modalRoot").innerHTML="";return}
 if(b.hasAttribute("data-social-send")){sendComment();return}
 if(b.dataset.socialReply){ui.replyTo=b.dataset.socialReply;ui.editing=null;renderComments();$("rhSocialNew")?.focus();return}
 if(b.dataset.socialEdit){ui.editing=b.dataset.socialEdit;renderComments();return}
 if(b.dataset.socialCanceledit!==undefined){ui.editing=null;renderComments();return}
 if(b.dataset.socialSaveedit){const c=cache.comments[ui.postId]?.find(x=>x.id===b.dataset.socialSaveedit),body=$("rhSocialEdit")?.value.trim();if(!c||c.username!==userId()||Date.now()-new Date(c.created_at).getTime()>15*60*1000)return toast("Время редактирования истекло");if(!body)return toast("Комментарий не может быть пустым");c.body=body;c.updated_at=new Date().toISOString();try{await put("comments",c);ui.editing=null;await refreshCache();renderComments()}catch(err){toast("Не удалось обновить комментарий")}return}
 if(b.dataset.socialDelete){const c=cache.comments[ui.postId]?.find(x=>x.id===b.dataset.socialDelete);if(!c||c.username!==userId())return toast("Удалять можно только свои комментарии");if(!confirm("Удалить комментарий? Ответы останутся в ветке."))return;c.deleted=true;c.body="";c.deleted_at=new Date().toISOString();try{await put("comments",c);await refreshCache();renderComments()}catch(err){toast("Не удалось удалить комментарий")}return}
 if(b.dataset.socialEmoji){const cId=b.dataset.socialComment,emoji=b.dataset.socialEmoji,uid=userId();if(!uid)return toast("Войди, чтобы реагировать");const id="comment:"+cId+":"+uid+":"+emoji,exists=cache.reactions.find(r=>r.id===id);try{if(exists)await remove("reactions",id);else await put("reactions",{id,targetType:"comment",targetId:cId,userId:uid,emoji,created_at:new Date().toISOString()});await refreshCache();renderComments()}catch(err){toast("Не удалось сохранить реакцию")}return}
 if(b.dataset.socialCollapse){const id=b.dataset.socialCollapse;if(ui.collapsed.has(id))ui.collapsed.delete(id);else ui.collapsed.add(id);renderComments();return}
 if(b.hasAttribute("data-social-cancelreply")){ui.replyTo=null;renderComments();return}
}
function installStorageMirror(){
 try{
  const original=Storage.prototype.setItem;
  if(original.__rhMirror)return;
  const wrapped=function(key,value){const result=original.call(this,key,value);if(this===localStorage&&["rh_local_users","rh_demo_posts"].includes(String(key)))queueMicrotask(()=>mirrorLegacy(String(key),String(value)));return result};
  wrapped.__rhMirror=true;Storage.prototype.setItem=wrapped;
 }catch(e){}
}
async function mirrorLegacy(key,raw){
 try{
  const data=JSON.parse(raw),db=await openDB(),store=key==="rh_local_users"?"users":"posts",tx=db.transaction(store,"readwrite"),os=tx.objectStore(store);
  os.clear();
  if(store==="users")Object.values(data||{}).forEach(u=>{if(u?.username)os.put({...u,id:String(u.username).toLowerCase()})});
  else if(Array.isArray(data))data.forEach(p=>{if(p?.id!=null)os.put(p)});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  await mirrorMedia();
 }catch(e){/* Старый клиентский сценарий продолжает работать даже если зеркало не удалось обновить. */}
}
async function mirrorMedia(){
 try{
  const ps=await all("posts"),us=await all("users"),db=await openDB(),tx=db.transaction("media","readwrite"),os=tx.objectStore("media");
  os.clear();
  ps.forEach(p=>(Array.isArray(p.media)?p.media:[]).forEach((m,i)=>os.put({id:"post:"+p.id+":"+i,postId:String(p.id),kind:"post",...m})));
  us.forEach(u=>{if(u.avatar)os.put({id:"avatar:"+u.id,owner:u.id,kind:"avatar",url:u.avatar,mime:"image/*"})});
 }catch(e){}
}
function watchFeed(){const root=$("pageContent");if(!root)return;new MutationObserver(()=>refreshVisible()).observe(root,{childList:true,subtree:true})}
async function init(){
 try{await openDB();await migrate();await refreshCache();installStorageMirror();await mirrorMedia();watchFeed()}catch(e){cache.ready=false;console.warn("RH Social IndexedDB:",e);toast("IndexedDB недоступна: комментарии и реакции временно не загружены.")}
 document.addEventListener("click",handleSocialClick,true);
 document.addEventListener("change",e=>{if(e.target.id==="rhSocialSort"){ui.sort=e.target.value;renderComments()}});
}
async function moderateComment(id,status){const list=await all("comments"),item=list.find(c=>c.id===id);if(!item)throw Error("Комментарий не найден");item.status=status;item.moderated_at=new Date().toISOString();item.moderated_by="admin";if(status==="deleted"){item.deleted=true;item.body=""}await put("comments",item);await refreshCache();return item}
async function removeMediaRecord(id){await remove("media",id);return true}
window.RHSocial={openDB,refreshCache,listComments:()=>all("comments"),listReactions:()=>all("reactions"),listMedia:()=>all("media"),removeMediaRecord,moderateComment,get commentsCache(){return cache.comments},get ready(){return cache.ready}};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();