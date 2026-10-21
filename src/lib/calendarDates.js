export const TYPE_LABELS={booking:"Booking",reservation:"Reservation",note:"Note",event:"Event"};
export const ENTRY_STATUS_LABELS={pending:"Pending",confirmed:"Confirmed",cancelled:"Cancelled",completed:"Completed"};
export const BOOKING_STATUS_LABELS={pending:"Pending",confirmed:"Confirmed",ready:"Ready",rented:"Rented",returned:"Returned",completed:"Completed",cancelled:"Cancelled",rejected:"Rejected",overdue:"Overdue"};
export const WEEKDAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DAY_MS=86400000;

// DATE columns come back from mysql2 as Date objects at UTC midnight (the pool
// runs timezone "Z"), and TIME columns as plain "HH:MM:SS" strings. A Date must
// be read with toISOString(), never String() -- String(date) gives
// "Tue Sep 29 2026 ...", whose first 10 characters are not a date at all. The
// text branch keeps this correct if a driver ever returns raw SQL dates.
export const dayKey=value=>value instanceof Date?value.toISOString().slice(0,10):String(value??"").slice(0,10);
export const clock=value=>typeof value==="string"?value.slice(0,5):"";
export const isoUtc=date=>date.toISOString().slice(0,10);
const pad=n=>String(n).padStart(2,"0");

// "Today" is what the admin's own clock says, not the UTC date: between
// midnight and 8 am in the Philippines the UTC date is still yesterday.
export const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};

export const addDays=(key,n)=>isoUtc(new Date(Date.parse(`${key}T00:00:00Z`)+n*DAY_MS));
export const weekStart=key=>addDays(key,-new Date(`${key}T00:00:00Z`).getUTCDay());
export const parseKey=key=>{const [y,m,d]=dayKey(key).split("-").map(Number);return {year:y,month:m-1,day:d}};
export const longDate=key=>{const {year,month,day}=parseKey(key);return `${MONTH_NAMES[month]} ${day}, ${year}`};
export const shortDate=key=>{
  const {month,day}=parseKey(key);
  const dow=WEEKDAYS[new Date(`${dayKey(key)}T00:00:00Z`).getUTCDay()];
  return `${dow}, ${MONTH_NAMES[month].slice(0,3)} ${day}`;
};

// "09:00" -> "9:00 AM"
export const timeLabel=value=>{
  const text=clock(value);
  if(!text) return "";
  const [h,m]=text.split(":").map(Number);
  return `${h%12||12}:${pad(m)} ${h<12?"AM":"PM"}`;
};

// mysql2 hands back a UTC Date for DATETIME, but stay correct if a driver
// change ever returns the raw "YYYY-MM-DD HH:MM:SS" text instead.
export const reminderToForm=value=>{
  if(!value) return "";
  return typeof value==="string"?value.slice(0,16).replace(" ","T"):new Date(value).toISOString().slice(0,16);
};

export const blankForm=date=>({
  entry_type:"reservation",title:"",customer_name:"",customer_email:"",customer_phone:"",
  entry_date:date,start_time:"",end_time:"",guests:"",location:"",
  status:"pending",reminder_at:"",details:"",notes:""
});
export const entryToForm=entry=>({
  entry_type:entry.entry_type||"reservation",
  title:entry.title||"",
  customer_name:entry.customer_name||"",
  customer_email:entry.customer_email||"",
  customer_phone:entry.customer_phone||"",
  entry_date:dayKey(entry.entry_date),
  start_time:clock(entry.start_time),
  end_time:clock(entry.end_time),
  guests:entry.guests==null?"":String(entry.guests),
  location:entry.location||"",
  status:entry.status||"pending",
  reminder_at:reminderToForm(entry.reminder_at),
  details:entry.details||"",
  notes:entry.notes||""
});

// One activity per calendar entry per day, and one per day a rental covers.
// `matches` is the search/type/status filter from the page.
export function buildDayMap(entries,bookings,range,matches){
  const map=new Map();
  const target=key=>{
    if(!map.has(key)) map.set(key,[]);
    return map.get(key);
  };
  for(const entry of entries){
    if(!matches({kind:"entry",type:entry.entry_type,status:entry.status,title:entry.title,customer_name:entry.customer_name,location:entry.location,category:entry.category,notes:entry.notes,details:entry.details})) continue;
    target(dayKey(entry.entry_date)).push({kind:"entry",entry,status:entry.status,type:entry.entry_type,time:clock(entry.start_time)});
  }
  for(const booking of bookings){
    if(!matches({kind:"booking",type:"booking",status:booking.status,booking_no:booking.booking_no,customer_name:booking.customer_name,items:booking.items})) continue;
    const cursor=new Date(`${dayKey(booking.start_date)}T00:00:00Z`);
    const last=new Date(`${dayKey(booking.end_date)}T00:00:00Z`);
    while(cursor<=last){
      const key=isoUtc(cursor);
      if(key>=range.from&&key<=range.to) target(key).push({kind:"booking",booking,status:booking.status,type:"booking",time:""});
      cursor.setUTCDate(cursor.getUTCDate()+1);
    }
  }
  for(const list of map.values()){
    list.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")||(a.kind===b.kind?0:a.kind==="booking"?-1:1));
  }
  return map;
}

// What a chip or card needs to show for one activity on one day.
export function describeActivity(item,day){
  if(item.kind==="booking"){
    const b=item.booking;
    const first=dayKey(b.start_date)===day;
    const last=dayKey(b.end_date)===day;
    return {
      id:`b${b.id}`,
      tone:"booking",
      title:b.customer_name||b.booking_no,
      code:b.booking_no,
      time:"",
      marker:first&&last?"Out · Due":first?"Out":last?"Due":"",
      sub:b.items||"",
      status:b.status,
      statusLabel:BOOKING_STATUS_LABELS[b.status]||b.status
    };
  }
  const e=item.entry;
  return {
    id:`e${e.id}`,
    tone:e.entry_type,
    title:e.title,
    code:"",
    time:item.time,
    marker:"",
    sub:[e.customer_name,e.location].filter(Boolean).join(" · "),
    status:e.status,
    statusLabel:ENTRY_STATUS_LABELS[e.status]||e.status
  };
}
