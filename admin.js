/* RH Admin Workspace — локальная административная панель */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const KEYS={users:"rh_local_users",posts:"rh_demo_posts",comments:"rh_local_comments",likes:"rh_demo_likes",videos:"rh_demo_videos",hidden:"rh_admin_hidden_posts",settings:"rh_admin_settings"};
const state={section:"dashboard",query:"",status:"all",sort:"new",page:1,selected:new Set(),period:7,theme:"dark"};
const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||"null");return v===null?fallback:v}catch(e){return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){notify("Не удалось сохранить изменения: хранилище браузера заполнено.");return false}};
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const session=()=>{const name=localStorage.getItem("rh_local_session")||"",users=read(KEYS.users,{}),user=users[name.toLowerCase()];return user&&user.status!=="banned"?user:null};
const isAdmin=()=>{const u=session();return !!u&&(u.role==="admin"||String(u.username).toLowerCase()==="raher")};
const notify=s=>{const t=$("toast");if(t){t.textContent=s;t.classList.add("show");clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove("show"),2600)}};
const posts=()=>read(KEYS.posts,[]).filter(x=>x&&typeof x==="object");
const comments=()=>read(KEYS.comments,{});
const users=()=>read(KEYS.users,{});
const hidden=()=>read(KEYS.hidden,[]);
const settings=()=>Object.assign({siteName:"RH Media",description:"Сообщество RH",uploadLimit:10,registrationOpen:true,commentsEnabled:true},read(KEYS.settings,{}));
const stamp=d=>{try{return new Date(d).toLocaleString("ru-RU",{day:"2-digit",month:"short",year:"numeric"})}catch(e){return "—"}};
const agoDays=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-n);return d};
function navLink(id,label,icon){return '<button type="button" class="rh-admin-navitem '+(state.section===id?"active":"")+'" data-admin-section="'+id+'"><span aria-hidden="true">'+icon+'</span><b>'+label+'</b></button>'}
function ensureNav(){
 const nav=document.querySelector(".side-nav");if(!nav||$("rhAdminNav"))return;
 const a=document.createElement("a");a.id="rhAdminNav";a.href="#/admin";a.dataset.route="admin";a.innerHTML="⚙ Администрирование";a.hidden=!isAdmin();nav.appendChild(a);
}
function applySiteSettings(){const s=settings();document.title=(s.siteName||"RH Media")+" — сообщество";const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=s.description||"Медиаплатформа RH Media"}
function render(){
 applySiteSettings();
 ensureNav();
 const link=$("rhAdminNav");if(link)link.hidden=!isAdmin();
 if(location.hash.replace(/^#\/?/,"").split("/")[0]!=="admin")return;
 if(!isAdmin()){const title=$("pageTitle"),content=$("pageContent");if(title)title.innerHTML='<div><div class="eyebrow">RH MEDIA</div><h1>Доступ закрыт</h1><p>Административный раздел доступен только роли admin.</p></div>';if(content)content.innerHTML='<section class="rh-admin-denied"><b>Недостаточно прав</b><p>Войди в аккаунт с ролью администратора.</p><a href="#/">Вернуться на главную</a></section>';return}
 const title=$("pageTitle"),content=$("pageContent");if(!title||!content)return;
 title.innerHTML='<div class="rh-admin-heading"><div><div class="eyebrow">RH CONTROL CENTER</div><h1>Администрирование</h1><p>Управление локальным пространством RH Media</p></div><button type="button" class="rh-admin-theme" data-admin-theme>◐ '+(state.theme==="dark"?"Тёмная тема":"Светлая тема")+'</button></div>';
 content.innerHTML='<div class="rh-admin-shell '+(state.theme==="light"?"theme-light":"")+'"><aside class="rh-admin-rail"><div class="rh-admin-rail-title">WORKSPACE</div>'+navLink("dashboard","Дашборд","◫")+navLink("posts","Публикации","▤")+navLink("comments","Комментарии","▧")+navLink("users","Пользователи","♙")+navLink("media","Медиа","▧")+navLink("settings","Настройки","⚙")+'<div class="rh-admin-rail-foot"><span class="rh-admin-status-dot"></span> Локальная панель</div></aside><section class="rh-admin-main" id="rhAdminMain">'+sectionHtml()+'</section></div>';
}
function stat(label,value,icon,sub){return '<article class="rh-admin-stat"><span class="rh-admin-stat-icon">'+icon+'</span><small>'+label+'</small><strong>'+value+'</strong><em>'+sub+'</em></article>'}
function activity(days){
 const p=posts(),legacy=Object.values(comments()).flat().filter(x=>x&&typeof x==="object"),indexed=window.RHSocial?.commentsCache,indexedList=indexed?Object.values(indexed).flat():[],c=indexedList.length?indexedList.filter(x=>!x.deleted&&x.status!=="deleted"):legacy,labels=[],pv=[],cv=[];
 for(let i=days-1;i>=0;i--){const d=agoDays(i),key=d.toDateString();labels.push(d.toLocaleDateString("ru-RU",{day:"numeric",month:"short"}));pv.push(p.filter(x=>x.created_at&&new Date(x.created_at).toDateString()===key).length);cv.push(c.filter(x=>x.created_at&&new Date(x.created_at).toDateString()===key).length)}
 const max=Math.max(1,...pv,...cv),w=700,h=210,pad=24,step=(w-pad*2)/Math.max(1,days-1);
 const points=values=>values.map((v,i)=>(pad+i*step)+","+(h-pad-(v/max)*(h-pad*2))).join(" ");
 return '<div class="rh-admin-chart-head"><div><h3>Активность</h3><p>Публикации и комментарии за период</p></div><div class="rh-admin-period"><button data-admin-period="7" class="'+(days===7?"active":"")+'">7 дней</button><button data-admin-period="30" class="'+(days===30?"active":"")+'">30 дней</button></div></div><svg class="rh-admin-chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="График публикаций и комментариев"><polyline points="'+points(pv)+'" fill="none" stroke="#9b8cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+points(cv)+'" fill="none" stroke="#35c79a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="rh-admin-chart-legend"><span><i class="posts"></i>Публикации</span><span><i class="comments"></i>Комментарии</span></div><div class="rh-admin-chart-labels">'+labels.map(x=>'<span>'+esc(x)+'</span>').join("")+'</div>';
}
function dashboard(){
 const p=posts(),legacyComments=Object.values(comments()).flat().filter(x=>x&&typeof x==="object"),indexedComments=window.RHSocial?.commentsCache?Object.values(window.RHSocial.commentsCache).flat():[],c=indexedComments.length?indexedComments:legacyComments,u=Object.values(users()),l=read(KEYS.likes,{});
 const indexedReactions=window.RHSocial?.reactionsCache,likes=indexedReactions?indexedReactions.filter(x=>x.targetType==="post").length:Object.values(l).reduce((n,x)=>n+(Array.isArray(x)?x.length:(x&&Array.isArray(x.users)?x.users.length:0)),0);
 return '<div class="rh-admin-stats">'+stat("Публикации",p.length,"▤","В локальной ленте")+stat("Комментарии",c.filter(x=>x.status!=="deleted").length,"▧","Во всех обсуждениях")+stat("Реакции",likes,"♥","Реакции публикаций")+stat("Пользователи",u.length,"♙","Локальные аккаунты")+'</div><article class="rh-admin-card">'+activity(state.period)+'</article><div class="rh-admin-two"><article class="rh-admin-card"><h3>Последние публикации</h3>'+((p.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5).map(x=>'<div class="rh-admin-minirow"><span class="rh-admin-avatar">'+esc((x.user?.display_name||x.user?.username||"У").slice(0,1).toUpperCase())+'</span><div><b>'+esc(x.user?.display_name||x.user?.username||"Участник")+'</b><small>'+esc((x.caption||"Без текста").slice(0,70))+'</small></div><time>'+stamp(x.created_at)+'</time></div>').join(""))||'<p class="rh-admin-empty">Публикаций пока нет.</p>')+'</article><article class="rh-admin-card"><h3>Состояние пространства</h3><div class="rh-admin-settingline"><span>Регистрация</span><b>'+(settings().registrationOpen?"Открыта":"Закрыта")+'</b></div><div class="rh-admin-settingline"><span>Комментарии</span><b>'+(settings().commentsEnabled?"Включены":"Выключены")+'</b></div><div class="rh-admin-settingline"><span>Лимит загрузки</span><b>'+settings().uploadLimit+' МБ</b></div><p class="rh-admin-note">Показатели относятся к данным этого браузера. Между посетителями они не синхронизируются.</p></article></div>';
}
function postRows(){
 const hiddenIds=hidden(),q=state.query.toLowerCase();
 let rows=posts().filter(p=>(!q||String(p.caption||"").toLowerCase().includes(q)||String(p.user?.username||"").toLowerCase().includes(q))&&(state.status==="all"||(state.status==="hidden"?hiddenIds.includes(p.id):!hiddenIds.includes(p.id))));
 rows.sort((a,b)=>state.sort==="old"?new Date(a.created_at)-new Date(b.created_at):new Date(b.created_at)-new Date(a.created_at));
 const pages=Math.max(1,Math.ceil(rows.length/10));state.page=Math.min(state.page,pages);const slice=rows.slice((state.page-1)*10,state.page*10);
 return '<div class="rh-admin-toolbar"><input id="rhAdminSearch" type="search" placeholder="Поиск по тексту или автору…" value="'+esc(state.query)+'"><select id="rhAdminStatus"><option value="all" '+(state.status==="all"?"selected":"")+'>Все статусы</option><option value="visible" '+(state.status==="visible"?"selected":"")+'>Видимые</option><option value="hidden" '+(state.status==="hidden"?"selected":"")+'>Скрытые</option></select><select id="rhAdminSort"><option value="new" '+(state.sort==="new"?"selected":"")+'>Сначала новые</option><option value="old" '+(state.sort==="old"?"selected":"")+'>Сначала старые</option></select></div><div class="rh-admin-bulk"><label><input type="checkbox" data-admin-select-all> Выбрать страницу</label><button data-admin-bulk="hide" '+(!state.selected.size?"disabled":"")+'>Скрыть выбранное</button><button data-admin-bulk="delete" class="danger" '+(!state.selected.size?"disabled":"")+'>Удалить выбранное</button></div><div class="rh-admin-tablewrap"><table class="rh-admin-table"><thead><tr><th></th><th>Публикация</th><th>Автор</th><th>Дата</th><th>Статус</th><th>Действия</th></tr></thead><tbody>'+slice.map(p=>'<tr><td><input type="checkbox" data-admin-select="'+esc(p.id)+'" '+(state.selected.has(String(p.id))?"checked":"")+'></td><td><div class="rh-admin-posttext" data-admin-preview="'+esc(p.id)+'">'+esc((p.caption||"Без текста").slice(0,110))+'</div><div class="rh-admin-inline" id="rhEdit-'+esc(p.id)+'" hidden><textarea maxlength="5000">'+esc(p.caption||"")+'</textarea><button data-admin-savepost="'+esc(p.id)+'">Сохранить</button><button data-admin-cancelpost="'+esc(p.id)+'">Отмена</button></div></td><td>@'+esc(p.user?.username||"user")+'</td><td>'+stamp(p.created_at)+'</td><td><span class="rh-admin-pill '+(hiddenIds.includes(p.id)?"muted":"ok")+'">'+(hiddenIds.includes(p.id)?"Скрыта":"Видна")+'</span></td><td><div class="rh-admin-actions"><button data-admin-editpost="'+esc(p.id)+'">Изменить</button><button data-admin-hidepost="'+esc(p.id)+'">'+(hiddenIds.includes(p.id)?"Показать":"Скрыть")+'</button><button class="danger" data-admin-deletepost="'+esc(p.id)+'">Удалить</button></div></td></tr>').join("")||'<tr><td colspan="6"><p class="rh-admin-empty">Публикации не найдены.</p></td></tr>'+'</tbody></table></div><div class="rh-admin-pagination"><span>Страница '+state.page+' из '+pages+' · '+rows.length+' публикаций</span><div><button data-admin-page="-1" '+(state.page<=1?"disabled":"")+'>Назад</button><button data-admin-page="1" '+(state.page>=pages?"disabled":"")+'>Далее</button></div></div>';
}
function commentsRows(){
 const all=comments(),indexed=window.RHSocial?.commentsCache,source=indexed&&Object.keys(indexed).length?indexed:all,items=Object.entries(source).flatMap(([postId,list])=>(Array.isArray(list)?list:[]).map((c,index)=>({...c,postId,index}))),q=state.query.toLowerCase();
 const filtered=items.filter(c=>c.status!=="deleted"&&(state.status==="all"||((c.status||"approved")===state.status))&&(!q||String(c.body||"").toLowerCase().includes(q)||String(c.username||"").toLowerCase().includes(q)));
 return '<div class="rh-admin-toolbar"><input id="rhAdminSearch" type="search" placeholder="Поиск по тексту или автору…" value="'+esc(state.query)+'"><select id="rhAdminStatus"><option value="all">Все статусы</option><option value="approved" '+(state.status==="approved"?"selected":"")+'>Одобрены</option><option value="pending" '+(state.status==="pending"?"selected":"")+'>На проверке</option><option value="rejected" '+(state.status==="rejected"?"selected":"")+'>Отклонены</option></select></div><div class="rh-admin-tablewrap"><table class="rh-admin-table"><thead><tr><th>Комментарий</th><th>Автор</th><th>Публикация</th><th>Статус</th><th>Модерация</th></tr></thead><tbody>'+filtered.map(c=>'<tr><td class="rh-admin-comment">'+esc(c.body||"Комментарий удалён")+'</td><td>@'+esc(c.username||"user")+'</td><td>'+esc(c.postId)+'</td><td><span class="rh-admin-pill '+((c.status||"approved")==="approved"?"ok":"muted")+'">'+esc(c.status||"approved")+'</span></td><td><div class="rh-admin-actions"><button data-admin-comment="'+esc(c.postId)+'" data-admin-index="'+c.index+'" data-admin-commentstatus="approved">Одобрить</button><button data-admin-comment="'+esc(c.postId)+'" data-admin-index="'+c.index+'" data-admin-commentstatus="rejected">Отклонить</button><button class="danger" data-admin-comment="'+esc(c.postId)+'" data-admin-index="'+c.index+'" data-admin-commentstatus="deleted">Удалить</button></div></td></tr>').join("")||'<tr><td colspan="5"><p class="rh-admin-empty">Комментарии не найдены.</p></td></tr>'+'</tbody></table></div><p class="rh-admin-note">Удаление комментария мягкое: запись остаётся в хранилище с пометкой deleted.</p>';
}
function usersRows(){
 const list=Object.values(users()).filter(u=>!state.query||String(u.username).toLowerCase().includes(state.query.toLowerCase())||String(u.display_name||"").toLowerCase().includes(state.query.toLowerCase()));
 return '<div class="rh-admin-toolbar"><input id="rhAdminSearch" type="search" placeholder="Поиск пользователя…" value="'+esc(state.query)+'"></div><div class="rh-admin-tablewrap"><table class="rh-admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>Статус</th><th>Действия</th></tr></thead><tbody>'+list.map(u=>'<tr><td><b>'+esc(u.display_name||u.username)+'</b><small class="rh-admin-sub">@'+esc(u.username)+'</small></td><td><select data-admin-role="'+esc(u.username)+'" '+(u.username.toLowerCase()==="raher"?"disabled":"")+'><option value="user" '+((u.role||"user")==="user"?"selected":"")+'>user</option><option value="moderator" '+(u.role==="moderator"?"selected":"")+'>moderator</option><option value="admin" '+(u.role==="admin"?"selected":"")+'>admin</option></select></td><td><span class="rh-admin-pill '+(u.status==="banned"?"muted":"ok")+'">'+(u.status==="banned"?"Заблокирован":"Активен")+'</span></td><td><button data-admin-ban="'+esc(u.username)+'" '+(u.username.toLowerCase()==="raher"?"disabled":"")+'>'+(u.status==="banned"?"Разбанить":"Заблокировать")+'</button></td></tr>').join("")||'<tr><td colspan="4"><p class="rh-admin-empty">Пользователи не найдены.</p></td></tr>'+'</tbody></table></div><p class="rh-admin-note">Главный аккаунт Raher защищён от смены роли и блокировки. Локальные роли не заменяют серверную авторизацию.</p>';
}
function mediaGrid(){
 const list=[];posts().forEach(p=>(Array.isArray(p.media)?p.media:[]).forEach((m,i)=>list.push({kind:"post",post:p.id,index:i,url:m.url,name:m.name||"Файл",mime:m.mime||""})));
 Object.values(users()).forEach(u=>{if(u.avatar)list.push({kind:"avatar",username:u.username,url:u.avatar,name:"Аватар · "+u.username,mime:"image/*"})});
 return '<div class="rh-admin-media-grid">'+list.map((m,i)=>'<article class="rh-admin-media">'+((m.mime||"").startsWith("image/")||m.kind==="avatar"?'<img src="'+esc(m.url)+'" alt="">':'<div class="rh-admin-file">▧</div>')+'<b>'+esc(m.name)+'</b><small>'+esc(m.mime||"Файл")+'</small><div><button data-admin-copy="'+i+'">Копировать ссылку</button><button class="danger" data-admin-removemedia="'+i+'">Удалить</button></div></article>').join("")||'<p class="rh-admin-empty">Медиафайлов пока нет.</p>'+'</div><p class="rh-admin-note">Показаны вложения публикаций и аватары локальных пользователей. Ссылки Data URL могут быть большими.</p>';
}
function settingsForm(){
 const s=settings();return '<form id="rhAdminSettings" class="rh-admin-settings"><label>Название сайта<input name="siteName" maxlength="60" value="'+esc(s.siteName)+'"></label><label>Описание<input name="description" maxlength="180" value="'+esc(s.description)+'"></label><label>Лимит загрузки (МБ)<input name="uploadLimit" type="number" min="1" max="100" value="'+Number(s.uploadLimit||10)+'"></label><label class="rh-admin-toggle"><span><b>Регистрация открыта</b><small>Разрешить новые локальные регистрации</small></span><input name="registrationOpen" type="checkbox" '+(s.registrationOpen?"checked":"")+'></label><label class="rh-admin-toggle"><span><b>Комментарии включены</b><small>Разрешить создание комментариев</small></span><input name="commentsEnabled" type="checkbox" '+(s.commentsEnabled?"checked":"")+'></label><button class="primary" type="submit">Сохранить настройки</button></form><p class="rh-admin-note">Настройки сохраняются локально в этом браузере. Закрытие регистрации и комментариев применяется в клиентском интерфейсе; лимит загрузки применяется к публикациям. Для общего действия на всех устройствах потребуется серверная настройка.</p>';
}
function sectionHtml(){
 const title={dashboard:"Обзор пространства",posts:"Управление публикациями",comments:"Модерация комментариев",users:"Пользователи и доступ",media:"Медиатека",settings:"Настройки платформы"}[state.section];
 const body=state.section==="dashboard"?dashboard():state.section==="posts"?postRows():state.section==="comments"?commentsRows():state.section==="users"?usersRows():state.section==="media"?mediaGrid():settingsForm();
 return '<div class="rh-admin-section-head"><div><h2>'+title+'</h2><p>Изменения сохраняются локально в текущем браузере</p></div></div>'+body;
}
function refresh(){const root=$("rhAdminMain");if(root)root.innerHTML=sectionHtml();document.querySelectorAll("[data-admin-section]").forEach(x=>x.classList.toggle("active",x.dataset.adminSection===state.section))}
async function mutateComments(postId,index,status){
 if(!isAdmin())return;
 const indexed=window.RHSocial?.commentsCache?.[String(postId)];
 const item=indexed?.[index];
 if(item&&window.RHSocial?.moderateComment){try{await window.RHSocial.moderateComment(item.id,status);refresh();notify(status==="deleted"?"Комментарий помечен удалённым":"Статус комментария обновлён");return}catch(e){return notify("Не удалось обновить комментарий в IndexedDB")}}
 const all=comments(),list=all[postId];if(!Array.isArray(list)||!list[index])return notify("Комментарий не найден");
 list[index].status=status;list[index].moderated_at=new Date().toISOString();list[index].moderated_by="admin";
 if(write(KEYS.comments,all)){refresh();notify(status==="deleted"?"Комментарий помечен удалённым":"Статус комментария обновлён")}
}
async function cleanupDeletedPosts(ids){
 if(!window.RHSocial?.deletePostData)return;
 for(const id of ids)await window.RHSocial.deletePostData(String(id));
}
async function deletePost(id){
 if(!isAdmin()||!confirm("Удалить публикацию и связанные комментарии и реакции?"))return;
 const list=posts().filter(p=>String(p.id)!==String(id)),c=comments(),l=read(KEYS.likes,{});delete c[id];delete l[id];
 if(!write(KEYS.posts,list)||!write(KEYS.comments,c)||!write(KEYS.likes,l))return;
 state.selected.delete(String(id));
 try{await cleanupDeletedPosts([id]);refresh();notify("Публикация и связанные комментарии удалены")}
 catch(e){refresh();notify("Публикация удалена, но часть старых реакций не удалось очистить")}
}
async function bulk(action){
 if(!isAdmin()||!state.selected.size)return;
 const ids=[...state.selected],list=posts(),hiddenIds=hidden();
 if(action==="delete"&&!confirm("Удалить выбранные публикации?"))return;
 if(action==="delete"){
  const keep=list.filter(p=>!ids.includes(String(p.id))),c=comments(),l=read(KEYS.likes,{});
  ids.forEach(id=>{delete c[id];delete l[id]});
  if(!write(KEYS.posts,keep)||!write(KEYS.comments,c)||!write(KEYS.likes,l))return;
  try{await cleanupDeletedPosts(ids);state.selected.clear();refresh();notify("Выбранные публикации и связанные данные удалены")}
  catch(e){state.selected.clear();refresh();notify("Публикации удалены, но часть связанных данных не удалось очистить")}
 }else{
  const next=[...new Set([...hiddenIds,...ids])];if(!write(KEYS.hidden,next))return;
  state.selected.clear();refresh();notify("Выбранные публикации скрыты")
 }
}
function onClick(e){
 const b=e.target.closest("button,[data-admin-preview]");if(!b)return;
 if(b.hasAttribute("data-admin-preview")){const id=b.dataset.adminPreview,box=$("rhEdit-"+CSS.escape(id));if(box)box.hidden=!box.hidden;return}
 if(b.dataset.adminSection){state.section=b.dataset.adminSection;state.query="";state.page=1;refresh();return}
 if(b.hasAttribute("data-admin-theme")){state.theme=state.theme==="dark"?"light":"dark";refresh();return}
 if(b.dataset.adminPeriod){state.period=Number(b.dataset.adminPeriod);refresh();return}
 if(b.dataset.adminPage){state.page=Math.max(1,state.page+Number(b.dataset.adminPage));refresh();return}
 if(b.dataset.adminBulk){bulk(b.dataset.adminBulk);return}
 if(b.dataset.adminEditpost){const box=$("rhEdit-"+CSS.escape(b.dataset.adminEditpost));if(box)box.hidden=false;return}
 if(b.dataset.adminCancelpost){const box=$("rhEdit-"+CSS.escape(b.dataset.adminCancelpost));if(box)box.hidden=true;return}
 if(b.dataset.adminSavepost){if(!isAdmin())return;const p=posts().find(x=>String(x.id)===String(b.dataset.adminSavepost)),box=$("rhEdit-"+CSS.escape(b.dataset.adminSavepost));if(!p||!box)return;p.caption=box.querySelector("textarea").value.trim();if(write(KEYS.posts,posts())){refresh();notify("Публикация обновлена")}return}
 if(b.dataset.adminHidepost){if(!isAdmin())return;const id=String(b.dataset.adminHidepost),arr=hidden(),next=arr.includes(id)?arr.filter(x=>x!==id):[...arr,id];if(write(KEYS.hidden,next))refresh();return}
 if(b.dataset.adminDeletepost){deletePost(b.dataset.adminDeletepost);return}
 if(b.dataset.adminComment){mutateComments(b.dataset.adminComment,Number(b.dataset.adminIndex),b.dataset.adminCommentstatus);return}
 if(b.dataset.adminBan){if(!isAdmin())return;const us=users(),u=us[b.dataset.adminBan.toLowerCase()];if(!u||u.username.toLowerCase()==="raher")return;u.status=u.status==="banned"?"active":"banned";if(write(KEYS.users,us)){refresh();notify(u.status==="banned"?"Пользователь заблокирован":"Пользователь разблокирован")}return}
 if(b.dataset.adminCopy!==undefined){const item=mediaGridItems()[Number(b.dataset.adminCopy)];if(item)copyText(item.url);return}
 if(b.dataset.adminRemovemedia!==undefined){removeMedia(Number(b.dataset.adminRemovemedia));return}
}
function mediaGridItems(){const list=[];posts().forEach(p=>(Array.isArray(p.media)?p.media:[]).forEach((m,i)=>list.push({kind:"post",post:p.id,index:i,url:m.url})));Object.values(users()).forEach(u=>{if(u.avatar)list.push({kind:"avatar",username:u.username,url:u.avatar})});return list}
async function copyText(value){try{await navigator.clipboard.writeText(value);notify("Ссылка скопирована")}catch(e){notify("Браузер не разрешил копирование ссылки")}}
function removeMedia(index){if(!isAdmin()||!confirm("Удалить выбранный файл?"))return;const item=mediaGridItems()[index];if(!item)return;
 if(item.kind==="post"){const list=posts(),p=list.find(x=>String(x.id)===String(item.post));if(p){p.media.splice(item.index,1);if(write(KEYS.posts,list)){refresh();notify("Файл удалён")}}}
 else{const us=users(),u=us[item.username.toLowerCase()];if(u){u.avatar="";if(write(KEYS.users,us)){refresh();notify("Аватар удалён")}}}
}
function onInput(e){if(e.target.id==="rhAdminSearch"){state.query=e.target.value;state.page=1;const pos=e.target.selectionStart;refresh();const field=$("rhAdminSearch");if(field){field.focus();field.setSelectionRange(pos,pos)}}}
function onChange(e){
 if(e.target.id==="rhAdminStatus"){state.status=e.target.value;state.page=1;refresh()}
 if(e.target.id==="rhAdminSort"){state.sort=e.target.value;state.page=1;refresh()}
 if(e.target.hasAttribute("data-admin-select")){const id=String(e.target.dataset.adminSelect);if(e.target.checked)state.selected.add(id);else state.selected.delete(id);refresh()}
 if(e.target.hasAttribute("data-admin-select-all")){document.querySelectorAll("[data-admin-select]").forEach(x=>{x.checked=e.target.checked;const id=String(x.dataset.adminSelect);if(e.target.checked)state.selected.add(id);else state.selected.delete(id)});refresh()}
 if(e.target.hasAttribute("data-admin-role")){if(!isAdmin())return;const us=users(),u=us[e.target.dataset.adminRole.toLowerCase()];if(!u||u.username.toLowerCase()==="raher")return;u.role=e.target.value;if(write(KEYS.users,us)){refresh();notify("Роль пользователя изменена")}}
}
function onSubmit(e){if(e.target.id!=="rhAdminSettings")return;e.preventDefault();if(!isAdmin())return;const f=new FormData(e.target),s={siteName:String(f.get("siteName")||"RH Media").trim(),description:String(f.get("description")||"").trim(),uploadLimit:Math.max(1,Math.min(100,Number(f.get("uploadLimit")||10))),registrationOpen:e.target.elements.registrationOpen.checked,commentsEnabled:e.target.elements.commentsEnabled.checked};if(write(KEYS.settings,s)){applySiteSettings();refresh();notify("Настройки сохранены")}}
function start(){
 ensureNav();
 document.addEventListener("click",e=>{
  const action=e.target.closest('[data-action="admin"]');
  if(action){e.preventDefault();e.stopImmediatePropagation();location.hash="#/admin";setTimeout(render,0)}
 },true);
 document.addEventListener("click",e=>{if($("rhAdminMain")&&$("rhAdminMain").contains(e.target))onClick(e)});
 document.addEventListener("input",e=>{if($("rhAdminMain")&&$("rhAdminMain").contains(e.target))onInput(e)});
 document.addEventListener("change",e=>{if($("rhAdminMain")&&$("rhAdminMain").contains(e.target))onChange(e)});
 document.addEventListener("submit",e=>{if($("rhAdminMain")&&$("rhAdminMain").contains(e.target))onSubmit(e)});
 window.addEventListener("hashchange",()=>setTimeout(render,0));
 document.addEventListener("rh-social-ready",()=>{if(location.hash.slice(2).split("/")[0]==="admin")refresh()});
 const observer=new MutationObserver(()=>{const link=$("rhAdminNav");if(link)link.hidden=!isAdmin()});
 if($("topActions"))observer.observe($("topActions"),{childList:true,subtree:true});
 render();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();

/* RH Control Center extension: owner controls, account editing, visual identity and audit */
(function(){
"use strict";
const USER_KEY="rh_local_users",POST_KEY="rh_demo_posts",COMMENT_KEY="rh_local_comments",LIKE_KEY="rh_demo_likes",MSG_KEY="rh_local_messages",FOLLOW_KEY="rh_follow_graph",SET_KEY="rh_admin_settings",AUDIT_KEY="rh_admin_audit";
const read=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k)||"null");return v==null?d:v}catch(e){return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){alert("Не удалось сохранить: память браузера заполнена.");return false}};
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const current=()=>{const n=localStorage.getItem("rh_local_session")||"",u=read(USER_KEY,{});return u[n.toLowerCase()]||null};
const owner=()=>String(current()?.username||"").toLowerCase()==="raher";
const log=(action,target,details)=>{const a=read(AUDIT_KEY,[]);a.unshift({actor:current()?.username||"?",action,target:String(target||""),details:String(details||""),created_at:new Date().toISOString()});save(AUDIT_KEY,a.slice(0,300))};
function applyBrand(){const s=read(SET_KEY,{}),r=document.documentElement;if(s.accentColor)r.style.setProperty("--accent",s.accentColor);if(s.pageBackground)r.style.setProperty("--bg",s.pageBackground);if(s.panelColor)r.style.setProperty("--panel",s.panelColor);if(s.siteName){document.title=s.siteName+" — сообщество";const m=document.querySelector('meta[name="description"]');if(m&&s.description)m.content=s.description}}
function badge(el,role){if(!el||el.querySelector(".rh-role-badge"))return;const names={owner:["OWNER","owner"],admin:["ADMIN","admin"],moderator:["MOD","moderator"]};const item=names[role];if(!item)return;const b=document.createElement("span");b.className="rh-role-badge rh-role-"+item[1];b.textContent=item[0];el.appendChild(b)}
function decorate(){applyBrand();const u=current();if(u&&owner()){document.querySelectorAll("#topActions [data-user],#sideUser,.profile-name").forEach(el=>badge(el,"owner"))}
document.querySelectorAll(".post-author").forEach(el=>{const small=el.querySelector("small"),m=small&&small.textContent.match(/@([a-zA-Z0-9_.-]+)/);if(m){const x=read(USER_KEY,{})[m[1].toLowerCase()];if(x)badge(el.querySelector("b"),String(x.username).toLowerCase()==="raher"?"owner":x.role)}})
document.querySelectorAll(".person-meta").forEach(el=>{const m=(el.querySelector("small")?.textContent||"").match(/@([a-zA-Z0-9_.-]+)/);if(m){const x=read(USER_KEY,{})[m[1].toLowerCase()];if(x)badge(el.querySelector("b"),String(x.username).toLowerCase()==="raher"?"owner":x.role)}})
}
function addUserTools(){if(!owner()||location.hash.replace(/^#\/?/,"").split("/")[0]!=="admin")return;const table=document.querySelector("#rhAdminMain .rh-admin-table");if(!table||table.dataset.ownerTools)return;table.dataset.ownerTools="1";table.querySelectorAll("tbody tr").forEach(tr=>{const select=tr.querySelector("[data-admin-role]");if(!select)return;const username=select.dataset.adminRole;if(username.toLowerCase()==="raher")return;const cell=tr.lastElementChild;if(!cell)return;const wrap=cell.querySelector(".rh-admin-actions")||cell;const edit=document.createElement("button");edit.textContent="Имя";edit.dataset.ownerEdit=username;const perms=document.createElement("button");perms.textContent="Права";perms.dataset.ownerPerms=username;const del=document.createElement("button");del.textContent="Удалить";del.className="danger";del.dataset.ownerDelete=username;wrap.append(edit,perms,del)})}
function addSettings(){if(!owner()||location.hash.replace(/^#\/?/,"").split("/")[0]!=="admin")return;const form=document.getElementById("rhAdminSettings");if(!form||form.dataset.visualTools)return;form.dataset.visualTools="1";const s=read(SET_KEY,{});[["accentColor","Акцентный цвет",s.accentColor||"#9b8cff"],["pageBackground","Фон сайта",s.pageBackground||"#171717"],["panelColor","Цвет панелей",s.panelColor||"#202334"]].forEach(([name,label,value])=>{const l=document.createElement("label");l.textContent=label;const i=document.createElement("input");i.type="color";i.name=name;i.value=value;l.append(i);form.insertBefore(l,form.querySelector("button[type=submit]"))})}
function handle(e){const b=e.target.closest("[data-owner-edit],[data-owner-perms],[data-owner-delete]");if(!b||!owner())return;const name=b.dataset.ownerEdit||b.dataset.ownerPerms||b.dataset.ownerDelete,users=read(USER_KEY,{}),u=users[name.toLowerCase()];if(!u)return;
if(b.dataset.ownerEdit){const value=prompt("Новое отображаемое имя:",u.display_name||u.username);if(value===null)return;const clean=value.trim().slice(0,32);if(!clean)return alert("Имя не может быть пустым.");u.display_name=clean;if(save(USER_KEY,users)){log("Изменено имя",name,clean);alert("Имя обновлено.");location.reload()}}
if(b.dataset.ownerPerms){const options=["users.manage","posts.manage","comments.manage","media.manage","settings.manage","roles.manage","videos.manage"];const current=(u.permissions||[]).join(", ");const value=prompt("Разрешения через запятую:\n"+options.join(", ")+"\n\nОставь пустым, чтобы использовать стандартные права роли.",current);if(value===null)return;u.permissions=value.trim()?value.split(",").map(x=>x.trim()).filter(x=>options.includes(x)):undefined;if(save(USER_KEY,users)){log("Изменены разрешения",name,(u.permissions||[]).join(", ")||"стандартные");alert("Права сохранены.");location.reload()}}
if(b.dataset.ownerDelete){if(!confirm("Удалить аккаунт @"+name+" и связанные локальные данные?"))return;delete users[name.toLowerCase()];const posts=read(POST_KEY,[]).filter(p=>String(p.user?.username||"").toLowerCase()!==name.toLowerCase());const comments=read(COMMENT_KEY,{}),likes=read(LIKE_KEY,{});posts.forEach(p=>{delete comments[p.id];delete likes[p.id]});const messages=read(MSG_KEY,[]).filter(m=>String(m.from||"").toLowerCase()!==name.toLowerCase()&&String(m.to||"").toLowerCase()!==name.toLowerCase());const graph=read(FOLLOW_KEY,{});delete graph[name.toLowerCase()];Object.keys(graph).forEach(k=>{if(Array.isArray(graph[k]))graph[k]=graph[k].filter(x=>String(x).toLowerCase()!==name.toLowerCase())});if(!save(USER_KEY,users)||!save(POST_KEY,posts)||!save(COMMENT_KEY,comments)||!save(LIKE_KEY,likes)||!save(MSG_KEY,messages)||!save(FOLLOW_KEY,graph))return;log("Удалён пользователь",name,"аккаунт и связанные данные");location.reload()}}
}
document.addEventListener("click",handle);
function addAudit(){if(!owner()||location.hash.replace(/^#\/?/,"").split("/")[0]!=="admin")return;const nav=document.querySelector(".rh-admin-rail");if(nav&&!nav.querySelector('[data-owner-audit]')){const b=document.createElement("button");b.className="rh-admin-navitem";b.dataset.ownerAudit="1";b.innerHTML="<span>◷</span><b>Журнал действий</b>";nav.insertBefore(b,nav.querySelector(".rh-admin-rail-foot"))}const b=document.querySelector("[data-owner-audit]");if(b)b.onclick=()=>{const root=document.getElementById("rhAdminMain");if(!root)return;const rows=read(AUDIT_KEY,[]);root.innerHTML='<div class="rh-admin-section-head"><div><h2>Журнал действий</h2><p>Последние 300 административных операций</p></div></div><div class="rh-admin-tablewrap"><table class="rh-admin-table"><thead><tr><th>Дата</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробности</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString("ru-RU"))+'</td><td>@'+esc(x.actor)+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.target)+'</td><td>'+esc(x.details)+'</td></tr>').join("")+'</tbody></table></div>'}}
function tick(){decorate();addUserTools();addSettings();addAudit()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",tick);else tick();
new MutationObserver(tick).observe(document.body,{childList:true,subtree:true});
window.addEventListener("hashchange",()=>setTimeout(tick,0));
})();
