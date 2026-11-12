import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const S="https://gzgeklcukrclgwbsmbsp.supabase.co",K=Deno.env.get("SUPABASE_ANON_KEY")||"",V="MONEYBALL GLOBAL 3.8";
const C={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-requested-with, prefer, cache-control, pragma","Access-Control-Allow-Methods":"POST, GET, OPTIONS","Access-Control-Max-Age":"86400","Vary":"Origin"};
const out=(x:any,n=200)=>new Response(JSON.stringify(x),{status:n,headers:{...C,"Content-Type":"application/json"}});

const EUROPE_ISO3 = new Set(["ALB","AND","ARM","AUT","AZE","BLR","BEL","BIH","BUL","CRO","CYP","CZE","DNK","ENG","EST","FRO","FIN","FRA","GEO","DEU","GER","GIB","GRC","GRE","HUN","ISL","IRL","ITA","KAZ","KOS","LVA","LIE","LTU","LUX","MLT","MDA","MNE","NLD","MKD","NIR","NOR","POL","PRT","POR","ROU","RUS","SMR","SCO","SRB","SVK","SVN","ESP","SWE","CHE","SUI","TUR","UKR","WAL","GBR","UK"]);
const EUROPE_COUNTRIES = new Set(["albania","andorra","armenia","austria","azerbaijan","belarus","belgium","bosnia and herzegovina","bulgaria","croatia","cyprus","czechia","czech republic","denmark","england","estonia","faroe islands","finland","france","georgia","germany","gibraltar","greece","hungary","iceland","ireland","isle of man","italy","kazakhstan","kosovo","latvia","liechtenstein","lithuania","luxembourg","malta","moldova","monaco","montenegro","netherlands","north macedonia","northern ireland","norway","poland","portugal","romania","russia","san marino","scotland","serbia","slovakia","slovenia","spain","sweden","switzerland","turkey","türkiye","ukraine","wales","united kingdom","uk","europe","uefa"]);
function isEuropeanFixture(country: unknown, competition: unknown, home?: unknown, away?: unknown): boolean {
 const norm=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 const c=norm(country), comp=norm(competition), teams=norm(String(home??"")+" "+String(away??""));
 const parts=c.split(/[\/,;|]+/).map((x:string)=>x.trim()).filter(Boolean);
 if(EUROPE_COUNTRIES.has(c)||parts.some((x:string)=>EUROPE_COUNTRIES.has(x)||EUROPE_ISO3.has(x.toUpperCase()))||EUROPE_ISO3.has(String(country??"").trim().toUpperCase()))return true;
 if(/\buefa\b|european (championship|qualif|league)|uefa nations|uefa champions|uefa europa|uefa conference/.test(comp))return true;
 if(/\bu20 elite league\b/.test(comp)&&/\b(england|italy|portugal|czech republic|germany|france|spain|netherlands|belgium|sweden|norway|denmark|finland|iceland|poland|croatia|serbia|austria|switzerland|scotland|wales|ireland)\b/.test(teams))return true;
 return false;
}

async function db(p:string,t:string,m="GET",b?:any,prefer="return=representation"){const r=await fetch(S+"/rest/v1/"+p,{method:m,headers:{apikey:K,Authorization:"Bearer "+t,"Content-Type":"application/json",Prefer:prefer},body:b===undefined?undefined:JSON.stringify(b)});const s=await r.text();let j:any;try{j=s?JSON.parse(s):null}catch{j=s}if(!r.ok)throw Error(j?.message||j?.details||"DB HTTP "+r.status);return j;}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function normTeam(v:any){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|sc|ac|afc|club)\b/g," ").replace(/\b(women|w)\b/g," women ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");}
const ELO_ALIASES:Record<string,string>={
 "man city":"manchester city","man utd":"manchester united","man united":"manchester united",
 "spurs":"tottenham hotspurs","tottenham hotspur":"tottenham hotspurs","nott m forest":"nottingham forest",
 "bayer 04 leverkusen":"leverkusen","bayer leverkusen":"leverkusen",
 "borussia monchengladbach":"monchengladbach","eintracht frankfurt":"frankfurt",
 "ogc nice":"nice","as monaco":"monaco","losc lille":"lille","rc strasbourg alsace":"strasbourg",
 "deportivo alaves":"alaves","celta":"celta vigo","tsg hoffenheim":"hoffenheim",
 "us lecce":"lecce","aj auxerre":"auxerre","olympique lyonnais":"lyon","stade brestois 29":"brest",
 "vitoria guimaraes":"vitoria","sporting cp":"sporting lisbon","rc deportivo":"deportivo",
 "west ham united":"west ham","wolverhampton wanderers":"wolves","heart of midlothian":"hearts",
 "coventry":"coventry city","leeds":"leeds united","hull":"hull city","ipswich":"ipswich",
 "newcastle":"newcastle united","athletic bilbao":"athletic","inter milan":"inter",
 "ac milan":"milan","atletico de madrid":"atletico madrid","paris sg":"paris saint germain"
};
function eloKey(v:any){const k=normTeam(v).replace(/^\d+\.?\s*/,"").trim();return ELO_ALIASES[k]||k;}
function findEloRating(team:string,ratings:Map<string,any>){
 const key=eloKey(team),exact=ratings.get(key);if(exact)return exact;
 const tokens=(v:string)=>new Set(eloKey(v).split(" ").filter(x=>x.length>2));
 const a=tokens(team);if(a.size<2)return null;
 const candidates:any[]=[];
 for(const rating of new Set(ratings.values())){
  const names=[String(rating.name||""),String(rating.slug||"")].filter(Boolean);
  let score=0;
  for(const name of names){
   const b=tokens(name);if(!b.size)continue;
   const intersection=[...a].filter(x=>b.has(x)).length;
   const union=new Set([...a,...b]).size;
   score=Math.max(score,intersection/Math.max(1,union));
   const ka=eloKey(team),kb=eloKey(name);
   if(ka.length>=6&&(kb.includes(ka)||ka.includes(kb)))score=Math.max(score,0.9);
  }
  if(score>=0.85)candidates.push({rating,score});
 }
 candidates.sort((x,y)=>y.score-x.score);
 if(!candidates.length)return null;
 if(candidates[1]&&candidates[0].score-candidates[1].score<0.12)return null;
 return candidates[0].rating;
}
function wordNumber(v:string){const x=String(v||"").toLowerCase();const map:Record<string,number>={no:0,none:0,zero:0,one:1,two:2,three:3,four:4,five:5};return map[x]??(Number.isFinite(Number(x))?Number(x):NaN);}
function readCachedFootyForm(notes:string,home:string,away:string){
 try{
  const marker="[MONEYBALL_FORM]",i=String(notes||"").indexOf(marker);if(i<0)return null;
  const line=String(notes).slice(i+marker.length).split(/\r?\n/)[0].trim(),v=JSON.parse(line);
  const age=Date.now()-new Date(v.fetched_at||0).getTime();
  if(!Number.isFinite(age)||age<0||age>6*60*60*1000)return null;
  if(normTeam(v.home_name)!==normTeam(home)||normTeam(v.away_name)!==normTeam(away))return null;
  const h=v.home,a=v.away;
  if(!h||!a||h.w+h.d+h.l!==5||a.w+a.d+a.l!==5)return null;
  return {home:h,away:a,source:"FOOTYNOMAD_LAST5_CACHE"};
 }catch(_){return null;}
}
function mergeFootyFormNotes(notes:string,home:string,away:string,form:any){
 const marker="[MONEYBALL_FORM]",publicMarker="[MONEYBALL_PUBLIC_DATA]",raw=String(notes||"");
 const publicAt=raw.indexOf(publicMarker);
 let prefix=publicAt>=0?raw.slice(0,publicAt).trim():raw.trim();
 const oldFormAt=prefix.indexOf(marker);if(oldFormAt>=0)prefix=prefix.slice(0,oldFormAt).trim();
 const suffix=publicAt>=0?raw.slice(publicAt).trim():"";
 const saved=marker+JSON.stringify({home_name:home,away_name:away,home:form.home,away:form.away,fetched_at:new Date().toISOString()});
 return [prefix,saved,suffix].filter(Boolean).join("\n\n");
}
async function readFootyNomadForm(id:string,expectedHome:string,expectedAway:string){
 try{
  const r=await fetch("https://footynomad.com/fixture/"+encodeURIComponent(id),{headers:{"User-Agent":"Mozilla/5.0 MoneyballGlobal/2.0","Accept":"text/html"},signal:AbortSignal.timeout(6500)});
  if(!r.ok)return null;
  const html=await r.text(),text=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&#39;|&apos;/g,"'").replace(/\s+/g," ");
  const m=text.match(/Going into this match,\s*(.+?)\s+have won\s+(no|none|zero|one|two|three|four|five|\d+),\s+drawn\s+(no|none|zero|one|two|three|four|five|\d+)\s+and lost\s+(no|none|zero|one|two|three|four|five|\d+)\s+of their last five;\s*(.+?)\s+have won\s+(no|none|zero|one|two|three|four|five|\d+),\s+drawn\s+(no|none|zero|one|two|three|four|five|\d+)\s+and lost\s+(no|none|zero|one|two|three|four|five|\d+)\s+of their last five/i);
  if(!m||normTeam(m[1])!==normTeam(expectedHome)||normTeam(m[5])!==normTeam(expectedAway))return null;
  const h={w:wordNumber(m[2]),d:wordNumber(m[3]),l:wordNumber(m[4])},a={w:wordNumber(m[6]),d:wordNumber(m[7]),l:wordNumber(m[8])};
  if([h.w,h.d,h.l,a.w,a.d,a.l].some(x=>!Number.isFinite(x)||x<0)||h.w+h.d+h.l!==5||a.w+a.d+a.l!==5)return null;
  return {home:h,away:a,source:"FOOTYNOMAD_LAST5"};
 }catch(_){return null;}
}
async function limitedSettled<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>):Promise<PromiseSettledResult<R>[]>{const out:any[]=new Array(items.length);let cursor=0;const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=cursor++;if(i>=items.length)return;try{out[i]={status:"fulfilled",value:await fn(items[i])};}catch(reason){out[i]={status:"rejected",reason};}}});await Promise.all(workers);return out;}
function formFromPublic(f:any){
 const games=Array.isArray(f?.last10)?f.last10:(Array.isArray(f?.last5)?f.last5:[]);
 if(!games.length)return null;
 const w=games.filter((x:any)=>x.result==="W").length,d=games.filter((x:any)=>x.result==="D").length,l=games.filter((x:any)=>x.result==="L").length;
 const gf=games.reduce((s:number,x:any)=>s+Number(x.goals_for||0),0),ga=games.reduce((s:number,x:any)=>s+Number(x.goals_against||0),0);
 return {w,d,l,matches:games.length,goals_for:gf,goals_against:ga,source:[f?.source,f?.home_form?.source,f?.away_form?.source].includes("ESPN_WOMEN_LAST10")?"ESPN_WOMEN_LAST10":"OPENMATCHDAY_LAST10",last10:games,elo:f?.elo==null?null:Number(f.elo),rd:f?.rd==null?null:Number(f.rd),hfa:f?.hfa==null?null:Number(f.hfa),elo_as_of:f?.elo_as_of||null};
}
async function readPublicSourceForms(date:string){
 const byPair=new Map<string,any>(),byTeam=new Map<string,any[]>(),eloByTeam=new Map<string,any>();
 try{
  const r=await fetch(S+"/functions/v1/moneyball-public-sources?date="+encodeURIComponent(date),{headers:{apikey:K,Accept:"application/json"},signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw new Error("Public sources HTTP "+r.status);
  const j=await r.json();
   const eloMeta={as_of:j?.elo_ratings?.as_of||null,ratings_count:Number(j?.elo_ratings?.ratings_count||0)};
   for(const rating of (Array.isArray(j?.elo_ratings?.items)?j.elo_ratings.items:[])){
    const keys=[eloKey(rating.name),eloKey(rating.slug)].filter(Boolean);
    for(const key of keys)if(!eloByTeam.has(key))eloByTeam.set(key,rating);
   }
  for(const f of (Array.isArray(j?.fixtures)?j.fixtures:[])){
    const h=formFromPublic(f.home_form),a=formFromPublic(f.away_form);
    const genderKey=String(f.gender||"").toLowerCase()==="women"?"women":"men";
    if(h&&a)byPair.set(normTeam(f.home_team)+"|"+normTeam(f.away_team)+"|"+genderKey,{home:h,away:a,source:h.source==="ESPN_WOMEN_LAST10"||a.source==="ESPN_WOMEN_LAST10"?"ESPN_WOMEN_LAST10":"OPENMATCHDAY_LAST10"});
    // Preserve one-sided form when the opponent has no tracked league results.
    for(const [team,form] of [[f.home_team,h],[f.away_team,a]] as any[]){if(!form)continue;const key=normTeam(team),arr=byTeam.get(key)||[];arr.push({form,country:String(f.country||"").toLowerCase(),competition:String(f.competition||"").toLowerCase(),gender:genderKey});byTeam.set(key,arr);}
   }
  return {byPair,byTeam,eloByTeam,eloMeta,fixtures:Number(j?.european_fixtures||0),error:null};
 }catch(e){console.error("OpenMatchday supplemental form unavailable:",String(e));return {byPair,byTeam,eloByTeam,eloMeta:null,fixtures:0,error:String(e)};}
}
function publicFormForMatch(m:any,index:any){
 const targetGender=String(m.gender||"").toLowerCase()==="women"?"women":"men";
 const exact=index.byPair.get(normTeam(m.home_team)+"|"+normTeam(m.away_team)+"|"+targetGender);if(exact)return exact;
 const choose=(team:string)=>{const rows=(index.byTeam.get(normTeam(team))||[]).filter((x:any)=>targetGender==="women"?x.gender==="women":x.gender!=="women");if(!rows.length)return null;const country=String(m.country||"").toLowerCase(),comp=String(m.league||m.competition||"").toLowerCase();const ranked=rows.map((x:any)=>({...x,score:(country&&x.country.includes(country)?3:0)+(comp&&(x.competition.includes(comp)||comp.includes(x.competition))?2:0)})).sort((a:any,b:any)=>b.score-a.score);if(ranked.length>1&&ranked[0].score===ranked[1].score)return null;return ranked[0].form;};
  const home=choose(String(m.home_team)),away=choose(String(m.away_team));return home||away?{home,away,source:home?.source==="ESPN_WOMEN_LAST10"||away?.source==="ESPN_WOMEN_LAST10"?"ESPN_WOMEN_LAST10":"OPENMATCHDAY_LAST10"}:null;
}
function poisson(lambda:number,k:number){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;}
function historyModel(home:string,away:string,kickoff:string,history:any[],footyForm:any=null,publicForm:any=null,gender:string="men"){
 const cutoff=new Date(kickoff).getTime();
 const targetGender=String(gender||"unknown").toLowerCase();const teamRows=(team:string)=>history.filter((x:any)=>{const historyGender=String(x.gender||"unknown").toLowerCase();if(targetGender==="women"&&historyGender!=="women")return false;if(targetGender!=="women"&&historyGender==="women")return false;const t=x.kickoff_at?new Date(x.kickoff_at).getTime():x.kickoff_date?new Date(String(x.kickoff_date).slice(0,10)+"T00:00:00Z").getTime():NaN;if(!Number.isFinite(t)||t>=cutoff)return false;const rr=Array.isArray(x.match_results)?x.match_results[0]:x.match_results;if(!rr||rr.verified!==true||rr.home_score==null||rr.away_score==null||!Number.isInteger(Number(rr.home_score))||!Number.isInteger(Number(rr.away_score)))return false;return normTeam(x.home_team)===team||normTeam(x.away_team)===team;}).sort((a:any,b:any)=>new Date(b.kickoff_at||String(b.kickoff_date||"")+"T00:00:00Z").getTime()-new Date(a.kickoff_at||String(a.kickoff_date||"")+"T00:00:00Z").getTime()).slice(0,10).map((x:any)=>{const rr=Array.isArray(x.match_results)?x.match_results[0]:x.match_results;const isHome=normTeam(x.home_team)===team,gf=Number(isHome?rr.home_score:rr.away_score),ga=Number(isHome?rr.away_score:rr.home_score);return {date:String(x.kickoff_date||x.kickoff_at||"").slice(0,10),opponent:isHome?x.away_team:x.home_team,gf,ga,pts:gf>ga?3:gf===ga?1:0};});
 const hLocal=teamRows(normTeam(home)),aLocal=teamRows(normTeam(away)),hf={...(footyForm?.home||{}),...(publicForm?.home||{})},af={...(footyForm?.away||{}),...(publicForm?.away||{})};
 const choose=(local:any[],fallback:any)=>{
  const supplemental=Array.isArray(fallback?.last10)?fallback.last10:(Array.isArray(fallback?.last5)?fallback.last5:[]);
  const externalRows=supplemental.map((x:any)=>({date:String(x.date||"").slice(0,10),opponent:String(x.opponent||""),gf:Number(x.goals_for||0),ga:Number(x.goals_against||0),xg_for:x.xg_for==null?null:Number(x.xg_for),xg_against:x.xg_against==null?null:Number(x.xg_against),pts:x.result==="W"?3:x.result==="D"?1:0}));
  const merged=[...local,...externalRows].filter((x:any)=>Number.isFinite(x.gf)&&Number.isFinite(x.ga)).sort((a:any,b:any)=>String(b.date||"").localeCompare(String(a.date||"")));
  const seen=new Set<string>(),rows=merged.filter((x:any)=>{const k=[x.date,normTeam(x.opponent),x.gf,x.ga].join("|");if(seen.has(k))return false;seen.add(k);return true;}).slice(0,10);
  if(rows.length>=3)return {rows,matches:rows.length,form:fallback||null,source:fallback?.source||"VERIFIED_MATCH_HISTORY"};
   const fallbackMatches=Number(fallback?.matches||((Number(fallback?.w)||0)+(Number(fallback?.d)||0)+(Number(fallback?.l)||0)));if(fallback&&fallbackMatches>=3)return {rows,matches:fallbackMatches,form:fallback,source:fallback.source||"FOOTYNOMAD_LAST5"};
  if(local.length)return {rows:local,matches:local.length,form:null,source:"PARTIAL_VERIFIED_HISTORY"};
  return {rows:[],matches:0,form:null,source:"BASELINE_ONLY"};
 };
 const hs=choose(hLocal,hf),as=choose(aLocal,af),avg=(xs:any[],k:string)=>xs.length?xs.reduce((s,x)=>s+Number(x[k]||0),0)/xs.length:0,hn=hs.matches,an=as.matches,n=Math.min(hn,an);
 let p1:number,px:number,p2:number,method:string,xgUsed=false,xgHomeMatches=0,xgAwayMatches=0;
 if(hs.rows.length>=3&&as.rows.length>=3){
  const hxgRows=Array.isArray(hf?.xg_last10)?hf.xg_last10.filter((x:any)=>String(x.date||"")<String(kickoff||"").slice(0,10)):hs.rows.filter((x:any)=>x.xg_for!=null&&x.xg_against!=null),axgRows=Array.isArray(af?.xg_last10)?af.xg_last10.filter((x:any)=>String(x.date||"")<String(kickoff||"").slice(0,10)):as.rows.filter((x:any)=>x.xg_for!=null&&x.xg_against!=null),hxg=hxgRows.length,axg=axgRows.length,useXg=hxg>=3&&axg>=3; xgUsed=useXg; xgHomeMatches=hxg; xgAwayMatches=axg; const homeAttack=useXg?0.65*avg(hxgRows,"xg_for")+0.35*avg(hs.rows,"gf"):avg(hs.rows,"gf"),homeDefence=useXg?0.65*avg(hxgRows,"xg_against")+0.35*avg(hs.rows,"ga"):avg(hs.rows,"ga"),awayAttack=useXg?0.65*avg(axgRows,"xg_for")+0.35*avg(as.rows,"gf"):avg(as.rows,"gf"),awayDefence=useXg?0.65*avg(axgRows,"xg_against")+0.35*avg(as.rows,"ga"):avg(as.rows,"ga"),lh=clamp(((homeAttack+awayDefence)/2)*1.06,0.15,3.6),la=clamp(((awayAttack+homeDefence)/2)*0.94,0.15,3.6),hp=Array.from({length:9},(_,i)=>poisson(lh,i)),ap=Array.from({length:9},(_,i)=>poisson(la,i));
  p1=0;px=0;p2=0;for(let i=0;i<9;i++)for(let j=0;j<9;j++){const q=hp[i]*ap[j];if(i>j)p1+=q;else if(i===j)px+=q;else p2+=q;}const sum=p1+px+p2;p1/=sum;px/=sum;p2/=sum;
  method=useXg?"Model Poissona: 65% średnie xG i xGA z ostatnich 10 meczów + 35% rzeczywiste gole, z korektą przewagi gospodarzy.":"Model Poissona na podstawie średnich goli strzelonych i straconych z ostatnich maksymalnie 10 spotkań, z niewielką korektą przewagi gospodarzy.";
 }else{
  const points=(s:any)=>s.rows.length?avg(s.rows,"pts"):(s.form?(Number(s.form.w||0)*3+Number(s.form.d||0))/Math.max(1,Number(s.form.matches||5)):1.25);
  const gd=(s:any)=>s.rows.length?avg(s.rows,"gf")-avg(s.rows,"ga"):(s.form&&s.form.goals_for!=null?(Number(s.form.goals_for)-Number(s.form.goals_against))/Math.max(1,Number(s.form.matches||5)):0);
  const diff=clamp(((points(hs)-points(as))*0.58+(gd(hs)-gd(as))*0.22)*0.62+0.22,-1.8,1.8),share=1/(1+Math.exp(-diff)),draw=clamp(0.275-Math.abs(diff)*0.025,0.19,0.275);p1=(1-draw)*share;p2=(1-draw)*(1-share);px=draw;
  method="Model formy W/D/L i różnicy bramek z dostępnych ostatnich spotkań; ograniczone dane oznaczają niższe pokrycie.";
 }
  let eloUsed=false,eloDiff:number|null=null,eloWeight=0,eloAsOf:string|null=null,eloHome:number|null=null,eloAway:number|null=null;
  const eh=Number(hf?.elo),ea=Number(af?.elo),rh=Number(hf?.rd),ra=Number(af?.rd),homeHfa=Number(hf?.hfa);
  if(Number.isFinite(eh)&&Number.isFinite(ea)&&Number.isFinite(rh)&&Number.isFinite(ra)){
   const drawPrior=clamp(px,0.18,0.34),expected=1/(1+Math.pow(10,-((eh-ea+(Number.isFinite(homeHfa)?homeHfa:45))/400)));
   let eloP1=clamp(expected-drawPrior/2,0,1),eloP2=clamp(1-expected-drawPrior/2,0,1);
   const remainder=1-drawPrior,eloSum=eloP1+eloP2;
   if(eloSum>0){eloP1=eloP1/eloSum*remainder;eloP2=eloP2/eloSum*remainder;}
   const avgRd=(rh+ra)/2;eloWeight=clamp(0.22*(100-avgRd)/35,0.05,0.22);
   if(hn===0&&an===0){p1=eloP1;px=drawPrior;p2=eloP2;eloWeight=1;method="Model Elo BeyondELO: rating obu klubów i przewaga własnego boiska; brak historii formy.";}
   else {p1=p1*(1-eloWeight)+eloP1*eloWeight;p2=p2*(1-eloWeight)+eloP2*eloWeight;method+=" Uzupełniono ratingiem Elo BeyondELO.";}
   eloUsed=true;eloHome=eh;eloAway=ea;eloDiff=+(eh-ea).toFixed(1);eloAsOf=hf?.elo_as_of||af?.elo_as_of||null;
  }
  const total=p1+px+p2;
  let source="BASELINE_ONLY";
  if(hs.source==="OPENMATCHDAY_GITHUB_LAST10"||as.source==="OPENMATCHDAY_GITHUB_LAST10")source="OPENMATCHDAY_GITHUB_LAST10";
  else if(hs.source==="ESPN_WOMEN_LAST10"||as.source==="ESPN_WOMEN_LAST10")source="ESPN_WOMEN_LAST10";
   else if(hs.source==="OPENMATCHDAY_LAST10"||as.source==="OPENMATCHDAY_LAST10")source="OPENMATCHDAY_LAST10";
  else if(hs.source==="VERIFIED_MATCH_HISTORY"&&as.source==="VERIFIED_MATCH_HISTORY")source="VERIFIED_MATCH_HISTORY";
  else if(footyForm)source="FOOTYNOMAD_LAST5";
  else if(hn>0||an>0)source="PARTIAL_VERIFIED_HISTORY";
  if(eloUsed&&hn===0&&an===0)source="BEYONDELO_ONLY";
  const coverage=source==="BEYONDELO_ONLY"?35:(n>0?Math.min(75,n*15):(eloUsed?35:0));
  return {p1:+(p1/total*100).toFixed(1),px:+(px/total*100).toFixed(1),p2:+(p2/total*100).toFixed(1),coverage,home_matches:hn,away_matches:an,home_form:Object.keys(hf).length?hf:null,away_form:Object.keys(af).length?af:null,source,footyForm:!!footyForm,publicForm:source==="OPENMATCHDAY_LAST10"||source==="ESPN_WOMEN_LAST10",espnWomenForm:source==="ESPN_WOMEN_LAST10",pitchForm:source==="PITCHAPI_LAST5",method,xg_used:xgUsed,xg_home_matches:xgHomeMatches,xg_away_matches:xgAwayMatches,elo_used:eloUsed,elo_home:eloHome,elo_away:eloAway,elo_diff:eloDiff,elo_weight:eloWeight,elo_as_of:eloAsOf};
 return {p1:+(p1/total*100).toFixed(1),px:+(px/total*100).toFixed(1),p2:+(p2/total*100).toFixed(1),coverage:Math.min(75,n*15),home_matches:hn,away_matches:an,home_form:hf||null,away_form:af||null,source,footyForm:!!footyForm,publicForm:source==="OPENMATCHDAY_LAST10",pitchForm:source==="PITCHAPI_LAST5",method};
}
async function readGitHubPublicTeamHistory(){
 try{
  const r=await fetch("https://raw.githubusercontent.com/damianwalus3-jpg/moneyball-global-web/main/public-data/team-form.json",{headers:{"Accept":"application/json","Cache-Control":"no-cache"},signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw new Error("GitHub public history HTTP "+r.status);
  const data=await r.json();
  if(data?.schema_version!==1||!data?.teams||Object.keys(data.teams).length<100)throw new Error("GitHub public history validation failed");
  return data;
 }catch(e){return {teams:{},error:String(e),generated_at:null,coverage:null};}
}
async function readOpenPlayXgData(){
 try{const r=await fetch("https://raw.githubusercontent.com/damianwalus3-jpg/moneyball-global-web/main/public-data/openplay-xg.json",{headers:{"Accept":"application/json","Cache-Control":"no-cache"},signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error("OpenPlay xG HTTP "+r.status);const data=await r.json();if(data?.schema_version!==1||!data?.teams||Object.keys(data.teams).length<100)throw new Error("OpenPlay xG validation failed");return data;}catch(e){console.error("OpenPlay xG history unavailable:",String(e));return {teams:{},error:String(e),generated_at:null,coverage:null};}
}
function githubTeamForm(team:string,kickoff:string,data:any,xgData:any=null){
 const key=normTeam(team),teams=data?.teams||{},xgTeams=xgData?.teams||{};let resolvedKey=key,entry=teams[key];
 if(!entry){
  const a=new Set(key.split(" ").filter(x=>x.length>2));
  const candidates=Object.keys(teams).map(k=>{const b=new Set(k.split(" ").filter(x=>x.length>2));return {k,score:a.size&&b.size?[...a].filter(x=>b.has(x)).length/Math.max(a.size,b.size):0};}).filter(x=>x.score>=0.8).sort((x,y)=>y.score-x.score);
  if(candidates.length&&(!candidates[1]||candidates[0].score-candidates[1].score>=0.12)){resolvedKey=candidates[0].k;entry=teams[resolvedKey];}}
 }
 if(!entry){const xgCandidates=Object.keys(xgTeams).map(k=>{const b=new Set(k.split(" ").filter(x=>x.length>2));return {k,score:a.size&&b.size?[...a].filter(x=>b.has(x)).length/Math.max(a.size,b.size):0};}).filter(x=>x.score>=0.8).sort((x,y)=>y.score-x.score);if(xgCandidates.length&&(!xgCandidates[1]||xgCandidates[0].score-xgCandidates[1].score>=0.12))resolvedKey=xgCandidates[0].k;const xgOnly=xgTeams[resolvedKey];if(Array.isArray(xgOnly?.matches))entry={matches:xgOnly.matches.map((x:any)=>({...x,result:x.result||"D"}))};}if(!entry||!Array.isArray(entry.matches))return null;
 const cutoff=String(kickoff||"").slice(0,10),last=entry.matches.filter((x:any)=>String(x.date||"")<cutoff).sort((a:any,b:any)=>String(b.date).localeCompare(String(a.date))).slice(0,10);
 if(!last.length)return null;
 const w=last.filter((x:any)=>x.result==="W").length,d=last.filter((x:any)=>x.result==="D").length,l=last.filter((x:any)=>x.result==="L").length;
 const mean=(k:string)=>{const vals=last.map((x:any)=>x[k]).filter((x:any)=>x!==null&&x!==undefined&&Number.isFinite(Number(x)));return vals.length?+(vals.reduce((s:number,v:any)=>s+Number(v),0)/vals.length).toFixed(2):null;};
 const xgKey=resolvedKey;const xgEntry=xgTeams[xgKey];const xgCutoff=String(kickoff||"").slice(0,10);const xgLast=Array.isArray(xgEntry?.matches)?xgEntry.matches.filter((x:any)=>String(x.date||"")<xgCutoff&&x.xg_for!=null&&x.xg_against!=null&&Number.isFinite(Number(x.xg_for))&&Number.isFinite(Number(x.xg_against))).sort((a:any,b:any)=>String(b.date).localeCompare(String(a.date))).slice(0,10).map((x:any)=>({date:x.date,opponent:x.opponent,xg_for:Number(x.xg_for),xg_against:Number(x.xg_against),goals_for:Number(x.goals_for),goals_against:Number(x.goals_against)})):[];return {matches:last.length,w,d,l,goals_for:last.reduce((s:number,x:any)=>s+Number(x.goals_for||0),0),goals_against:last.reduce((s:number,x:any)=>s+Number(x.goals_against||0),0),last10:last.map((x:any)=>({date:x.date,opponent:x.opponent,result:x.result,goals_for:x.goals_for,goals_against:x.goals_against,shots_for:x.shots_for,shots_against:x.shots_against,shots_on_target_for:x.shots_on_target_for,shots_on_target_against:x.shots_on_target_against,corners_for:x.corners_for,corners_against:x.corners_against,fouls_for:x.fouls_for,fouls_against:x.fouls_against,yellow_for:x.yellow_for,yellow_against:x.yellow_against,red_for:x.red_for,red_against:x.red_against})),xg_last10:xgLast,avg_shots_for:mean("shots_for"),avg_shots_against:mean("shots_against"),avg_shots_on_target_for:mean("shots_on_target_for"),avg_shots_on_target_against:mean("shots_on_target_against"),avg_corners_for:mean("corners_for"),avg_corners_against:mean("corners_against"),avg_fouls_for:mean("fouls_for"),source:"OPENMATCHDAY_GITHUB_LAST10"};
}

Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:C});try{
 if(req.method==="GET")return out({ok:true,model:V,provider:"Keyless GitHub OpenMatchday match history and stats + verified results + FootyNomad + fresh market probabilities",apiFootballDisabled:true});
 if(req.method!=="POST")return out({error:"POST required"},405);
 const token=req.headers.get("Authorization")?.replace("Bearer ","");if(!token)throw Error("Zaloguj się ponownie.");
 const body=await req.json().catch(()=>({})),date=String(body.date||new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Brussels",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
 const all=await db("matches?select=id,external_id,source,competition,league,country,home_team,away_team,kickoff_at,kickoff_date,status,notes&order=kickoff_at.asc",token);
 const dateFromExternalId=(m:any)=>String(m.kickoff_date||"").slice(0,10)||/:(\d{4}-\d{2}-\d{2}):/.exec(String(m.external_id||""))?.[1]||null;
  const matchDate=(m:any)=>m.kickoff_at?new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Brussels",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(m.kickoff_at)):dateFromExternalId(m);
  const matches=all.filter((m:any)=>isEuropeanFixture(m.country,m.league||m.competition,m.home_team,m.away_team)&&matchDate(m)===date);
 const historyFields="select=id,home_team,away_team,kickoff_at,kickoff_date,gender,match_results(home_score,away_score,verified)";
 const historyTimed=await db("matches?"+historyFields+"&kickoff_at=lt."+encodeURIComponent(date+"T23:59:59Z")+"&order=kickoff_at.desc&limit=3000",token).catch((e:any)=>{console.error("Timed history query unavailable:",String(e));return [];});
 const historyDateOnly=await db("matches?"+historyFields+"&kickoff_at=is.null&kickoff_date=lt."+encodeURIComponent(date)+"&limit=1000",token).catch((e:any)=>{console.error("Date-only history query unavailable:",String(e));return [];});
 const history=[...(historyTimed||[]),...(historyDateOnly||[])];
 const footyForms=new Map<string,any>(),formCandidates:any[]=[];
 for(const m of matches){
  if(!["scheduled","unknown"].includes(m.status)||new Date(m.kickoff_at).getTime()<=Date.now()||m.source!=="FootyNomad"||!/^\d+$/.test(String(m.external_id||"")))continue;
  const cached=readCachedFootyForm(String(m.notes||""),String(m.home_team),String(m.away_team));
  if(cached)footyForms.set(m.id,cached);else formCandidates.push(m);
 }
 const formResults=await limitedSettled(formCandidates,10,async(m:any)=>{
  const form=await readFootyNomadForm(String(m.external_id),String(m.home_team),String(m.away_team));
  if(form){const notes=mergeFootyFormNotes(String(m.notes||""),String(m.home_team),String(m.away_team),form);await db("matches?id=eq."+m.id,token,"PATCH",{notes}).catch((e:any)=>console.error("Form cache write failed:",String(e)));}
  return {id:m.id,form};
 });
 for(const x of formResults){if(x.status==="fulfilled"&&x.value.form)footyForms.set(x.value.id,x.value.form);}
 const publicForms=await readPublicSourceForms(date);
 const githubPublic=await readGitHubPublicTeamHistory();
 const openPlayXg=await readOpenPlayXgData();
 const marketRows=await db("match_market_data?select=match_id,provider_data,captured_at&source=eq.StrikerAPI",token);const marketMap=new Map((marketRows||[]).map((x:any)=>[x.match_id,x.provider_data]));
 if(!matches.length)return out({ok:true,date,total:0,created:0,updated:0,selected:0,message:"Brak zaplanowanych meczów w bazie."});
 const rows:any[]=[];let covered=0,missing=0;
 for(const m of matches){
  const market:any=marketMap.get(m.id);let model:any=null,coverage:any={market_odds:false,elo:false,verified_history:false};
  if(market?.market_probabilities){const mp=market.market_probabilities,stamp=Date.parse(String(market.captured_at||market.provider_data?.captured_at||"")),fresh=Number.isFinite(stamp)&&Date.now()-stamp>=0&&Date.now()-stamp<=48*60*60*1000,vals=[Number(mp.home),Number(mp.draw),Number(mp.away)],sum=vals.reduce((a,b)=>a+b,0);if(fresh&&vals.every(x=>Number.isFinite(x)&&x>0)&&sum>0){model={p1:+(vals[0]/sum*100).toFixed(1),px:+(vals[1]/sum*100).toFixed(1),p2:+(vals[2]/sum*100).toFixed(1),coverage:80,market:true};coverage={market_odds:true,books:market.books,league:market.league,market_captured_at:market.captured_at||market.provider_data?.captured_at};}}
  if(!model){
   const modelKickoff=String(m.kickoff_at||`${date}T00:00:00.000Z`);const isWomen=String(m.gender||"").toLowerCase()==="women";const githubHome=isWomen?null:githubTeamForm(String(m.home_team),modelKickoff,githubPublic,openPlayXg),githubAway=isWomen?null:githubTeamForm(String(m.away_team),modelKickoff,githubPublic,openPlayXg);const githubForm={home:githubHome,away:githubAway,source:"OPENMATCHDAY_GITHUB_LAST10"};const publicMatchForm=isWomen?null:publicFormForMatch(m,publicForms);const homeElo=isWomen?null:findEloRating(String(m.home_team),publicForms.eloByTeam||new Map()),awayElo=isWomen?null:findEloRating(String(m.away_team),publicForms.eloByTeam||new Map());const homeSupplement={...(publicMatchForm?.home||{}),...(githubForm.home||{})},awaySupplement={...(publicMatchForm?.away||{}),...(githubForm.away||{})};if(homeElo)Object.assign(homeSupplement,{elo:Number(homeElo.elo),rd:Number(homeElo.rd),hfa:Number(homeElo.hfa),elo_as_of:homeElo.as_of});if(awayElo)Object.assign(awaySupplement,{elo:Number(awayElo.elo),rd:Number(awayElo.rd),hfa:Number(awayElo.hfa),elo_as_of:awayElo.as_of});const supplemental={home:Object.keys(homeSupplement).length?homeSupplement:null,away:Object.keys(awaySupplement).length?awaySupplement:null,source:githubForm.home||githubForm.away?"OPENMATCHDAY_GITHUB_LAST10":publicMatchForm?.source||"OPENMATCHDAY_LAST10"};
   model=historyModel(m.home_team,m.away_team,modelKickoff,history||[],footyForms.get(m.id)||null,supplemental,String(m.gender||"men"));
   coverage={verified_history:model.source==="VERIFIED_MATCH_HISTORY",partial_verified_history:model.source==="PARTIAL_VERIFIED_HISTORY",baseline_only:model.source==="BASELINE_ONLY",footynomad_last5:model.footyForm,openmatchday_last10:model.source==="OPENMATCHDAY_LAST10",espn_women_last10:model.espnWomenForm,github_openmatchday_last10:!!(githubForm.home||githubForm.away),elo_used:model.elo_used,home_elo:model.elo_home,away_elo:model.elo_away,elo_diff:model.elo_diff,elo_weight:model.elo_weight,elo_as_of:model.elo_as_of,elo_ratings_count:publicForms.eloMeta?.ratings_count||0,github_data_generated_at:githubPublic.generated_at||null,github_data_coverage:githubPublic.coverage||null,openplay_xg_generated_at:openPlayXg.generated_at||null,openplay_xg_coverage:openPlayXg.coverage||null,openplay_xg_home_matches:model.xg_home_matches||0,openplay_xg_away_matches:model.xg_away_matches||0,home_form:model.home_form,away_form:model.away_form,method:model.method};
   model.history=model.source!=="BASELINE_ONLY";
  }
  const hasModel=!!model;
  if(!model){coverage={market_odds:false,elo:false,reason:"BRAK POTWIERDZONYCH DANYCH — nie generujemy sztucznego prawdopodobieństwa."};}
  const bothTeamsCovered=!!(model.market||(model.history&&model.home_matches>=3&&model.away_matches>=3));const dataCovered=bothTeamsCovered;if(dataCovered)covered++;else missing++;
  const preds:any[]=[];
  if(hasModel){const opts=[["1",model.p1],["X",model.px],["2",model.p2]];const best=opts.sort((x:any,y:any)=>y[1]-x[1])[0];preds.push({market:"1X2",selection:best[0],probability:best[1]});for(const [sel,val] of [["1X",model.p1+model.px],["X2",model.px+model.p2],["12",model.p1+model.p2]])preds.push({market:"DOUBLE_CHANCE",selection:sel,probability:+val.toFixed(1)});}
  else{preds.push({market:"1X2",selection:"—",probability:null},{market:"DOUBLE_CHANCE",selection:"1X",probability:null},{market:"DOUBLE_CHANCE",selection:"X2",probability:null},{market:"DOUBLE_CHANCE",selection:"12",probability:null});}
   const reasonBase=model.market?"Rzeczywiste prawdopodobieństwa rynkowe dostawcy.":model.source==="BEYONDELO_ONLY"?"Prognoza oparta na ratingach Elo obu klubów z publicznego źródła BeyondELO; brak wystarczającej historii formy, więc typ jest odrzucony.":model.source==="OPENMATCHDAY_GITHUB_LAST10"?"Model Poissona na podstawie ostatnich maksymalnie 10 wyników z publicznych baz GitHub: OpenMatchday i OpenFootball. xG nie jest udostępniane dla tego meczu.":model.source==="ESPN_WOMEN_LAST10"?"Model Poissona na podstawie ostatnich dostępnych wyników ligi kobiecej z publicznych scoreboardów ESPN. Zakres może być krótszy niż 10 spotkań; xG nie jest udostępniane.":model.history?"Szacunek Moneyball na podstawie zweryfikowanej historii i formy z publicznych baz GitHub (OpenMatchday/OpenFootball) lub FootyNomad. Gdy dostępne są wiarygodne średnie xG obu drużyn, model może je uwzględnić. Nie jest to kurs bukmachera ani gwarancja.":"Neutralny prior techniczny bez danych o formie; zapisany wyłącznie jako ODRZUCONY.";const reason=reasonBase+(model.elo_used&&model.source!=="BEYONDELO_ONLY"?` Rating Elo: ${model.elo_home}–${model.elo_away} (różnica ${model.elo_diff}), snapshot ${model.elo_as_of}.`:"");
  for(const p of preds){
   const futureEligible=!!m.kickoff_at&&["scheduled","unknown"].includes(m.status)&&new Date(m.kickoff_at).getTime()>Date.now();
   const verdict=futureEligible&&bothTeamsCovered&&model.source!=="BASELINE_ONLY"&&p.probability>=75&&model.coverage>=55?"WYBRANY":"ODRZUCONY";
   const type=p.market==="DOUBLE_CHANCE"?"DC":"1X2";
    const baseSource=model.market?"VERIFIED_MARKET_DATA":model.source==="BASELINE_ONLY"?"NO_VERIFIED_SOURCE":model.source==="BEYONDELO_ONLY"?"BEYONDELO_ELO_ONLY":model.source==="OPENMATCHDAY_GITHUB_LAST10"?"GITHUB_PUBLIC_LAST10_FORM":model.source==="ESPN_WOMEN_LAST10"?"ESPN_WOMEN_LAST10_FORM":model.publicForm?"OPENMATCHDAY_LAST10_FORM":model.footyForm?"FOOTYNOMAD_LAST5_FORM":"MONEYBALL_VERIFIED_HISTORY";const dataSource=model.elo_used&&model.source!=="BEYONDELO_ONLY"?baseSource+"+BEYONDELO_ELO":baseSource;
    rows.push({match_id:m.id,model_version:V,market:p.market,selection:p.selection,prediction_type:type,pick:p.selection,probability:model?.source==="BASELINE_ONLY"?null:p.probability,odds:null,confidence:hasModel&&model.source!=="BASELINE_ONLY"?String(model.coverage):null,verdict,selection_status:verdict,rejection_reason:verdict==="ODRZUCONY"?(!m.kickoff_at?"Brak potwierdzonej godziny rozpoczęcia — prognoza zapisana informacyjnie, bez kwalifikacji do kuponu.":!futureEligible?"Mecz rozpoczęty, zakończony lub ma status inny niż przedmeczowy — typ zapisany wyłącznie do historii.":model.source==="BASELINE_ONLY"?"Brak danych o formie obu drużyn — neutralny prior techniczny jest zawsze odrzucany.":"Prawdopodobieństwo lub pokrycie danych poniżej progu 75% / 55% albo brak co najmniej 3 ostatnich meczów obu drużyn."):null,rationale:reason,data_source:dataSource,data_coverage:coverage,settlement_status:"pending",result_status:"pending",verified:false});
  }
 }
 const matchIds=matches.map((m:any)=>String(m.id)).filter(Boolean);
 const old=matchIds.length?await db("predictions?select=id,match_id,market,selection,settlement_status&model_version=eq."+encodeURIComponent(V)+"&match_id=in.("+matchIds.join(",")+")",token):[];
 const map=new Map(old.map((x:any)=>[x.match_id+"|"+x.market+"|"+x.selection,x.id])),settledMarkets=new Set(old.filter((x:any)=>x.settlement_status!=="pending").map((x:any)=>x.match_id+"|"+x.market));let created=0,updated=0,preserved=0;
 for(const x of old||[]){if(!x.selection||x.selection==="—"){await db("predictions?id=eq."+x.id,token,"PATCH",{settlement_status:"void",result_status:"void",verified:true,settled_at:new Date().toISOString(),note:"Stary pusty wpis zastąpiono typem modelowym; nie liczy się do skuteczności."});}}
 const updateRows:any[]=[],insertRows:any[]=[];
 for(const r of rows){
  const key=r.match_id+"|"+r.market+"|"+r.selection,id=map.get(key);
  if(id){
   const existing=old.find((x:any)=>x.id===id);
   if(existing?.settlement_status==="pending"){updateRows.push({...r,id});updated++;}else preserved++;
  }else if(settledMarkets.has(r.match_id+"|"+r.market)){preserved++;}
  else{insertRows.push(r);created++;}
 }
 // PostgREST bulk insert requires identical JSON keys in every row. Keep rows with id separate from new rows.
 for(let i=0;i<updateRows.length;i+=50){
  await db("predictions?on_conflict=owner_id,match_id,model_version,market,selection",token,"POST",updateRows.slice(i,i+50),"resolution=merge-duplicates,return=minimal");
 }
 for(let i=0;i<insertRows.length;i+=50){
  await db("predictions?on_conflict=owner_id,match_id,model_version,market,selection",token,"POST",insertRows.slice(i,i+50),"resolution=merge-duplicates,return=minimal");
 }
 // Build at most one new TEST coupon per run and market, only from three distinct fixtures with >=75% probabilities.
 const eligible=rows.filter(x=>x.market==="DOUBLE_CHANCE"&&x.verdict==="WYBRANY"&&x.probability>=75&&x.probability!==null).sort((a,b)=>b.probability-a.probability);
 const picks:any[]=[];const seen=new Set();for(const p of eligible){if(!seen.has(p.match_id)){seen.add(p.match_id);picks.push(p);}if(picks.length===3)break;}
 let couponCreated=false;
 if(picks.length===3){
  const prior=await db("coupons?select=id&name=eq.MONEYBALL%20AUTO%20TEST%20"+date+"&coupon_type=eq.TEST",token);
  if(!prior?.length){
   const resolved:any[]=[];
   for(const p of picks){
    const q=await db("predictions?select=id,match_id,prediction_type,pick,probability,odds&match_id=eq."+p.match_id+"&model_version=eq."+encodeURIComponent(V)+"&market=eq.DOUBLE_CHANCE&selection=eq."+p.selection,token);
    if(q?.[0])resolved.push({prediction:q[0],candidate:p});
   }
   if(resolved.length===3){
    const autoName="MONEYBALL AUTO TEST "+date;
    const existingAuto=await db("coupons?select=id,status&name=eq."+encodeURIComponent(autoName)+"&coupon_type=eq.TEST",token);
    if(existingAuto?.length){
     const existingCoupon=existingAuto[0];
     const existingLegs=await db("coupon_legs?select=id&coupon_id=eq."+existingCoupon.id,token);
     if(existingCoupon.status==="pending"&&Array.isArray(existingLegs)&&existingLegs.length===3){
      const existingStake=await db("bankroll_transactions?select=id&coupon_id=eq."+existingCoupon.id+"&transaction_type=eq.stake",token);
      if(!Array.isArray(existingStake)||existingStake.length===0){
       await db("bankroll_transactions",token,"POST",{occurred_at:new Date().toISOString(),type:"stake",amount:5,coupon_id:existingCoupon.id,note:"Stawka wirtualna 5 EUR: "+autoName});
      }
      couponCreated=true;
     }
    }else{
     const combinedProbability=+(resolved.reduce((acc:any,x:any)=>acc*(Number(x.prediction.probability)/100),1)*100).toFixed(1);
     const c=await db("coupons",token,"POST",{name:autoName,coupon_type:"TEST",target_legs:3,status:"pending",stake:5,combined_probability:combinedProbability,notes:"Automatycznie wygenerowany kupon Double Chance; trzy różne mecze, próg >=75%. Stawka wirtualna 5 EUR. Łączne prawdopodobieństwo to iloczyn szacunków przy założeniu niezależności; bez kursów nie wyliczamy zwrotu."});
     const cid=c?.[0]?.id;
     if(cid){
      const legRows=resolved.map((x:any,i:number)=>({coupon_id:cid,prediction_id:x.prediction.id,match_id:x.prediction.match_id,prediction_type:x.prediction.prediction_type,pick:x.prediction.pick,probability:x.prediction.probability,odds:x.prediction.odds,leg_number:i+1,status:"pending",result_status:"pending"}));
      try{
       const inserted=await db("coupon_legs",token,"POST",legRows);
       if(!Array.isArray(inserted)||inserted.length!==3)throw new Error("Kupon nie otrzymał kompletu trzech nóg.");
       await db("bankroll_transactions",token,"POST",{occurred_at:new Date().toISOString(),type:"stake",amount:5,coupon_id:cid,note:"Stawka wirtualna 5 EUR: "+autoName});
       couponCreated=true;
      }catch(e){
       await db("coupons?id=eq."+cid,token,"PATCH",{status:"cancelled",notes:"Niekompletny zapis automatycznego kuponu; wymaga kontroli. "+String(e).slice(0,400)}).catch(()=>undefined);
       throw e;
      }
     }
    }
   }
  }
 }
 return out({ok:true,date,model:V,provider:"Keyless GitHub OpenMatchday + OpenFootball (10-match history) + BeyondELO club Elo ratings + verified results + FootyNomad + fresh market probabilities",matches:matches.length,predictions:rows.length,created,updated,preserved,covered,missing,footy_form_candidates:formCandidates.length,footy_form_matches:footyForms.size,openmatchday_fixtures:publicForms.fixtures,openmatchday_error:publicForms.error||null,github_public_teams:Object.keys(githubPublic.teams||{}).length,github_public_competitions:githubPublic.coverage?.competitions_with_results||0,github_openfootball_matches:githubPublic.coverage?.openfootball_league_matches_read||0,github_openfootball_files:githubPublic.coverage?.openfootball_league_files_loaded||0,github_public_generated_at:githubPublic.generated_at||null,github_public_error:githubPublic.error||null,github_form_matches:new Set(rows.filter((x:any)=>String(x.data_source).includes("GITHUB_PUBLIC_LAST10_FORM")).map((x:any)=>x.match_id)).size,selected:rows.filter(x=>x.verdict==="WYBRANY").length,couponCreated,couponLegs:picks.length,limitations:["Model korzysta z publicznej bazy GitHub: OpenMatchday (72 rozgrywki), OpenFootball (europejskie ligi i puchary oraz reprezentacje), maksymalnie 10 ostatnich spotkań, dostępne statystyki, zweryfikowane wyniki i FootyNomad.","Publiczne bazy wyników nie zapewniają xG, potwierdzonych składów ani kontuzji dla wszystkich rozgrywek. Rating Elo jest dostępny tylko dla części klubów UEFA i nie zastępuje xG. Brakujące dane pozostają puste; nie są symulowane. Kursy rynkowe są używane wyłącznie, gdy zapis ma maksymalnie 48 godzin.","Dane publiczne odświeżane przez GitHub Actions co 6 godzin; źródłowy zbiór deklaruje codzienną aktualizację.","Kupon powstaje tylko przy trzech różnych typach Double Chance >=75%."]});
}catch(e){return out({ok:false,error:String(e)},400)}});