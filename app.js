const $=s=>document.querySelector(s);
const canvas=$('#canvas'),ctx=canvas.getContext('2d');
const state={scenes:[],images:[],playing:false,recording:false};
const palette=['#8bff67','#7dd3fc','#c4b5fd','#f9a8d4'];

function inferScenes(text,url){
 const t=(text||'').toLowerCase();
 let name='your product';
 try{if(url)name=new URL(url).hostname.replace('www.','').split('.')[0]}catch{}
 const scenes=[
  ['Hook','Show the problem and why it matters.'],
  ['Product','Introduce '+name+' in one clear sentence.'],
  ['Core workflow','Show the shortest path from input to useful result.'],
  ['Proof','Highlight the outcome, result, or key advantage.'],
  ['Close','End with a clear action for the viewer.']
 ];
 if(/dashboard|admin|analytics|report|data/.test(t))scenes[2]=['Core workflow','Open the dashboard, reveal the data, then show the useful result.'];
 if(/payment|checkout|shop|store|ecommerce/.test(t))scenes[2]=['Core workflow','Move from product selection to checkout and completed purchase.'];
 if(/game|gaming/.test(t))scenes[2]=['Core workflow','Show the core game loop, the moment of action, and the payoff.'];
 if(/ai|agent|automation/.test(t))scenes[2]=['Core workflow','Give the system an input, show the AI work, then reveal the output.'];
 return {name,scenes};
}

function renderStory(){
 const root=$('#story');
 root.className='story';
 root.innerHTML=state.scenes.map((s,i)=>'<div class="scene"><span class="num">0'+(i+1)+'</span><div><strong>'+s[0]+'</strong><br><small>'+s[1]+'</small></div><span>'+(i===0?'2s':i===4?'5s':'8s')+'</span></div>').join('');
}

$('#generate').onclick=()=>{
 const result=inferScenes($('#description').value,$('#url').value);
 state.scenes=result.scenes;
 state.name=result.name;
 $('#status').textContent='Story ready';
 renderStory();
 $('#play').disabled=false;
 $('#record').disabled=false;
 drawFrame(0,0);
};

$('#images').onchange=e=>{
 state.images=[];
 [...e.target.files].slice(0,6).forEach(f=>{
  const im=new Image();
  im.onload=()=>{state.images.push(im);drawFrame(0,0)};
  im.src=URL.createObjectURL(f);
 });
};

function drawFrame(sceneIndex,progress){
 const w=canvas.width,h=canvas.height;
 ctx.fillStyle='#090b0f';ctx.fillRect(0,0,w,h);
 ctx.fillStyle=palette[sceneIndex%palette.length];ctx.fillRect(0,0,w,8);
 ctx.fillStyle='#777f8d';ctx.font='700 20px system-ui';ctx.fillText('BRAG DEMO',60,72);
 ctx.fillStyle='#f4f5f7';ctx.font='900 62px system-ui';
 const title=state.scenes[sceneIndex]?.[0]||'Your product';ctx.fillText(title,60,175);
 ctx.fillStyle='#aeb5c0';ctx.font='28px system-ui';
 const desc=state.scenes[sceneIndex]?.[1]||'Turn your product into a clear story.';
 wrap(desc,60,225,520,42);
 if(state.images.length){
  const im=state.images[sceneIndex%state.images.length];
  const scale=Math.min(560/im.width,390/im.height),iw=im.width*scale,ih=im.height*scale;
  const x=w-80-iw,y=165+(1-progress)*24;
  ctx.save();ctx.shadowBlur=35;ctx.shadowColor='rgba(0,0,0,.5)';ctx.drawImage(im,x,y,iw,ih);ctx.restore();
 }else{
  ctx.fillStyle='#151922';roundRect(ctx,w-600,140,500,390,18);ctx.fill();
  ctx.fillStyle='#232936';
  for(let i=0;i<6;i++)ctx.fillRect(w-560,190+i*48,330+(i%3)*60,12);
  ctx.fillStyle=palette[sceneIndex%palette.length];ctx.fillRect(w-560,190,150,12);
 }
 ctx.fillStyle='#59616e';ctx.font='16px system-ui';
 ctx.fillText(String(sceneIndex+1).padStart(2,'0')+' / '+String(state.scenes.length).padStart(2,'0'),60,h-60);
 ctx.fillStyle=palette[sceneIndex%palette.length];ctx.fillRect(60,h-38,(w-120)*progress,4);
}

function wrap(text,x,y,maxWidth,lineHeight){
 const words=text.split(' ');let line='';
 for(const word of words){
  const test=line+word+' ';
  if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);line=word+' ';y+=lineHeight}else line=test;
 }
 ctx.fillText(line,x,y);
}

function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}

async function play(record=false){
 if(!state.scenes.length)return;
 state.playing=true;$('#play').disabled=true;$('#record').disabled=true;
 const stream=record?canvas.captureStream(30):null;
 let rec,chunks=[];
 if(record){
  rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});
  rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  rec.onstop=()=>{
   const blob=new Blob(chunks,{type:'video/webm'});
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='brag-demo.webm';a.click();
   $('#recording').textContent='Demo recorded. WebM downloaded.';
  };
  rec.start();$('#recording').textContent='Recording demo...';
 }
 const durations=state.scenes.map((_,i)=>i===0?2000:i===state.scenes.length-1?5000:8000);
 for(let s=0;s<state.scenes.length;s++){
  const start=performance.now(),dur=durations[s];
  await new Promise(resolve=>{
   function tick(now){
    const p=Math.min(1,(now-start)/dur);drawFrame(s,p);
    if(p<1)requestAnimationFrame(tick);else resolve();
   }
   requestAnimationFrame(tick);
  });
 }
 if(rec)rec.stop();
 state.playing=false;$('#play').disabled=false;$('#record').disabled=false;
 $('#recording').textContent=record?'':'Preview complete.';
}

$('#play').onclick=()=>play(false);
$('#record').onclick=()=>play(true);
drawFrame(0,0);
