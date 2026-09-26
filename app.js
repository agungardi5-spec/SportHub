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
 $("headerRole").textContent = p.role === "admin" ? "Admin" : "Member";

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
 await loadMemberFinance();
}
async function loadMemberFinance(){

  const incomeEl = $("memberIncome");
  const expenseEl = $("memberExpense");
  const balanceEl = $("memberBalance");
  const listEl = $("memberExpenseList");

  if(!incomeEl || !expenseEl || !balanceEl || !listEl) return;

  // PEMASUKAN
  const {data:regs,error:regError}=await db
    .from("registrations")
    .select("payment_status,sports_events(fee)");

  if(regError){
    console.error(regError);
    return;
  }

  let income=0;

  (regs||[]).forEach(r=>{
    if(r.payment_status==="paid"){
      income+=Number(r.sports_events?.fee||0);
    }
  });

  // PENGELUARAN
  const {data:expenses,error:expenseError}=await db
    .from("expenses")
    .select("expense_name,expense_date,amount,notes")
    .order("expense_date",{ascending:false})
    .order("id",{ascending:false});

  if(expenseError){
    console.error(expenseError);
    return;
  }

  let expense=0;

  (expenses||[]).forEach(e=>{
    expense+=Number(e.amount||0);
  });

  // SALDO
  const balance=income-expense;

  incomeEl.textContent=rupiah(income);
  expenseEl.textContent=rupiah(expense);
  balanceEl.textContent=rupiah(balance);

  // DAFTAR PENGELUARAN
  if(!expenses||expenses.length===0){

    listEl.innerHTML=`
      <tr>
        <td colspan="5">Belum ada data pengeluaran.</td>
      </tr>
    `;

    return;
  }

  listEl.innerHTML=expenses.map((e,index)=>`
    <tr>
      <td>${index+1}</td>
      <td>${e.expense_date||"-"}</td>
      <td>${esc(e.expense_name||"-")}</td>
      <td>${rupiah(Number(e.amount||0))}</td>
      <td>${esc(e.notes||"-")}</td>
    </tr>
  `).join("");
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
  const paidCount = list.filter(
  r => r.payment_status === "paid"
).length;

const unpaidCount = list.filter(
  r => r.payment_status !== "paid"
).length;
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

 return `
  <div class="event-card"
  style="
    display:flex;
    flex-direction:column;
    gap:14px;
    padding:18px 20px;
    margin-bottom:14px;
  ">

  <!-- HEADER -->
  <div style="
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:12px;
  ">

    <div class="sport-title">
      ⚽ ${esc(e.name)}
    </div>

    <span class="badge ${
      e.status==="open" ? "" : "closed"
    }">
      ${e.status==="open" ? "DIBUKA" : "DITUTUP"}
    </span>

  </div>

  <!-- INFORMASI -->
  <div style="
    display:grid;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:12px;
  ">

    <div class="event-info">
      📅
      <small>Tanggal</small>
      <strong>${e.event_date}</strong>
    </div>

    <div class="event-info">
      ⏰
      <small>Waktu</small>
      <strong>${String(e.event_time).slice(0,5)}</strong>
    </div>

    <div class="event-info">
      📍
      <small>Lokasi</small>
      <strong>${esc(e.location)}</strong>
    </div>

    <div class="event-info">
      💰
      <small>Biaya</small>
      <strong>${rupiah(e.fee)}</strong>
    </div>

  </div>

  <!-- PESERTA -->
  <div style="
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding-top:4px;
  ">

    <div class="event-info">
      👥 Peserta:
      <strong>${list.length}/${e.capacity}</strong>
      <div class="event-info">
  💰
  <small>Pembayaran</small>
  <strong>
    ✅ ${paidCount} Lunas
    &nbsp;|&nbsp;
    ⏳ ${unpaidCount} Belum Bayar
  </strong>
</div>

    <div class="event-actions"
      style="
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        justify-content:flex-end;
      "
    >

      ${
        e.status==="open"
        ? `<button
            class="btn light"
            onclick="toggleEvent('${e.id}','closed')">
            Tutup Pendaftaran
          </button>`
        : `<button
            class="btn light"
            onclick="toggleEvent('${e.id}','open')">
            Buka Pendaftaran
          </button>`
      }

      <button
        class="btn danger"
        onclick="deleteEvent('${e.id}')">
        Hapus
      </button>

      <button
        class="btn light"
        onclick="toggleParticipants('${e.id}')">
        👥 Kelola
      </button>

    </div>

  </div>

  <!-- DAFTAR PESERTA -->
  <div
    id="participants-${e.id}"
    style="
      display:none;
      padding:12px;
      background:#f8fafc;
      border-radius:10px;
      font-size:13px;
    "
  >

    <b>Peserta:</b>

    ${
      list.length
      ? list.map(r=>`
          <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            margin-top:8px;
          ">

            <span>
              ${esc(r.profiles?.full_name||"Member")}
            </span>

            ${
              r.payment_status==="paid"
              ? "✅"
              : `
                <span>
                  ⏳
                  <button
                    class="btn light"
                    onclick="paid('${r.id}')">
                    Tandai Bayar
                  </button>
                </span>
              `
            }

          </div>
        `).join("")
      : "Belum ada peserta"
    }

  </div>

</div>
`;
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
window.toggleParticipants=async function(id){

  const el=document.getElementById("participants-"+id);

  if(!el) return;

  if(el.style.display==="block"){
    el.style.display="none";
    return;
  }

  el.style.display="block";
  el.innerHTML="<b>Memuat peserta...</b>";

  const {data:regs,error}=await db
    .from("registrations")
    .select(`
      id,
      member_id,
      payment_status,
      profiles(full_name)
    `)
    .eq("event_id",id);

  if(error){
    el.innerHTML=
      `<span style="color:#dc2626;">${esc(error.message)}</span>`;
    return;
  }

  const {data:attendance,error:attError}=await db
    .from("attendance")
    .select("member_id,status")
    .eq("event_id",id);

  if(attError){
    el.innerHTML=
      `<span style="color:#dc2626;">${esc(attError.message)}</span>`;
    return;
  }

  const attendanceMap=new Map(
    (attendance||[]).map(a=>[a.member_id,a.status])
  );

  if(!regs || regs.length===0){
    el.innerHTML=
      "<b>Peserta:</b><br><br>Belum ada peserta.";
    return;
  }

  el.innerHTML=`
    <b>Peserta:</b>

    ${regs.map(r=>{

      const payment =
        r.payment_status==="paid"
          ? "💰 Lunas"
          : "⏳ Belum Bayar";

      const status =
        attendanceMap.get(r.member_id) || "absent";

      return `
        <div style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-top:10px;
          padding:10px;
          background:#fff;
          border:1px solid #e3ebf5;
          border-radius:8px;
        ">

          <span>
            👤 ${esc(r.profiles?.full_name || "Peserta")}
          </span>

          <span>
            ${payment}
          </span>

          <select
            onchange="updateAttendanceFromManage('${id}','${r.member_id}',this.value)"
            style="
              padding:7px 10px;
              border:1px solid #d8e3ef;
              border-radius:8px;
              background:#fff;
            "
          >

            <option value="absent"
              ${status==="absent"?"selected":""}>
              ❌ Belum Hadir
            </option>

            <option value="present"
              ${status==="present"?"selected":""}>
              ✅ Hadir
            </option>

            <option value="excused"
              ${status==="excused"?"selected":""}>
              ⏰ Izin
            </option>

          </select>

        </div>
      `;

    }).join("")}
  `;
};
// ================= UPDATE ABSENSI DARI KELOLA =================

window.updateAttendanceFromManage=async function(eventId,memberId,status){

  if(!eventId || !memberId || !status) return;

  const {error}=await db
    .from("attendance")
    .upsert(
      {
        event_id:eventId,
        member_id:memberId,
        status:status
      },
      {
        onConflict:"event_id,member_id"
      }
    );

  if(error){
    alert("Gagal menyimpan absensi: " + error.message);
    return;
  }

};
window.deleteEvent=async id=>{
 if(!confirm("Hapus kegiatan ini beserta pendaftarnya?"))return;

 const {error}=await db.from("sports_events").delete().eq("id",id);

 if(error)alert(error.message);
 else loadAdmin();
};
window.deleteExpense=async id=>{
  if(!confirm("Hapus pengeluaran ini?")) return;

  const {error}=await db
    .from("expenses")
    .delete()
    .eq("id",id);

  if(error){
    alert(error.message);
    return;
  }

  loadExpenses();
};

$("loginBtn").onclick=async()=>{
 const loginInput=$("loginEmail").value.trim().toLowerCase();
const password=$("loginPassword").value;

const email = loginInput.includes("@")
  ? loginInput
  : loginInput + "@sporthub.local";

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
const username=$("regUsername").value.trim().toLowerCase();
const password=$("regPassword").value;

 if(!name||!username||password.length<6)
  return msg("authMsg","Lengkapi data dan password minimal 6 karakter.","error");

 const authEmail = username + "@sporthub.local";

const {data,error}=await db.auth.signUp({
  email:authEmail,
  password,
  options:{
    data:{
      full_name:name,
      username:username
    }
  }
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
if($("addExpense")){
  $("addExpense").onclick=addExpense;
}
loadAttendanceEvents();
loadAttendanceStats();
loadExpenses();

// ================= END ABSENSI =================


// ================= PESERTA =================

async function loadParticipants(){

  const list = $("participantsList");

  if(!list) return;

  list.innerHTML = "";
  msg("participantsMsg","Memuat peserta...");

  const {data,error}=await db
    .from("registrations")
    .select(`
      id,
      member_id,
      payment_status,
      profiles(full_name),
      sports_events(name,event_date)
    `)
    .order("id");

  if(error){
    msg("participantsMsg",error.message,"error");
    return;
  }

  if(!data || data.length===0){
    list.innerHTML = `
      <tr>
        <td colspan="5">Belum ada peserta.</td>
      </tr>
    `;

    msg("participantsMsg","");
    return;
  }

  list.innerHTML=data.map((r,index)=>{

    const payment =
      r.payment_status === "paid"
        ? "✅ Lunas"
        : "⏳ Belum Bayar";

    return `
      <tr>

        <td>${index+1}</td>

        <td>
          ${esc(r.profiles?.full_name || "-")}
        </td>

        <td>
          ${esc(r.sports_events?.name || "-")}
        </td>

        <td>
          ${r.sports_events?.event_date || "-"}
        </td>

        <td>
          ${payment}
        </td>

      </tr>
    `;

  }).join("");

  msg("participantsMsg","");
}
// ================= JENIS OLAHRAGA =================

function loadSports(){

  const list = $("sportsList");

  if(!list) return;

  const sports = [
    {name:"Lari", icon:"🏃"},
    {name:"Sepeda", icon:"🚴"},
    {name:"Badminton", icon:"🏸"},
    {name:"Futsal", icon:"⚽"},
    {name:"Gym", icon:"🏋️"},
    {name:"Basket", icon:"🏀"},
    {name:"Tenis", icon:"🎾"},
    {name:"Yoga", icon:"🧘"}
  ];

  list.innerHTML = sports.map(s => `
  <div class="sport-box">
    <strong>${s.icon}</strong>
    <b>${s.name}</b>
    <small>Jenis Olahraga</small>
  </div>
`).join("");
}
// ================= NAVIGASI ADMIN =================

function showAdminSection(sectionId, buttonId){

  const dashboard = $("adminPage");

  if(!dashboard) return;

  const sections = [...dashboard.children];

  const specialSections = [
    "participantsSection",
    "paymentsSection",
    "attendanceSection",
   "expenseSection",
   "reportSection",
   "scheduleSection",
   "sportsSection",
   "settingsSection"
  ];

  // Sembunyikan semua bagian
  sections.forEach(el=>{
    el.style.display="none";
  });

  // ================= DASHBOARD =================
  if(sectionId === "dashboard"){

    sections.forEach(el=>{
      if(!specialSections.includes(el.id)){
        el.style.display="";
      }
    });

  }

  // ================= PESERTA =================
  if(sectionId === "participants"){

    const participants=$("participantsSection");

    if(participants){
      participants.style.display="block";
    }

    loadParticipants();

  }

  // ================= PEMBAYARAN =================
  if(sectionId === "payments"){

    const payments=$("paymentsSection");

    if(payments){
      payments.style.display="block";
    }

    loadPayments();

  }

  // ================= ABSENSI =================
  if(sectionId === "attendance"){

    const attendance=$("attendanceSection");

    if(attendance){
      attendance.style.display="block";
    }

    loadAttendanceEvents();

  }
if(sectionId === "expense"){
  const expense=$("expenseSection");

  if(expense){
    expense.style.display="block";
  }
}
 if(sectionId === "report"){
  const report=$("reportSection");

  if(report){
    report.style.display="block";
  }
  loadReport();
}
  // ================= JADWAL OLAHRAGA =================


if(sectionId === "schedule"){

  const scheduleList =
    $("adminList")?.closest(".dashboard-card");

  const createEvent =
    document.querySelector(".dashboard-card.create-event");

  // Tampilkan kartu daftar jadwal
  if(scheduleList){

    const parent = scheduleList.parentElement;

    if(parent){
      parent.style.display="grid";

      [...parent.children].forEach(el=>{
        if(el !== scheduleList){
          el.style.display="none";
        }
      });
    }

    scheduleList.style.display="block";
   scheduleList.style.gridColumn="1 / -1";
  }

  // Tampilkan form buat jadwal
  if(createEvent){
    createEvent.style.display="block";
  }

}
// ================= JENIS OLAHRAGA =================
if(sectionId === "sports"){
  const sports = $("sportsSection");

  if(sports){
    sports.style.display = "block";
  }

  loadSports();
}
 // ================= PENGATURAN =================
if(sectionId === "settings"){
  const settings = $("settingsSection");

  if(settings){
    settings.style.display = "block";
  }

  if($("settingsName") && profile){
    $("settingsName").textContent =
      profile.full_name || "Admin SportHub";
  }
 loadUsers();
}
  // ================= ACTIVE SIDEBAR =================

  document.querySelectorAll(".sidebar-item").forEach(btn=>{
    btn.classList.remove("active");
  });

  const activeButton=$(buttonId);

  if(activeButton){
    activeButton.classList.add("active");
  }

}
// ================= MENU DASHBOARD =================
if($("dashboardBtn")){
  $("dashboardBtn").onclick=()=>{
    showAdminSection(
      "dashboard",
      "dashboardBtn"
    );
  };
}

// ================= MENU PESERTA =================

if($("participantsBtn")){
  $("participantsBtn").onclick=()=>{

    showAdminSection(
      "participants",
      "participantsBtn"
    );

    const dashboard = $("adminPage");

    if(dashboard){

      [...dashboard.children].forEach(el=>{
        el.style.display="none";
      });

      const participants=$("participantsSection");

      if(participants){
        participants.style.display="block";
      }
    }

    loadParticipants();
  };
}

// ================= END PESERTA =================
// ================= ABSENSI =================

if($("attendanceBtn")){
  $("attendanceBtn").onclick=()=>{
    showAdminSection(
      "attendance",
      "attendanceBtn"
    );
  };
}
if($("expenseBtn")){
  $("expenseBtn").onclick=()=>{
    showAdminSection(
      "expense",
      "expenseBtn"
    );
  };
}
if($("reportBtn")){
  $("reportBtn").onclick=()=>{
    showAdminSection(
      "report",
      "reportBtn"
    );
  };
}
// ================= JADWAL OLAHRAGA =================

if($("scheduleBtn")){
  $("scheduleBtn").onclick=()=>{
    showAdminSection(
      "schedule",
      "scheduleBtn"
    );
  };
}
// ================= JENIS OLAHRAGA =================
if($("sportsBtn")){
  $("sportsBtn").onclick=()=>{
    showAdminSection("sports","sportsBtn");
  };
}

if($("settingsBtn")){
  $("settingsBtn").onclick=()=>{
    showAdminSection("settings","settingsBtn");
  };
}

// Tampilkan Dashboard saat pertama kali

showAdminSection(
  "dashboard",
  "dashboardBtn"
);
// ================= IURAN & PEMBAYARAN =================

async function loadPayments(){

  const list = $("paymentsList");

  if(!list) return;

  list.innerHTML = "";
  msg("paymentsMsg","Memuat data pembayaran...");

  const {data:regs,error:regError}=await db
    .from("registrations")
   .select("id,member_id,event_id,payment_status,profiles(full_name),sports_events(name,fee,event_date)")

  if(regError){
    msg("paymentsMsg",regError.message,"error");
    return;
  }

  let total = 0;
  let paid = 0;
  let unpaid = 0;

  if(!regs || regs.length===0){

    list.innerHTML=`
      <tr>
        <td colspan="6">Belum ada data pembayaran.</td>
      </tr>
    `;

    $("paymentsTotal").textContent=rupiah(0);
    $("paymentsPaid").textContent=rupiah(0);
    $("paymentsUnpaid").textContent=rupiah(0);

    msg("paymentsMsg","");
    return;
  }
list.innerHTML=regs.map((r,index)=>{
  const fee=Number(r.sports_events?.fee||0);

  total+=fee;

  if(r.payment_status==="paid"){
    paid+=fee;
  }else{
    unpaid+=fee;
  }

  return `
    <tr>
      <td>${index+1}</td>
      <td>${esc(r.profiles?.full_name||"Peserta")}</td>
      <td>${esc(r.sports_events?.name||"-")}</td>
<td>${r.sports_events?.event_date || "-"}</td>
<td>${rupiah(fee)}</td>
      <td>
        ${
          r.payment_status==="paid"
          ? "✅ Sudah Bayar"
          : "⏳ Belum Bayar"
        }
      </td>
      <td>
  ${
    r.payment_status === "paid"
      ? "—"
      : `<button
           class="btn primary"
           type="button"
           onclick="markPaymentPaid('${r.id}')"
         >
           ✅ Tandai Lunas
         </button>`
  }
</td>
    </tr>
  `;
}).join("");

$("paymentsTotal").textContent=rupiah(total);
$("paymentsPaid").textContent=rupiah(paid);
$("paymentsUnpaid").textContent=rupiah(unpaid);

msg("paymentsMsg","");

}
 // ================= TANDAI PEMBAYARAN LUNAS =================

async function markPaymentPaid(registrationId){

  if(!registrationId) return;

  const confirmed = confirm(
    "Tandai pembayaran ini sebagai sudah lunas?"
  );

  if(!confirmed) return;

  const {error} = await db
    .from("registrations")
    .update({
      payment_status: "paid"
    })
    .eq("id", registrationId);

  if(error){
    alert("Gagal memperbarui pembayaran: " + error.message);
    return;
  }

  alert("Pembayaran berhasil ditandai lunas.");

  loadPayments();
}
// ================= LAPORAN =================

async function loadReport(){

  const monthInput = $("reportMonth");

  if(monthInput && !monthInput.value){
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2,"0");
    monthInput.value = `${now.getFullYear()}-${month}`;
  }

  const selectedMonth = monthInput?.value || "";

  // ================= PEMASUKAN =================
  const {data:regs,error:regError} = await db
    .from("registrations")
    .select("payment_status,sports_events(fee,event_date)");

  if(regError){
    console.error(regError);
    return;
  }

  let income = 0;

  (regs || []).forEach(r => {

    const eventDate = r.sports_events?.event_date || "";
    const fee = Number(r.sports_events?.fee || 0);

    if(
      r.payment_status === "paid" &&
      (!selectedMonth || eventDate.startsWith(selectedMonth))
    ){
      income += fee;
    }

  });

  // ================= PENGELUARAN =================
  const {data:expenses,error:expenseError} = await db
    .from("expenses")
    .select("amount,expense_date");

  if(expenseError){
    console.error(expenseError);
    return;
  }

  let expense = 0;

  (expenses || []).forEach(e => {

    const expenseDate = e.expense_date || "";

    if(
      !selectedMonth ||
      expenseDate.startsWith(selectedMonth)
    ){
      expense += Number(e.amount || 0);
    }

  });

  // ================= SALDO =================
  const balance = income - expense;

  $("reportIncome").textContent = rupiah(income);
  $("reportExpense").textContent = rupiah(expense);
  $("reportBalance").textContent = rupiah(balance);

  $("reportSummary").innerHTML = `
    <tr>
      <td>Total Iuran Dibayar</td>
      <td>${rupiah(income)}</td>
    </tr>
    <tr>
      <td>Total Pengeluaran</td>
      <td>${rupiah(expense)}</td>
    </tr>
    <tr>
      <td><strong>Saldo</strong></td>
      <td><strong>${rupiah(balance)}</strong></td>
    </tr>
  `;
}

 
if($("reportMonth")){
  $("reportMonth").onchange=function(){
    loadReport();
  };
}
async function loadExpenses(){


  const list=$("expenseList");

  if(!list) return;

  msg("expenseMsg","Memuat data pengeluaran...");

  const {data,error}=await db
    .from("expenses")
    .select("id,expense_name,expense_date,amount,notes")
    .order("expense_date",{ascending:false})
    .order("id",{ascending:false});

  if(error){
    msg("expenseMsg",error.message,"error");
    return;
  }

  let total=0;

  if(!data || data.length===0){

    list.innerHTML=`
      <tr>
        <td colspan="5">Belum ada data pengeluaran.</td>
      </tr>
    `;

    $("expenseTotal").textContent=rupiah(0);
    msg("expenseMsg","");
    return;
  }

  list.innerHTML=data.map((e,index)=>{

    const amount=Number(e.amount||0);

    total+=amount;

    return `
      <tr>
        <td>${index+1}</td>
        <td>${e.expense_date||"-"}</td>
        <td>${esc(e.expense_name||"-")}</td>
        <td>${rupiah(amount)}</td>
        <td>${esc(e.notes||"-")}</td>
        <td>
  <button
    class="btn light"
    onclick="editExpense('${e.id}')">
    ✏️ Edit
  </button>

  <button
    class="danger"
    onclick="deleteExpense('${e.id}')">
    🗑️ Hapus
  </button>
</td>
      </tr>
    `;

  }).join("");

  $("expenseTotal").textContent=rupiah(total);

  msg("expenseMsg","");
}

async function addExpense(){
if(window.editingExpenseId){

  const id=window.editingExpenseId;

  const name=$("expenseName").value.trim();
  const date=$("expenseDate").value;
  const amount=Number($("expenseAmount").value||0);
  const notes=$("expenseNote").value.trim();

  if(!name || !date || amount<=0){
    msg(
      "expenseMsg",
      "Nama, tanggal, dan nominal wajib diisi.",
      "error"
    );
    return;
  }

  const {error}=await db
    .from("expenses")
    .update({
      expense_name:name,
      expense_date:date,
      amount:amount,
      notes:notes
    })
    .eq("id",id);

  if(error){
    msg("expenseMsg",error.message,"error");
    return;
  }

  window.editingExpenseId=null;
 $("addExpense").textContent="➕ Tambah Pengeluaran";

  $("expenseName").value="";
  $("expenseDate").value="";
  $("expenseAmount").value="";
  $("expenseNote").value="";

  msg(
    "expenseMsg",
    "Pengeluaran berhasil diperbarui.",
    "success"
  );

  await loadExpenses();
  return;
}
  const name=$("expenseName").value.trim();
  const date=$("expenseDate").value;
  const amount=Number($("expenseAmount").value||0);
  const notes=$("expenseNote").value.trim();

  if(!name || !date || amount<=0){
    msg(
      "expenseMsg",
      "Nama, tanggal, dan nominal wajib diisi.",
      "error"
    );
    return;
  }

  msg("expenseMsg","Menyimpan pengeluaran...");

  const {error}=await db
    .from("expenses")
    .insert({
      expense_name:name,
      expense_date:date,
      amount:amount,
      notes:notes
    });

  if(error){
    msg("expenseMsg",error.message,"error");
    return;
  }

  $("expenseName").value="";
  $("expenseDate").value="";
  $("expenseAmount").value="";
  $("expenseNote").value="";

  msg(
    "expenseMsg",
    "Pengeluaran berhasil ditambahkan.",
    "success"
  );

  await loadExpenses();
}
async function editExpense(id){

  const {data,error}=await db
    .from("expenses")
    .select("expense_name,expense_date,amount,notes")
    .eq("id",id)
    .single();

  if(error){
    alert(error.message);
    return;
  }

  $("expenseName").value=data.expense_name||"";
  $("expenseDate").value=data.expense_date||"";
  $("expenseAmount").value=data.amount||"";
  $("expenseNote").value=data.notes||"";

  window.editingExpenseId=id;
 $("addExpense").textContent="💾 Simpan Perubahan";

  $("expenseMsg").textContent="Mode edit aktif. Ubah data lalu klik Simpan Perubahan.";
}

// ================= MENU IURAN =================

if($("paymentsBtn")){

  $("paymentsBtn").onclick=()=>{

    const dashboard=$("adminPage");

    if(dashboard){

      [...dashboard.children].forEach(el=>{
        el.style.display="none";
      });

      const payments=$("paymentsSection");

      if(payments){
        payments.style.display="block";
      }
    }

    document.querySelectorAll(".sidebar-item").forEach(btn=>{
      btn.classList.remove("active");
    });

    $("paymentsBtn").classList.add("active");

    loadPayments();
  };

}

// ================= END IURAN & PEMBAYARAN =================
// ================= GANTI PASSWORD ADMIN =================

$("changeAdminPasswordBtn").onclick = async () => {

  const newPassword = $("newAdminPassword").value.trim();
  const confirmPassword = $("confirmAdminPassword").value.trim();

  if (!user) {
    msg("changePasswordMsg", "Sesi login tidak ditemukan.", "error");
    return;
  }

  if (!profile || profile.role !== "admin") {
    msg("changePasswordMsg", "Fitur ini hanya untuk Administrator.", "error");
    return;
  }

  if (newPassword.length < 6) {
    msg(
      "changePasswordMsg",
      "Password minimal 6 karakter.",
      "error"
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    msg(
      "changePasswordMsg",
      "Konfirmasi password tidak sama.",
      "error"
    );
    return;
  }

  const button = $("changeAdminPasswordBtn");

  button.disabled = true;
  button.textContent = "⏳ Menyimpan...";

  try {

    const { error } = await db.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    $("newAdminPassword").value = "";
    $("confirmAdminPassword").value = "";

    msg(
      "changePasswordMsg",
      "✅ Password Administrator berhasil diganti.",
      "success"
    );

  } catch (e) {

    msg(
      "changePasswordMsg",
      "Gagal mengganti password: " + (e.message || String(e)),
      "error"
    );

  } finally {

    button.disabled = false;
    button.textContent = "🔒 Simpan Password";

  }

};

// ================= END GANTI PASSWORD ADMIN =================
// ================= MANAJEMEN PENGGUNA =================

async function loadUsers(){

  const list = $("usersList");
  if(!list) return;

  list.innerHTML = `
    <tr>
      <td colspan="5">Memuat pengguna...</td>
    </tr>
  `;

  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, username, role")
    .order("full_name", { ascending:true });

  if(error){

    list.innerHTML = `
      <tr>
        <td colspan="5">Gagal memuat pengguna.</td>
      </tr>
    `;

    msg("usersMsg", error.message, "error");
    return;
  }

  if(!data || data.length === 0){

    list.innerHTML = `
      <tr>
        <td colspan="5">Belum ada pengguna.</td>
      </tr>
    `;

    return;
  }

  list.innerHTML = data.map((u,index)=>`

    <tr>

      <td>${index + 1}</td>

      <td>${esc(u.full_name || "-")}</td>

      <td>${esc(u.username || "-")}</td>

     <td>
  <span class="role-badge ${u.role === "admin" ? "role-admin" : "role-member"}">
    ${u.role === "admin" ? "👑 Admin" : "👤 Member"}
  </span>
</td>

      <td>
        <button
          class="btn light"
          onclick="changeUserRole('${u.id}','${u.role}')"
        >
          ${u.role === "admin" ? "👤 Jadikan Member" : "👑 Jadikan Admin"}
        </button>
      </td>

    </tr>

  `).join("");

  msg("usersMsg","");
}
async function changeUserRole(userId, currentRole){

  if(!userId) return;

  const newRole = currentRole === "admin"
    ? "member"
    : "admin";

  const confirmed = confirm(
    `Ubah role pengguna menjadi ${newRole === "admin" ? "Admin" : "Member"}?`
  );

  if(!confirmed) return;

  const { error } = await db
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if(error){

    msg(
      "usersMsg",
      "Gagal mengubah role: " + error.message,
      "error"
    );

    return;
  }

  msg(
    "usersMsg",
    "Role berhasil diubah menjadi " +
    (newRole === "admin" ? "Admin." : "Member."),
    "success"
  );

  await loadUsers();
}
// ================= END MANAJEMEN PENGGUNA =================
