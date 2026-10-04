export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const raw=req.query?.url;
 if(!raw)return res.status(400).json({error:'Missing url'});
 let target;
 try{target=new URL(raw);if(!/^https?:$/.test(target.protocol))throw new Error('Unsupported protocol')}catch{return res.status(400).json({error:'Invalid URL'})}
 try{
  const response=await fetch(target,{redirect:'follow',headers:{'user-agent':'BRAG/0.2 product-inspector'}});
  const html=await response.text();
  const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const title=clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const description=clean((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)||[])[1]||'');
  const headings=[...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m=>clean(m[1])).filter(Boolean).slice(0,20);
  const links=[...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1],text:clean(m[2])})).filter(x=>x.text).slice(0,40);
  const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
  const text=clean(html).slice(0,20000);
  const signals={nextjs:/_next\\//i.test(html),react:/react/i.test(html),supabase:/supabase/i.test(html),stripe:/stripe/i.test(html),vercel:/vercel/i.test(html),wordpress:/wp-content/i.test(html)};
  const ctas=links.filter(x=>/sign|start|try|demo|buy|book|contact|login|join|download|order|subscribe/i.test(x.text)).slice(0,12);
  return res.status(200).json({url:target.href,status:response.status,title,description,headings,links:links.slice(0,20),ctas,scripts:scripts.slice(0,20),signals,text});
 }catch(error){return res.status(502).json({error:'Could not inspect product',detail:error.message})}
}