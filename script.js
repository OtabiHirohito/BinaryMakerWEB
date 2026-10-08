const $=s=>document.querySelector(s);
const fmtSize=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
const HEX=Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0').toUpperCase());
const BIN=Array.from({length:256},(_,i)=>i.toString(2).padStart(8,'0'));
const SHOW_LIMIT=300000;
let dl=null;
(async()=>{try{dl=await window.claude.use('downloads')}catch(e){dl=null}})();

function setMsg(el,t,err){el.textContent=t;el.classList.toggle('err',!!err)}
function info(el,rows){el.innerHTML=rows.map(([k,v])=>`<dt>${k}</dt><dd></dd>`).join('');
  [...el.querySelectorAll('dd')].forEach((d,i)=>d.textContent=rows[i][1]);el.hidden=false}

/* ---------- 形式判別 ---------- */
function sniff(b){
  const h=(o,...a)=>a.every((v,i)=>b[o+i]===v);
  const asc=(o,s)=>[...s].every((c,i)=>b[o+i]===c.charCodeAt(0));
  if(h(0,0x89,0x50,0x4E,0x47))return['png','image/png','PNG画像'];
  if(h(0,0xFF,0xD8,0xFF))return['jpg','image/jpeg','JPEG画像'];
  if(asc(0,'GIF8'))return['gif','image/gif','GIF画像'];
  if(asc(0,'RIFF')&&asc(8,'WEBP'))return['webp','image/webp','WebP画像'];
  if(asc(0,'RIFF')&&asc(8,'WAVE'))return['wav','audio/wav','WAV音声'];
  if(asc(0,'%PDF'))return['pdf','application/pdf','PDF'];
  if(h(0,0x1A,0x45,0xDF,0xA3))return['webm','video/webm','WebM動画'];
  if(asc(4,'ftyp'))return asc(8,'M4A')?['m4a','audio/mp4','M4A音声']:asc(8,'qt')?['mov','video/quicktime','MOV動画']:['mp4','video/mp4','MP4動画'];
  if(asc(0,'ID3')||h(0,0xFF,0xFB))return['mp3','audio/mpeg','MP3音声'];
  if(asc(0,'OggS'))return['ogg','audio/ogg','Ogg'];
  if(h(0,0x1F,0x8B))return['gz','application/gzip','GZIP'];
  if(asc(0,'Rar!'))return['rar','application/vnd.rarlab.rar','RAR'];
  if(h(0,0x37,0x7A,0xBC,0xAF))return['7z','application/x-7z-compressed','7z'];
  if(h(0,0xD0,0xCF,0x11,0xE0))return['doc','application/msword','旧Officeファイル（doc/xls/ppt）'];
  if(h(0,0x50,0x4B,0x03,0x04)||h(0,0x50,0x4B,0x05,0x06)){
    const s=new TextDecoder('latin1').decode(b.subarray(0,Math.min(b.length,400000)));
    const T={docx:['word/','application/vnd.openxmlformats-officedocument.wordprocessingml.document','Word文書'],
      xlsx:['xl/','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Excelブック'],
      pptx:['ppt/','application/vnd.openxmlformats-officedocument.presentationml.presentation','PowerPointプレゼン']};
    for(const k in T)if(s.includes(T[k][0]))return[k,T[k][1],T[k][2]];
    if(s.includes('application/epub'))return['epub','application/epub+zip','EPUB'];
    return['zip','application/zip','ZIP'];
  }
  const head=b.subarray(0,512);
  if(head.length&&![...head].some(c=>c===0||(c<9)))return['txt','text/plain','テキスト（推定）'];
  return['bin','application/octet-stream','不明（バイナリ）'];
}

/* ---------- エンコード ---------- */
function toBase64(b){let s=[];for(let i=0;i<b.length;i+=0x8000)s.push(String.fromCharCode.apply(null,b.subarray(i,i+0x8000)));return btoa(s.join(''))}
function toTable(b,T,sep){const o=[];for(let i=0;i<b.length;i+=65536){const p=new Array(Math.min(65536,b.length-i));for(let j=0;j<p.length;j++)p[j]=T[b[i+j]];o.push(p.join(sep))}return o.join(sep)}
let cur=null,encText='';

let showAll=false;
function showOut(){
  if(!encText)return;
  $('#out').value=!showAll&&encText.length>SHOW_LIMIT?encText.slice(0,SHOW_LIMIT)+'\n…（表示は先頭'+SHOW_LIMIT.toLocaleString()+'文字まで。コピー・保存では全文が対象です）':encText;
}
function render(){
  if(!cur)return;
  const f=document.querySelector('input[name=fmt]:checked').value;
  setMsg($('#msg1'),'変換中…');
  setTimeout(()=>{
    const mime=cur.file.type||sniff(cur.bytes)[1];
    encText=f==='base64'?toBase64(cur.bytes):f==='dataurl'?'data:'+mime+';base64,'+toBase64(cur.bytes):f==='hex'?toTable(cur.bytes,HEX,' '):toTable(cur.bytes,BIN,' ');
    showOut();
    $('#copy').disabled=$('#saveTxt').disabled=false;
    setMsg($('#msg1'),'変換しました（'+encText.length.toLocaleString()+' 文字）');
  },20);
}

async function load(file){
  if(!file)return;
  setMsg($('#msg1'),'読み込み中…');
  const bytes=new Uint8Array(await file.arrayBuffer());
  cur={file,bytes};
  const [ext,mime,label]=sniff(bytes);
  info($('#info'),[['ファイル名',file.name],['サイズ',fmtSize(bytes.length)+'（'+bytes.length.toLocaleString()+' バイト）'],['種類',label+' / '+(file.type||mime)]]);
  preview($('#prev1'),new Blob([bytes],{type:file.type||mime}),file.type||mime);
  render();
}

function preview(box,blob,mime){
  box.textContent='';
  if(box._url)URL.revokeObjectURL(box._url);
  const u=box._url=URL.createObjectURL(blob);let el;
  if(mime.startsWith('image/')){el=new Image();el.alt='プレビュー'}
  else if(mime.startsWith('video/')){el=document.createElement('video');el.controls=true}
  else if(mime.startsWith('audio/')){el=document.createElement('audio');el.controls=true}
  if(el){el.src=u;box.append(el)}
}

async function copyText(t,el){
  try{await navigator.clipboard.writeText(t)}catch(e){
    const ta=document.createElement('textarea');ta.value=t;document.body.append(ta);ta.select();
    try{document.execCommand('copy')}catch(_){setMsg(el,'コピーに失敗しました。',1);ta.remove();return}ta.remove();
  }
  setMsg(el,'コピーしました');
}

async function save(name,data,el){
  if(!dl){
    const a=document.createElement('a');a.href=URL.createObjectURL(data instanceof Blob?data:new Blob([data]));
    a.download=name;document.body.append(a);a.click();a.remove();setMsg(el,'ダウンロードしました: '+name);return}
  try{const r=await dl.save({filename:name,data});setMsg(el,'保存しました: '+name)}
  catch(e){
    const m={declined:'保存をキャンセルしました。',rejected_extension:'この拡張子は保存できません。',too_large:'ファイルが大きすぎます。',rate_limited:'少し待ってからもう一度お試しください。'};
    setMsg(el,m[e&&e.code]||'保存できませんでした。',1);
  }
}

/* ---------- デコード ---------- */
function decode(text,fmt){
  let t=text.trim(),mime='',m=t.match(/^data:([^;,]*)((?:;[^;,=]+=[^;,]*)*)(;base64)?,/i);
  if(m){mime=m[1];t=t.slice(m[0].length);
    if(!m[3])return{bytes:new TextEncoder().encode(decodeURIComponent(t)),mime}}
  if(!t)throw new Error('テキストが空です。');
  const comp=t.replace(/\s/g,'');
  if(fmt==='auto'){
    const bs=comp.replace(/^0b/i,'');
    fmt=m?'base64':/^[01]+$/.test(bs)&&bs.length%8===0?'bin':/^(0x)?[0-9a-f]+$/i.test(comp.replace(/0x|[,:-]/gi,''))&&comp.replace(/0x|[,:-]/gi,'').length%2===0&&/^[0-9a-f\s,:x-]+$/i.test(t)&&!/^[0-9]+$/.test(comp)?'hex':'base64';
  }
  if(fmt==='hex'){
    const h=t.replace(/0x|[\s,:-]/gi,'');
    if(!/^[0-9a-f]*$/i.test(h)||h.length%2)throw new Error('16進数として正しくありません（偶数桁の0-9, A-Fのみ）。');
    const b=new Uint8Array(h.length/2);const V=c=>c<58?c-48:(c|32)-87;for(let i=0;i<b.length;i++)b[i]=V(h.charCodeAt(i*2))<<4|V(h.charCodeAt(i*2+1));return{bytes:b,mime}}
  if(fmt==='bin'){
    const s=t.replace(/^0b/i,'').replace(/\s/g,'');
    if(!/^[01]*$/.test(s)||s.length%8)throw new Error('2進数として正しくありません（8桁単位の0と1のみ）。');
    const b=new Uint8Array(s.length/8);for(let i=0;i<b.length;i++){let v=0;for(let k=0;k<8;k++)v=v<<1|(s.charCodeAt(i*8+k)-48);b[i]=v}return{bytes:b,mime}}
  let s=comp.replace(/-/g,'+').replace(/_/g,'/').replace(/=+$/,'');
  if(/[^A-Za-z0-9+/]/.test(s)||s.length%4===1)throw new Error('Base64として正しくありません。入力形式を確認してください。');
  const bin=atob(s);
  const b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return{bytes:b,mime};
}

let decBlob=null,bigText=null;
let decBytes=null;
function renderDump(){
  if(!decBytes)return;const b=decBytes;
  const n=showAll?b.length:Math.min(b.length,256),L=[];
  for(let i=0;i<n;i+=16){const r=Array.from(b.subarray(i,Math.min(i+16,n)));
    L.push(i.toString(16).padStart(6,'0')+'  '+r.map(v=>HEX[v]).join(' ').padEnd(47)+'  '+r.map(v=>v>31&&v<127?String.fromCharCode(v):'.').join(''))}
  $('#dump').textContent=L.join('\n')+(b.length>n?'\n…（先頭'+n+'バイトのみ表示。「全文表示」で全体を表示）':'');
}
$('#paste').onclick=async()=>{
  const el=$('#msg2');
  try{
    const t=await navigator.clipboard.readText();
    if(!t){setMsg(el,'クリップボードが空です。',1);return}
    if(!showAll&&t.length>BIG)setBig(t,'貼り付けた大きなテキスト');else{clearBig();$('#inp').value=t}
    setMsg(el,'貼り付けました（'+t.length.toLocaleString()+' 文字）');
  }catch(e){setMsg(el,'クリップボードを読み取れませんでした。入力欄に直接貼り付け（Ctrl+V）してください。',1)}
};
const BIG=100000;
function setBig(t,label){
  bigText=t;const ta=$('#inp');ta.readOnly=true;
  ta.value=label+'（'+t.length.toLocaleString()+' 文字）\n\n先頭部分:\n'+t.slice(0,300)+'…\n\n※サイズが大きいため、入力欄には先頭部分だけを表示しています。変換には全文が使われます。';
}
function clearBig(){bigText=null;const ta=$('#inp');ta.readOnly=false;ta.value=''}
$('#clr').onclick=()=>{clearBig();setMsg($('#msg2'),'')};
$('#inp').addEventListener('paste',e=>{
  const t=e.clipboardData&&e.clipboardData.getData('text');
  if(!showAll&&t&&t.length>BIG){e.preventDefault();setBig(t,'貼り付けた大きなテキスト')}
});
function run(){
  const el=$('#msg2');
  try{
    const {bytes,mime}=decode(bigText!==null?bigText:$('#inp').value,$('#dfmt').value);
    if(!bytes.length)throw new Error('変換結果が空です。');
    const [ext,dm,label]=sniff(bytes);const type=mime||dm;
    decBlob=new Blob([bytes],{type});
    info($('#info2'),[['サイズ',fmtSize(bytes.length)+'（'+bytes.length.toLocaleString()+' バイト）'],['種類',label+' / '+type]]);
    $('#fname').value='output.'+ext;$('#saveRow').hidden=false;$('#extNote').hidden=false;
    preview($('#prev2'),decBlob,type);
    decBytes=bytes;renderDump();$('#dump').hidden=false;
    setMsg(el,'変換しました。ファイルを保存できます。');
  }catch(e){setMsg(el,e.message,1);$('#saveRow').hidden=$('#info2').hidden=$('#dump').hidden=true;$('#prev2').textContent=''}
}
$('#dec').onclick=()=>{setMsg($('#msg2'),'変換中…');setTimeout(run,30)};
$('#saveBin').onclick=()=>decBlob&&save($('#fname').value.trim()||'output.bin',decBlob,$('#msg2'));

/* ---------- イベント ---------- */
$('#file').onchange=e=>load(e.target.files[0]);
document.querySelectorAll('input[name=fmt]').forEach(r=>r.onchange=render);
$('#copy').onclick=()=>copyText(encText,$('#msg1'));
$('#saveTxt').onclick=()=>save((cur.file.name.replace(/\.[^.]*$/,'')||'output')+'.txt',new Blob([encText],{type:'text/plain'}),$('#msg1'));
$('#txtfile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const t=await f.text();
  if(!showAll&&t.length>BIG)setBig(t,f.name);else{clearBig();$('#inp').value=t}
  setMsg($('#msg2'),f.name+' を読み込みました。');e.target.value=''};
const drop=$('#drop');
['dragenter','dragover'].forEach(v=>drop.addEventListener(v,e=>{e.preventDefault();drop.classList.add('on')}));
['dragleave','drop'].forEach(v=>drop.addEventListener(v,e=>{e.preventDefault();drop.classList.remove('on')}));
drop.addEventListener('drop',e=>load(e.dataTransfer.files[0]));
const tabs=[['#t1','#p1'],['#t2','#p2']];
tabs.forEach(([t,p])=>$(t).onclick=()=>tabs.forEach(([t2,p2])=>{const on=t2===t;$(t2).setAttribute('aria-selected',on);$(p2).hidden=!on}));

$('#showAll').onclick=e=>{
  showAll=!showAll;
  const b=e.currentTarget;b.setAttribute('aria-pressed',showAll);b.textContent='全文表示: '+(showAll?'オン':'オフ');
  setMsg($('#msg1'),showAll?'全文表示中です。大きいデータでは動作が重くなります。':'');
  showOut();renderDump();
  const ta=$('#inp');
  if(showAll&&bigText!==null){const t=bigText;clearBig();ta.value=t}
  else if(!showAll&&bigText===null&&ta.value.length>BIG)setBig(ta.value,'入力テキスト');
};
