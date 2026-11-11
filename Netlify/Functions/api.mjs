import {getStore} from '@netlify/blobs';import crypto from 'node:crypto';import nodemailer from 'nodemailer';import seed from './seed.json';
const E=process.env,ORDER_EMAIL=E.ORDER_EMAIL||'bolivargonzales2007@gmail.com',STORE=E.STORE_NAME||'ARENA Sports',SECRET=E.SESSION_SECRET||E.ADMIN_PASSWORD||'x';
const DB=()=>getStore('data'),IMG=()=>getStore('images');
const J=(c,o,h={})=>new Response(JSON.stringify(o),{status:c,headers:{'Content-Type':'application/json',...h}});
const cut=(s,n=200)=>String(s??'').slice(0,n),usd=c=>'$'+(c/100).toFixed(2);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest('hex');
const mk=()=>{const e=Date.now()+12*36e5;return e+'.'+sign(''+e)};
const authed=req=>{const m=/adm=([^;]+)/.exec(req.headers.get('cookie')||'');if(!m)return false;const[e,s='']=m[1].split('.');return +e>Date.now()&&s.length===64&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(sign(e)))};
async function prods(){let p=await DB().get('products',{type:'json'});if(!p){p=seed;await DB().setJSON('products',p)}return p}
const saveP=p=>DB().setJSON('products',p);
const tx=E.SMTP_USER?nodemailer.createTransport({service:'gmail',auth:{user:E.SMTP_USER,pass:E.SMTP_PASS}}):null;
async function mail(id,c,L,sub,ship,total){if(!tx)return false;
 const t=`<table cellpadding=6>${L.map(l=>`<tr><td>${esc(l.name)} (${esc(l.size)})</td><td>x${l.qty}</td><td>${usd(l.price*l.qty)}</td></tr>`).join('')}</table><p>Subtotal: ${usd(sub)}<br>Envío: ${usd(ship)}<br><b>Total: ${usd(total)}</b></p>`;
 const from=`"${STORE}" <${E.SMTP_USER}>`;
 const [a]=await Promise.allSettled([tx.sendMail({from,to:ORDER_EMAIL,replyTo:c.email,subject:`Nuevo pedido #${id} - ${usd(total)}`,
  html:`<h2>Pedido #${id}</h2><p><b>${esc(c.name)}</b><br>${esc(c.email)} · ${esc(c.phone)}<br>${esc(c.address)}<br>Pago: ${esc(c.pay)}<br>Notas: ${esc(c.notes)}</p>${t}`}),
  tx.sendMail({from,to:c.email,subject:`Recibimos tu pedido #${id}`,html:`<h2>¡Gracias, ${esc(c.name)}!</h2><p>Recibimos tu pedido y te contactaremos pronto.</p>${t}`})]);
 if(a.status==='rejected')console.error('Email falló:',a.reason?.message);return a.status==='fulfilled'}
async function order(req){const b=await req.json().catch(()=>({})),r=b.customer||{};
 const c={name:cut(r.name),email:cut(r.email),phone:cut(r.phone),address:cut(r.address,400),pay:cut(r.pay),notes:cut(r.notes,400)};
 if(!c.name||!/^\S+@\S+\.\S+$/.test(c.email)||!c.address||!Array.isArray(b.items)||!b.items.length||b.items.length>30)return J(400,{error:'Completa nombre, correo y dirección.'});
 const P=await prods(),L=[];let sub=0;
 for(const it of b.items){const p=P.find(x=>x.id===+it.id&&x.active),q=Math.min(10,Math.max(1,+it.qty|0));
  if(!p||p.stock<q)return J(400,{error:'Un producto ya no está disponible.'});if(!p.sizes.includes(it.size))return J(400,{error:'Talla inválida.'});
  L.push({id:p.id,name:p.name,size:it.size,qty:q,price:p.price});sub+=p.price*q}
 const ship=sub>=10000?0:599,total=sub+ship,id=((await DB().get('counter',{type:'json'}))||0)+1;
 await DB().setJSON('counter',id);L.forEach(l=>{P.find(x=>x.id===l.id).stock-=l.qty});await saveP(P);
 const o={id,customer:c,items:L,total,status:'nuevo',emailed:0,created:new Date().toISOString().slice(0,16).replace('T',' ')};
 await DB().setJSON('order-'+String(id).padStart(6,'0'),o);
 const sent=await mail(id,c,L,sub,ship,total);if(sent){o.emailed=1;await DB().setJSON('order-'+String(id).padStart(6,'0'),o)}
 return J(200,{id,emailed:sent})}
async function admin(req,p,m){let x;
 if(p==='/api/admin/products'&&m==='GET')return J(200,await prods());
 if(p==='/api/admin/products'&&m==='POST'){const P=await prods();const id=Math.max(0,...P.map(q=>q.id))+1;P.push({id,name:'Nuevo producto',category:'futbol',description:'Descripción',price:2999,image:'/img/seed-1.svg',sizes:['S','M','L','XL'],stock:100,active:1});await saveP(P);return J(200,{id})}
 if((x=/^\/api\/admin\/products\/(\d+)$/.exec(p))){let P=await prods();
  if(m==='DELETE'){await saveP(P.filter(q=>q.id!==+x[1]));return J(200,{ok:1})}
  if(m==='PUT'){const b=await req.json();P=P.map(q=>q.id!==+x[1]?q:{id:q.id,name:cut(b.name),category:b.category==='basket'?'basket':'futbol',description:cut(b.description,500),price:Math.max(0,Math.round(+b.price)||0),image:cut(b.image,300),sizes:(b.sizes||[]).slice(0,12).map(s=>cut(s,10)),stock:Math.max(0,+b.stock|0),active:b.active?1:0});await saveP(P);return J(200,{ok:1})}}
 if(p==='/api/admin/upload'&&m==='POST'){const b=await req.json(),k=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(b.data||'');if(!k)return J(400,{error:'Usa PNG, JPG o WEBP'});
  const f=`img-${Date.now()}.${k[1]==='jpeg'?'jpg':k[1]}`;const buf=Buffer.from(k[2],'base64');await IMG().set(f,buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length));return J(200,{url:'/uploads/'+f})}
 if(p==='/api/admin/orders'&&m==='GET'){const{blobs}=await DB().list({prefix:'order-'});const keys=blobs.map(b=>b.key).sort().reverse().slice(0,100);return J(200,await Promise.all(keys.map(k=>DB().get(k,{type:'json'}))))}
 if((x=/^\/api\/admin\/orders\/(\d+)$/.exec(p))&&m==='PATCH'){const k='order-'+x[1].padStart(6,'0'),o=await DB().get(k,{type:'json'});if(!o)return J(404,{error:'No existe'});o.status=cut((await req.json()).status,20);await DB().setJSON(k,o);return J(200,{ok:1})}
 return J(404,{error:'No existe'})}
export default async req=>{try{const p=new URL(req.url).pathname,m=req.method;
 if(p.startsWith('/uploads/')){const f=p.slice(9);if(!/^[\w.-]+$/.test(f))return new Response('No',{status:404});const b=await IMG().get(f,{type:'arrayBuffer'});if(!b)return new Response('No',{status:404});
  return new Response(b,{headers:{'Content-Type':{png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[f.split('.').pop()]||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable'}})}
 if(p==='/api/products'&&m==='GET')return J(200,(await prods()).filter(x=>x.active));
 if(p==='/api/orders'&&m==='POST')return await order(req);
 if(p==='/api/admin/login'&&m==='POST'){const b=await req.json().catch(()=>({}));if(E.ADMIN_PASSWORD&&String(b.password)===E.ADMIN_PASSWORD)return J(200,{ok:1},{'Set-Cookie':`adm=${mk()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`});await new Promise(r=>setTimeout(r,800));return J(401,{error:'Contraseña incorrecta'})}
 if(p.startsWith('/api/admin/')){if(!authed(req))return J(401,{error:'No autorizado'});return await admin(req,p,m)}
 return J(404,{error:'No existe'})}catch(e){console.error(e);return J(500,{error:'Error del servidor'})}};
export const config={path:['/api/*','/uploads/*']};
