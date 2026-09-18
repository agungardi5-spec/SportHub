const {createClient}=supabase; const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
let user=null, profile=null, memberTab="available";
const $=id=>document.getElementById(id);
const rupiah=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const msg=(id,t,c="")=>{$(id).textContent=t;$(id).className="message "+c};

function loggedOut(){ $("loginPage").hidden=false;$("appPage").hidden=true; }

async function loadProfile(u){
 user=u;
 const {data:p,error}=await db.from("profiles").select("*").eq("id",u.id).single();
 if(error){msg("authMsg",error.message,"error");return}
 profile=p;
 msg("authMsg","");
 $("loginPage").hidden=true;
 $("appPage").hidden=false;
 window.scrollTo(0,0);
 $("headerName").textContent=p.full_name;

 if(p.role==="admin"){
  $("adminPage").hidden=false;
  $("memberPage").hidden=true;
  await loadAdmin();
 } else {
  $("memberPage").hidden=false;
  $("adminPage").hidden=true;
  $("memberName").textContent=p.full_name;
  await loadMember();
 }
}

async function loadMember(){
 const {data:events,error}=await db.from("sports_events").select("*").neq("status","cancelled").order("event_date").order("event_time");
 if(error){$("memberContent").innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}

 const {data:regs}=await db.from("registrations").select("event_id,payment_status").eq("member_id",user.id);
 const joined=new Map((regs||[]).map(r=>[r.event_id,r]));

 const {data:all}=await db.from("registrations").select("event_id");
 const counts={};
 (all||[]).forEach(r=>counts[r.event_id]=(counts[r.event_id]||0)+1);

 const list=memberTab==="mine"?(events||[]).filter(e=>joined.has(e.id)):(events||[]);

 $("memberContent").innerHTML=list.length?list.map(e=>{
  const r=joined.get(e.id), count=counts[e.id]||0, full=count>=e.capacity&&!r;

  return `<div class="event-card">
   <div class="event-top">
    <div>
     <div class="sport-title">⚽ ${esc(e.name)}</div>
     <div class="event-info">📅 ${e.event_date} &nbsp; ⏰ ${String(e.event_time).slice(0,5)}<br>📍 ${esc(e.location)}</div>
    </div>
    <span class="badge ${e.status!=="open"?"closed":""}">${e.status==="open"?"DIBUKA":"DITUTUP"}</span>
   </div>
   <div class="fee">${rupiah(e.fee)}</div>
   <div class="event-info">👥 ${count}/${e.capacity} peserta</div>
   <div class="event-actions">
    ${r?`<span class="badge">✓ Terdaftar</span><span class="pay">${r.payment_status==="paid"?"✅ Sudah Bayar":"⏳ Belum Bayar"}</span>`:
    full?`<span class="badge closed">Penuh</span>`:
    `<button class="btn primary" onclick="join('${e.id}')">Ikut Olahraga</button>`}
   </div>
  </div>`
 }).join(""):`<div class="empty">${memberTab==="mine"?"Belum ada olahraga yang diikuti.":"Belum ada kegiatan olahraga."}</div>`;
}

window.join=async id=>{
 const {data:e}=await db.from("sports_events").select("*").eq("id",id).single();
 if(!e)return;

 const {count}=await db.from("registrations").select("*",{count:"exact",head:true}).eq("event_id",id);
 if((count||0)>=e.capacity)return alert("Peserta sudah penuh.");

 const {error}=await db.from("registrations").insert({event_id:id,member_id:user.id});

 if(error)
  alert(error.code==="23505"?"Kamu sudah terdaftar.":error.message);
 else{
  alert(`Berhasil daftar ${e.name}. Biaya ${rupiah(e.fee)}.`);
  await loadMember();
 }
};

async function loadAdmin(){
 const {data:events,error}=await db.from("sports_events").select("*").order("event_date").order("event_time");
 if(error){msg("adminMsg",error.message,"error");return}

 const filter=$("financeEventFilter");
if(filter){
  const current=filter.value||"all";
  filter.innerHTML='<option value="all">Semua Kegiatan</option>';
  (events||[]).forEach(e=>{
    const option=document.createElement("option");
    option.value=e.id;
    option.textContent=e.name;
    filter.appendChild(option);
  });
  filter.value=(events||[]).some(e=>e.id===current)?current:"all";
}

 const {data:regs,error:re}=await db.from("registrations").select("id,event_id,member_id,payment_status,profiles(full_name)");
 if(re){msg("adminMsg",re.message,"error");return}

 const by={};
 (regs||[]).forEach(r=>(by[r.event_id]??=[]).push(r));

let people=0,money=0,paidMoney=0,unpaidMoney=0;
 const uniquePeople=new Set();
const uniqueSports=new Set();

 $("adminList").innerHTML=(events||[]).map(e=>{
  const list=by[e.id]||[];
  uniqueSports.add(e.name);
  people+=list.length;
  money+=list.length*e.fee;
list.forEach(r=>{
 uniquePeople.add(r.member_id);
 
  if(r.payment_status==="paid"){
    paidMoney+=e.fee;
  }else{
    unpaidMoney+=e.fee;
  }
});

  return `<div class="event-card">
   <div class="event-top">
    <div>
     <div class="sport-title">⚽ ${esc(e.name)}</div>
     <div class="event-info">📅 ${e.event_date} &nbsp; ⏰ ${String(e.event_time).slice(0,5)}<br>📍 ${esc(e.location)}</div>
    </div>
    <span class="badge ${e.status!=="open"?"closed":""}">${e.status==="open"?"DIBUKA":"DITUTUP"}</span>
   </div>

   <div class="fee">${rupiah(e.fee)} <small>/ orang</small></div>

   <div class="event-info">
    👥 ${list.length}/${e.capacity} peserta &nbsp; • &nbsp;
    Total ${rupiah(list.length*e.fee)}
   </div>

   <div class="event-actions" style="margin-top:12px">
    ${e.status==="open"
     ?`<button class="btn light" onclick="toggleEvent('${e.id}','closed')">Tutup Pendaftaran</button>`
     :`<button class="btn light" onclick="toggleEvent('${e.id}','open')">Buka Pendaftaran</button>`}
    <button class="danger" onclick="deleteEvent('${e.id}')">Hapus</button>
   </div>

   <div class="participants">
    <b>Daftar Peserta</b>
    ${list.length
     ?list.map(r=>`<div class="person">
       <span>${esc(r.profiles?.full_name||"Member")}</span>
       <span class="pay">
        ${r.payment_status==="paid"
         ?"✅ Sudah Bayar"
         :`⏳ Belum Bayar <button onclick="paid('${r.id}')">Tandai Bayar</button>`}
       </span>
      </div>`).join("")
     :`<div class="event-info" style="margin-top:8px">Belum ada peserta.</div>`}
   </div>
  </div>`
 }).join("")||`<div class="empty">Belum ada kegiatan.</div>`;

$("sEvents").textContent=(events||[]).length;
$("sPeople").textContent=uniquePeople.size;
$("sSports").textContent=uniqueSports.size;
$("sMoney").textContent=rupiah(money);
 
 $("financeTotal").textContent=rupiah(money);
$("financePaid").textContent=rupiah(paidMoney);
$("financeUnpaid").textContent=rupiah(unpaidMoney);
$("financePeople").textContent=uniquePeople.size;
 const paymentPercent=money>0
  ? Math.round((paidMoney/money)*100)
  : 0;

if($("paymentPercent")){
  $("paymentPercent").textContent=paymentPercent+"%";
}

 $("financeEventFilter").onchange=()=>{
  const selected=$("financeEventFilter").value;
let total=0,paid=0,unpaid=0;
const selectedPeople=new Set();

  (events||[]).forEach(e=>{
    if(selected!=="all" && e.id!==selected) return;

    const list=by[e.id]||[];

list.forEach(r=>{
  selectedPeople.add(r.member_id);
});

total+=list.length*e.fee;

    list.forEach(r=>{
      if(r.payment_status==="paid"){
        paid+=e.fee;
      }else{
        unpaid+=e.fee;
      }
    });
  });

  $("financeTotal").textContent=rupiah(total);
  $("financePaid").textContent=rupiah(paid);
  $("financeUnpaid").textContent=rupiah(unpaid);
  $("financePeople").textContent=selectedPeople.size;

  const paymentPercent=total>0
  ? Math.round((paid/total)*100)
  : 0;

if($("paymentPercent")){
  $("paymentPercent").textContent=paymentPercent+"%";
}
};
}

window.toggleEvent=async(id,status)=>{
 const {error}=await db.from("sports_events").update({status}).eq("id",id);
 if(error)alert(error.message);
 else loadAdmin();
};

window.paid=async id=>{
 const {error}=await db.from("registrations").update({payment_status:"paid"}).eq("id",id);
 if(error)alert(error.message);
 else loadAdmin();
};

window.deleteEvent=async id=>{
 if(!confirm("Hapus kegiatan ini beserta pendaftarnya?"))return;

 const {error}=await db.from("sports_events").delete().eq("id",id);

 if(error)alert(error.message);
 else loadAdmin();
};

$("loginBtn").onclick=async()=>{
 const email=$("loginEmail").value.trim();
 const password=$("loginPassword").value;

 msg("authMsg","Memproses...");

 try{
  const {data,error}=await db.auth.signInWithPassword({email,password});

  if(error)throw error;

  if(data?.user)await loadProfile(data.user);

 }catch(e){
  msg("authMsg",e.message||String(e),"error");
 }
};

$("registerBtn").onclick=async()=>{
 const name=$("regName").value.trim();
 const email=$("regEmail").value.trim();
 const password=$("regPassword").value;

 if(!name||!email||password.length<6)
  return msg("authMsg","Lengkapi data dan password minimal 6 karakter.","error");

 const {data,error}=await db.auth.signUp({
  email,
  password,
  options:{data:{full_name:name}}
 });

 if(error)
  msg("authMsg",error.message,"error");
 else if(data.session)
  msg("authMsg","Akun berhasil dibuat.","ok");
 else
  msg("authMsg","Akun dibuat. Jika konfirmasi email aktif, cek email.","ok");
};

$("logoutBtn").onclick=()=>db.auth.signOut();

$("addEvent").onclick=async()=>{
 const name=$("sportName").value.trim();
 const event_date=$("eventDate").value;
 const event_time=$("eventTime").value;
 const location=$("eventLocation").value.trim();
 const fee=Number($("eventFee").value);
 const capacity=Number($("eventCapacity").value);

 if(!name||!event_date||!event_time||!location||fee<0||capacity<1)
  return msg("adminMsg","Lengkapi semua data.","error");

 const {error}=await db.from("sports_events").insert({
  name,
  event_date,
  event_time,
  location,
  fee,
  capacity,
  status:"open",
  created_by:user.id
 });

 if(error)
  msg("adminMsg",error.message,"error");
 else{
  ["sportName","eventDate","eventTime","eventLocation","eventFee","eventCapacity"].forEach(i=>$(i).value="");
  msg("adminMsg","Kegiatan berhasil dibuat.","ok");
  loadAdmin();
 }
};

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");
 memberTab=b.dataset.tab;
 loadMember();
});

(async()=>{
 if(SUPABASE_ANON_KEY.includes("PASTE_")){
  msg("authMsg","Isi Publishable/anon key di config.js terlebih dahulu.","error");
  return;
 }

 const {data:{session}}=await db.auth.getSession();

 if(session)
  await loadProfile(session.user);
 else
  loggedOut();

db.auth.onAuthStateChange((_e,s)=>{
  if(!s) loggedOut();
});
})();
// ================= ABSENSI =================

async function loadAttendanceEvents(){
  const select=$("attendanceEvent");
  if(!select) return;

  const {data:events,error}=await db
    .from("sports_events")
    .select("id,name,event_date,event_time")
    .order("event_date")
    .order("event_time");

  if(error){
    msg("attendanceMsg",error.message,"error");
    return;
  }

  select.innerHTML='<option value="">-- Pilih Kegiatan --</option>';

  (events||[]).forEach(e=>{
    const option=document.createElement("option");
    option.value=e.id;
    option.textContent=
      `${e.name} - ${e.event_date} ${String(e.event_time||"").slice(0,5)}`;
    select.appendChild(option);
  });
}

async function loadAttendance(){
  const eventId=$("attendanceEvent").value;
  const listEl=$("attendanceList");

  if(!eventId){
    listEl.innerHTML="";
    msg("attendanceMsg","Pilih kegiatan terlebih dahulu.","error");
    return;
  }

  msg("attendanceMsg","Memuat peserta...");

  const {data:regs,error}=await db
    .from("registrations")
    .select("member_id,profiles(full_name)")
    .eq("event_id",eventId);

  if(error){
    msg("attendanceMsg",error.message,"error");
    return;
  }

  const {data:attendance,error:attError}=await db
    .from("attendance")
    .select("member_id,status,notes")
    .eq("event_id",eventId);

  if(attError){
    msg("attendanceMsg",attError.message,"error");
    return;
  }

  const attendanceMap=new Map(
    (attendance||[]).map(a=>[a.member_id,a])
  );

  if(!regs||regs.length===0){
    listEl.innerHTML="<p>Belum ada peserta pada kegiatan ini.</p>";
    msg("attendanceMsg","");
    return;
  }

  listEl.innerHTML=regs.map(r=>{
    const a=attendanceMap.get(r.member_id);
    const status=a?.status||"absent";

    return `
      <div class="attendance-row">
        <div class="attendance-name">
          ${esc(r.profiles?.full_name||"Peserta")}
        </div>

        <select
          class="attendance-status"
          data-member="${r.member_id}"
        >
          <option value="present" ${status==="present"?"selected":""}>
            ✅ Hadir
          </option>
          <option value="absent" ${status==="absent"?"selected":""}>
            ❌ Tidak Hadir
          </option>
          <option value="excused" ${status==="excused"?"selected":""}>
            ⏰ Izin
          </option>
        </select>
      </div>
    `;
  }).join("");

  listEl.innerHTML+=`
    <button id="saveAttendanceBtn" class="btn primary">
      💾 Simpan Absensi
    </button>
  `;

  $("saveAttendanceBtn").onclick=saveAttendance;

  msg("attendanceMsg","Peserta berhasil dimuat.","success");
}

async function saveAttendance(){
  const eventId=$("attendanceEvent").value;

  if(!eventId) return;

  const rows=document.querySelectorAll(".attendance-status");

  const records=[...rows].map(row=>({
    event_id:eventId,
    member_id:row.dataset.member,
    status:row.value
  }));

  if(records.length===0){
    msg("attendanceMsg","Tidak ada peserta untuk disimpan.","error");
    return;
  }

  const {error}=await db
    .from("attendance")
    .upsert(records,{
      onConflict:"event_id,member_id"
    });

  if(error){
    msg("attendanceMsg",error.message,"error");
    return;
  }

  msg("attendanceMsg","Absensi berhasil disimpan!","success");

  await loadAttendanceStats();
}

async function loadAttendanceStats(){
  const {data,error}=await db
    .from("attendance")
    .select("status");

  if(error){
    console.error(error);
    return;
  }

  const rows=data||[];

  if(rows.length===0){
    if($("sAttendance")) $("sAttendance").textContent="0%";
    return;
  }

  const present=rows.filter(
    r=>r.status==="present"
  ).length;

  const percent=Math.round(
    (present/rows.length)*100
  );

  if($("sAttendance")){
    $("sAttendance").textContent=percent+"%";
  }
}

if($("loadAttendanceBtn")){
  $("loadAttendanceBtn").onclick=loadAttendance;
}

if($("attendanceEvent")){
  $("attendanceEvent").addEventListener("change",()=>{
    $("attendanceList").innerHTML="";
    msg("attendanceMsg","");
  });
}

loadAttendanceEvents();
loadAttendanceStats();

// ================= END ABSENSI =================
