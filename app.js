const {createClient}=supabase; const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
let user=null, profile=null, memberTab="available";
const $=id=>document.getElementById(id);
const rupiah=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const msg=(id,t,c="")=>{$(id).textContent=t;$(id).className="message "+c};

function loggedOut(){ $("loginPage").hidden=false;$("appPage").hidden=true; }
async function loadProfile(u){
 user=u; const {data:p,error}=await db.from("profiles").select("*").eq("id",u.id).single();
 if(error){msg("authMsg",error.message,"error");return} profile=p;
 $("loginPage").hidden=true;$("appPage").hidden=false;$("headerName").textContent=p.full_name;
 if(p.role==="admin"){ $("adminPage").hidden=false;$("memberPage").hidden=true; await loadAdmin(); }
 else { $("memberPage").hidden=false;$("adminPage").hidden=true;$("memberName").textContent=p.full_name; await loadMember(); }
}
async function loadMember(){
 const {data:events,error}=await db.from("sports_events").select("*").neq("status","cancelled").order("event_date").order("event_time");
 if(error){$("memberContent").innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}
 const {data:regs}=await db.from("registrations").select("event_id,payment_status").eq("member_id",user.id);
 const joined=new Map((regs||[]).map(r=>[r.event_id,r]));
 const {data:all}=await db.from("registrations").select("event_id");
 const counts={};(all||[]).forEach(r=>counts[r.event_id]=(counts[r.event_id]||0)+1);
 const list=memberTab==="mine"?(events||[]).filter(e=>joined.has(e.id)):(events||[]);
 $("memberContent").innerHTML=list.length?list.map(e=>{
   const r=joined.get(e.id), count=counts[e.id]||0, full=count>=e.capacity&&!r;
   return `<div class="event-card"><div class="event-top"><div><div class="sport-title">⚽ ${esc(e.name)}</div><div class="event-info">📅 ${e.event_date} &nbsp; ⏰ ${String(e.event_time).slice(0,5)}<br>📍 ${esc(e.location)}</div></div><span class="badge ${e.status!=="open"?"closed":""}">${e.status==="open"?"DIBUKA":"DITUTUP"}</span></div><div class="fee">${rupiah(e.fee)}</div><div class="event-info">👥 ${count}/${e.capacity} peserta</div><div class="event-actions">${r?`<span class="badge">✓ Terdaftar</span><span class="pay">${r.payment_status==="paid"?"✅ Sudah Bayar":"⏳ Belum Bayar"}</span>`:full?`<span class="badge closed">Penuh</span>`:`<button class="btn primary" onclick="join('${e.id}')">Ikut Olahraga</button>`}</div></div>`
 }).join(""):`<div class="empty">${memberTab==="mine"?"Belum ada olahraga yang diikuti.":"Belum ada kegiatan olahraga."}</div>`;
}
window.join=async id=>{
 const {data:e}=await db.from("sports_events").select("*").eq("id",id).single(); if(!e)return;
 const {count}=await db.from("registrations").select("*",{count:"exact",head:true}).eq("event_id",id);
 if((count||0)>=e.capacity)return alert("Peserta sudah penuh.");
 const {error}=await db.from("registrations").insert({event_id:id,member_id:user.id});
 if(error) alert(error.code==="23505"?"Kamu sudah terdaftar.":error.message); else {alert(`Berhasil daftar ${e.name}. Biaya ${rupiah(e.fee)}.`);await loadMember();}
};

async function loadAdmin(){
 const {data:events,error}=await db.from("sports_events").select("*").order("event_date").order("event_time");
 if(error){msg("adminMsg",error.message,"error");return}
 const {data:regs,error:re}=await db.from("registrations").select("id,event_id,member_id,payment_status,profiles(full_name)");
 if(re){msg("adminMsg",re.message,"error");return}
 const by={};(regs||[]).forEach(r=>(by[r.event_id]??=[]).push(r));
 let people=0,money=0;
 $("adminList").innerHTML=(events||[]).map(e=>{
  const list=by[e.id]||[];people+=list.length;money+=list.length*e.fee;
  return `<div class="event-card"><div class="event-top"><div><div class="sport-title">⚽ ${esc(e.name)}</div><div class="event-info">📅 ${e.event_date} &nbsp; ⏰ ${String(e.event_time).slice(0,5)}<br>📍 ${esc(e.location)}</div></div><span class="badge ${e.status!=="open"?"closed":""}">${e.status==="open"?"DIBUKA":"DITUTUP"}</span></div><div class="fee">${rupiah(e.fee)} <small>/ orang</small></div><div class="event-info">👥 ${list.length}/${e.capacity} peserta &nbsp; • &nbsp; Total ${rupiah(list.length*e.fee)}</div><div class="event-actions" style="margin-top:12px">${e.status==="open"?`<button class="btn light" onclick="toggleEvent('${e.id}','closed')">Tutup Pendaftaran</button>`:`<button class="btn light" onclick="toggleEvent('${e.id}','open')">Buka Pendaftaran</button>`}<button class="danger" onclick="deleteEvent('${e.id}')">Hapus</button></div><div class="participants"><b>Daftar Peserta</b>${list.length?list.map(r=>`<div class="person"><span>${esc(r.profiles?.full_name||"Member")}</span><span class="pay">${r.payment_status==="paid"?"✅ Sudah Bayar":`⏳ Belum Bayar <button onclick="paid('${r.id}')">Tandai Bayar</button>`}</span></div>`).join(""):`<div class="event-info" style="margin-top:8px">Belum ada peserta.</div>`}</div></div>`
 }).join("")||`<div class="empty">Belum ada kegiatan.</div>`;
 $("sEvents").textContent=(events||[]).length;$("sPeople").textContent=people;$("sMoney").textContent=rupiah(money);
}
window.toggleEvent=async(id,status)=>{const {error}=await db.from("sports_events").update({status}).eq("id",id);if(error)alert(error.message);else loadAdmin()};
window.paid=async id=>{const {error}=await db.from("registrations").update({payment_status:"paid"}).eq("id",id);if(error)alert(error.message);else loadAdmin()};
window.deleteEvent=async id=>{if(!confirm("Hapus kegiatan ini beserta pendaftarnya?"))return;const {error}=await db.from("sports_events").delete().eq("id",id);if(error)alert(error.message);else loadAdmin()};

$("loginBtn").onclick=async()=>{const email=$("loginEmail").value.trim(),password=$("loginPassword").value;msg("authMsg","Memproses...");const {error}=await db.auth.signInWithPassword({email,password});if(error)msg("authMsg",error.message,"error")};
$("registerBtn").onclick=async()=>{const name=$("regName").value.trim(),email=$("regEmail").value.trim(),password=$("regPassword").value;if(!name||!email||password.length<6)return msg("authMsg","Lengkapi data dan password minimal 6 karakter.","error");const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:name}}});if(error)msg("authMsg",error.message,"error");else if(data.session)msg("authMsg","Akun berhasil dibuat.","ok");else msg("authMsg","Akun dibuat. Jika konfirmasi email aktif, cek email.","ok")};
$("logoutBtn").onclick=()=>db.auth.signOut();
$("addEvent").onclick=async()=>{const name=$("sportName").value.trim(),event_date=$("eventDate").value,event_time=$("eventTime").value,location=$("eventLocation").value.trim(),fee=Number($("eventFee").value),capacity=Number($("eventCapacity").value);if(!name||!event_date||!event_time||!location||fee<0||capacity<1)return msg("adminMsg","Lengkapi semua data.","error");const {error}=await db.from("sports_events").insert({name,event_date,event_time,location,fee,capacity,status:"open",created_by:user.id});if(error)msg("adminMsg",error.message,"error");else{["sportName","eventDate","eventTime","eventLocation","eventFee","eventCapacity"].forEach(i=>$(i).value="");msg("adminMsg","Kegiatan berhasil dibuat.","ok");loadAdmin()}};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");memberTab=b.dataset.tab;loadMember()});
(async()=>{if(SUPABASE_ANON_KEY.includes("PASTE_")){msg("authMsg","Isi Publishable/anon key di config.js terlebih dahulu.","error");return}const {data:{session}}=await db.auth.getSession();if(session)loadProfile(session.user);else loggedOut();db.auth.onAuthStateChange((_e,s)=>s?loadProfile(s.user):loggedOut())})();