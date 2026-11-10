const ALLOWED_ORIGIN="https://raher458.github.io";
const SESSION_DAYS=30, ITERATIONS=120000;
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Vary":"Origin","Cache-Control":"no-store"}})}
function bytes(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return a}
function hex(a){return [...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function unhex(s){return new Uint8Array(s.match(/.{2}/g).map(x=>parseInt(x,16)))}
async function digest(s){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))}
async function derive(password,saltHex){const salt=saltHex?unhex(saltHex):bytes(16);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const out=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITERATIONS},key,256);return{salt:hex(salt),hash:hex(out)}}
function userShape(r){return{id:r.id,username:r.username,display_name:r.display_name||"",bio:r.bio||"",created_at:r.created_at}}
function validName(s){return/^[a-zA-Z0-9_.-]{3,24}$/.test(s)}
async function session(req,env){const h=req.headers.get("Authorization")||"",token=h.startsWith("Bearer ")?h.slice(7):"";if(!token)return null;return await env.DB.prepare("SELECT users.id,users.username,users.display_name,users.bio,users.created_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(await digest(token),Date.now()).first()}
async function rateLimit(req,env,action){
 const ip=req.headers.get("CF-Connecting-IP")||"unknown";
 const key=await digest("rh-social-rate:"+action+":"+ip);
 const now=Date.now();
 const windowMs=action==="register"?60*60*1000:15*60*1000;
 const max=action==="register"?5:20;
 const row=await env.DB.prepare(`INSERT INTO rate_limits(key,attempt_count,window_started_at) VALUES(?,?,?)
 ON CONFLICT(key) DO UPDATE SET
 attempt_count=CASE WHEN rate_limits.window_started_at<=? THEN 1 ELSE rate_limits.attempt_count+1 END,
 window_started_at=CASE WHEN rate_limits.window_started_at<=? THEN excluded.window_started_at ELSE rate_limits.window_started_at END
 RETURNING attempt_count,window_started_at`).bind(key,1,now,now-windowMs,now-windowMs).first();
 if(row && row.attempt_count>max){
  const retry=Math.max(1,Math.ceil((row.window_started_at+windowMs-now)/1000));
  return new Response(JSON.stringify({error:"Слишком много попыток. Попробуй позже."}),{status:429,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Retry-After":String(retry),"Cache-Control":"no-store","Vary":"Origin"}});
 }
 if(Math.random()<0.02) await env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at<?").bind(now-86400000).run();
 return null;
}
async function issueSession(env,userId){const token=hex(bytes(32)),now=new Date().toISOString();await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(await digest(token),userId,Date.now()+SESSION_DAYS*86400000,now).run();return token}
export default{async fetch(req,env){
 const origin=req.headers.get("Origin")||"";
 if(origin && origin!==ALLOWED_ORIGIN)return new Response("Origin not allowed",{status:403});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"}});
 const path=new URL(req.url).pathname.replace(/\/$/,"");
 if(path==="/"||path==="/api")return json({service:"RH Social Auth API",status:"online"});
 if(!env.DB)return json({error:"D1 binding DB is missing."},500);
 try{
  if(req.method==="POST"&&path==="/api/register"){
   const limited=await rateLimit(req,env,"register");if(limited)return limited;
   const b=await req.json(),username=String(b.username||"").trim(),password=String(b.password||"");
   if(!validName(username))return json({error:"Логин: 3–24 символа, латиница, цифры, точка, дефис и _."},400);
   if(password.length<6||password.length>128)return json({error:"Пароль должен быть от 6 до 128 символов."},400);
   if(await env.DB.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").bind(username).first())return json({error:"Этот логин уже занят."},409);
   const p=await derive(password),id=crypto.randomUUID(),now=new Date().toISOString();
   await env.DB.prepare("INSERT INTO users(id,username,password_salt,password_hash,display_name,bio,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,username,p.salt,p.hash,username,"",now).run();
   const token=await issueSession(env,id),u=await env.DB.prepare("SELECT id,username,display_name,bio,created_at FROM users WHERE id=?").bind(id).first();
   return json({token,user:userShape(u)},201)
  }
  if(req.method==="POST"&&path==="/api/login"){
   const limited=await rateLimit(req,env,"login");if(limited)return limited;
   const b=await req.json(),username=String(b.username||"").trim(),password=String(b.password||"");
   const row=await env.DB.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
   if(!row)return json({error:"Неверный логин или пароль."},401);
   const p=await derive(password,row.password_salt);if(p.hash!==row.password_hash)return json({error:"Неверный логин или пароль."},401);
   return json({token:await issueSession(env,row.id),user:userShape(row)})
  }
  if(req.method==="GET"&&path==="/api/me"){const u=await session(req,env);return u?json({user:userShape(u)}):json({error:"Сессия истекла. Войди снова."},401)}
  if(req.method==="POST"&&path==="/api/profile"){
   const u=await session(req,env);if(!u)return json({error:"Сессия истекла. Войди снова."},401);
   const b=await req.json(),display=String(b.display_name||"").trim(),bio=String(b.bio||"").trim();
   if(display.length>32||bio.length>160)return json({error:"Имя до 32 символов, описание до 160."},400);
   await env.DB.prepare("UPDATE users SET display_name=?,bio=? WHERE id=?").bind(display||u.username,bio,u.id).run();
   const updated=await env.DB.prepare("SELECT id,username,display_name,bio,created_at FROM users WHERE id=?").bind(u.id).first();return json({user:userShape(updated)})
  }
  if(req.method==="POST"&&path==="/api/logout"){const h=req.headers.get("Authorization")||"",token=h.startsWith("Bearer ")?h.slice(7):"";if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();return json({ok:true})}
  return json({error:"Not found"},404)
 }catch(e){return json({error:"Внутренняя ошибка сервера."},500)}
}};
