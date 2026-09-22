/* Photograph-backed passes: woven ribbon, metal hardware and a clear badge sleeve.
 * All drawing is deterministic and works in the composition worker. */
globalThis.StickerLanyard = (() => {
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const canvas = (w,h) => { const c=typeof document==='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');c.width=w;c.height=h;return c; };
  const colour = (value,fallback) => /^#[\da-f]{6}$/i.test(value||'')?value:fallback;
  // Explicit Latin and CJK families avoid different generic-font fallback in
  // the document and OffscreenCanvas worker, including synthetic bold weights.
  const FONT='Arial, "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", sans-serif';
  function tint(hex,n) {
    const v=parseInt(hex.slice(1),16),rgb=[v>>16,(v>>8)&255,v&255];
    return `rgb(${rgb.map(c=>Math.round(n>0?c+(255-c)*n:c*(1+n))).join(',')})`;
  }
  function rounded(ctx,x,y,w,h,r,fill,stroke) {
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
  }
  function curve(points,steps=220) {
    return Array.from({length:steps+1},(_,i)=>{
      const t=i/steps,u=1-t,[a,b,c,d]=points;
      const x=u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0];
      const y=u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1];
      const dx=3*u*u*(b[0]-a[0])+6*u*t*(c[0]-b[0])+3*t*t*(d[0]-c[0]);
      const dy=3*u*u*(b[1]-a[1])+6*u*t*(c[1]-b[1])+3*t*t*(d[1]-c[1]);
      const l=Math.hypot(dx,dy)||1;return{x,y,nx:-dy/l,ny:dx/l,angle:Math.atan2(dy,dx),t};
    });
  }
  const fabrics = new Map();
  function fabric(color, p, length) {
    const h = Math.min(8192, Math.max(512, Math.ceil(length / 256) * 256));
    const key = [color,p.frameLanyard,p.frameLanyardText,p.frameLanyardTextColor,p.badgeFabric,p.badgePatternScale,p.badgeTextSize,p.badgeTextSpacing,p.badgeTextDirection,h].join('|');
    if (fabrics.has(key)) return fabrics.get(key);
    const c = typeof OffscreenCanvas==='function'?new OffscreenCanvas(128,h):canvas(128,h), ctx = c.getContext('2d'), image = ctx.createImageData(128,h);
    const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
    // Fine polyester twill: alternating over/under threads, small yarn variation,
    // and dense woven selvedges. No printed grid or white dashed edge stitching.
    for (let y=0;y<h;y++) for (let x=0;x<128;x++) {
      const warp = Math.floor(x/2), weft = Math.floor(y/3), over = (warp+weft)%4<2;
      const thread = over ? Math.cos((x%2-.5)*Math.PI/2) : Math.cos((y%3-1)*Math.PI/3);
      const noise = (((x*73+y*151+warp*weft*17)%97)/96-.5)*.055;
      const edge = Math.min(x,127-x), selvage = edge<7 ? -.13+(x%2)*.035 : 0;
      let light = .92 + thread*.065 + noise + selvage + Math.sin(x/127*Math.PI)*.045;
      if(p.badgeFabric==='ribbed')light=.9+Math.cos(y*Math.PI/7)*.095+thread*.035+noise+selvage;
      if(p.badgeFabric==='satin')light=.87+Math.pow(Math.sin(x/127*Math.PI),3)*.17+thread*.012+noise*.3+selvage*.5;
      const i=(y*128+x)*4;
      for(let k=0;k<3;k++)image.data[i+k]=clamp(rgb[k]*light+(over?2:0),0,255);
      image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
    const patternScale=clamp(Number(p.badgePatternScale)||1,.5,2);
    ctx.save();ctx.fillStyle=colour(p.frameLanyardTextColor,'#ffffff');ctx.globalCompositeOperation='soft-light';
    ctx.beginPath();ctx.rect(8,0,112,h);ctx.clip();
    if(p.frameLanyard==='striped')ctx.fillRect(64-7*patternScale,0,14*patternScale,h);
    if(p.frameLanyard==='edged')for(const x of [14,106])ctx.fillRect(x,0,8*patternScale,h);
    if(p.frameLanyard==='checker'){
      const step=32*patternScale;
      for(let y=0;y<h;y+=step)for(let x=0;x<128;x+=step)if((Math.round(x/step)+Math.round(y/step))%2===0)ctx.fillRect(x,y,step,step);
    }
    if(p.frameLanyard==='dots'){
      const step=48*patternScale;
      for(let y=step/2;y<h;y+=step)for(let x=20+(Math.round(y/step)%2)*step/2;x<120;x+=step){ctx.beginPath();ctx.arc(x,y,6*patternScale,0,Math.PI*2);ctx.fill();}
    }
    if(p.frameLanyard==='diagonal'){
      const step=100*patternScale;
      for(let y=-128;y<h+128;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y+128);ctx.lineTo(128,y+128+step*.35);ctx.lineTo(0,y+step*.35);ctx.closePath();ctx.fill();}
    }
    ctx.restore();
    if(p.frameLanyardText){
      const size=clamp(Number(p.badgeTextSize)||1,.6,1.8),spacing=clamp(Number(p.badgeTextSpacing)||1,.65,1.7),period=650*spacing;
      ctx.fillStyle=colour(p.frameLanyardTextColor,'#ffffff');ctx.font=`600 ${32*size}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
      for(let y=240*spacing;y<h;y+=period){ctx.save();ctx.translate(64,y);ctx.rotate((p.badgeTextDirection==='up'?-1:1)*Math.PI/2);ctx.fillText(String(p.frameLanyardText).slice(0,70),0,0,Math.min(470*size,period*.74));ctx.restore();}
    }
    if(fabrics.size>12)fabrics.delete(fabrics.keys().next().value);fabrics.set(key,c);return c;
  }
  function texturedRibbon(ctx, points, width, color, p, back=false) {
    if(points.length<2||width<.1)return;
    const pts=points.map((a,i)=>{
      const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy)||1;
      // Positive cross-axis runs left to right on a downward hanging strap,
      // preserving the printed artwork instead of mirroring its letters.
      return {...a,nx:a.crossX??dy/l,ny:a.crossY??-dx/l};
    });
    let distance=0;pts.forEach((a,i)=>{if(i)distance+=Math.hypot(a.x-pts[i-1].x,a.y-pts[i-1].y);a.v=distance*128/width;});
    const tex=fabric(color,p,distance*128/width+2),edge=(a,k)=>({x:a.x+a.nx*width*k,y:a.y+a.ny*width*k});
    const path=()=>{ctx.beginPath();pts.forEach((a,i)=>{const b=edge(a,-.5);ctx[i?'lineTo':'moveTo'](b.x,b.y);});pts.slice().reverse().forEach(a=>{const b=edge(a,.5);ctx.lineTo(b.x,b.y);});ctx.closePath();};
    ctx.save();path();ctx.shadowColor='#14203325';ctx.shadowBlur=width*.15;ctx.shadowOffsetX=width*.055;ctx.shadowOffsetY=width*.06;ctx.fillStyle=color;ctx.fill();ctx.restore();
    function triangle(a,b,c,ua,ub,uc) {
      const det=(ub.x-ua.x)*(uc.y-ua.y)-(uc.x-ua.x)*(ub.y-ua.y);if(Math.abs(det)<.0001)return;
      const A=((b.x-a.x)*(uc.y-ua.y)-(c.x-a.x)*(ub.y-ua.y))/det,B=((b.y-a.y)*(uc.y-ua.y)-(c.y-a.y)*(ub.y-ua.y))/det;
      const C=((c.x-a.x)*(ub.x-ua.x)-(b.x-a.x)*(uc.x-ua.x))/det,D=((c.y-a.y)*(ub.x-ua.x)-(b.y-a.y)*(uc.x-ua.x))/det;
      ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,a.x-A*ua.x-C*ua.y,a.y-B*ua.x-D*ua.y);ctx.drawImage(tex,0,0);ctx.restore();
    }
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1],al=edge(a,-.5),ar=edge(a,.5),bl=edge(b,-.5),br=edge(b,.5);
      triangle(al,ar,bl,{x:0,y:a.v},{x:128,y:a.v},{x:0,y:b.v});triangle(ar,br,bl,{x:128,y:a.v},{x:128,y:b.v},{x:0,y:b.v});
      const shade=(back?.17:Math.max(0,Math.sin(i/(pts.length-1)*Math.PI*2-.5))*.075)+(a.shade||0);
      if(shade){ctx.fillStyle=`rgba(8,16,27,${shade})`;ctx.beginPath();ctx.moveTo(al.x,al.y);ctx.lineTo(ar.x,ar.y);ctx.lineTo(br.x,br.y);ctx.lineTo(bl.x,bl.y);ctx.closePath();ctx.fill();}
    }
    ctx.save();path();ctx.clip();
    // Only a subdued edge sheen; the centre stays flat like real webbing.
    for(const side of [-.47,.47]){ctx.beginPath();pts.forEach((a,i)=>{const b=edge(a,side);ctx[i?'lineTo':'moveTo'](b.x,b.y);});ctx.lineWidth=Math.max(.3,width*.008);ctx.strokeStyle='#ffffff24';ctx.stroke();}
    ctx.restore();
  }
  function ribbon(ctx,points,width,color,p,back=false){texturedRibbon(ctx,curve(points,64),width,color,p,back);}
  const METALS={
    silver:{colors:['#647181','#eef3f6','#ffffff','#8793a2','#e0e7ec','#717f90'],edge:'#74808b',highlight:'#f8fbff',gate:'#9aa7b3'},
    gold:{colors:['#816029','#edd49a','#fff4cd','#b88c43','#fbdfa0','#9c7336'],edge:'#8e6a33',highlight:'#fff1c7',gate:'#c6a05c'},
    rose:{colors:['#855d58','#edc6ba','#fff0e4','#b77c70','#f9d6c6','#99665e'],edge:'#966c63',highlight:'#ffede6',gate:'#c89184'},
    gunmetal:{colors:['#242c35','#788593','#b4bfc8','#3c4855','#8d99a7','#303b46'],edge:'#28333e',highlight:'#bac5ce',gate:'#667582'}
  };
  function metal(ctx,x,y,w,h,finish='silver') {
    const g=ctx.createLinearGradient(x,y,x+w,y+h*.2);
    const colors=(METALS[finish]||METALS.silver).colors;
    colors.forEach((c,i)=>g.addColorStop(i/(colors.length-1),c));return g;
  }
  function hardware(ctx,cx,y,band,color,p,front=false){
    const finish=p.badgeMetal||'silver',{edge,highlight,gate}=METALS[finish]||METALS.silver;
    ctx.save();ctx.translate(cx,y);ctx.lineJoin='round';
    if(!front){
      // One D-shaped attachment eye, with webbing folded over its crossbar.
      const half=band*.46;
      ctx.lineWidth=5;ctx.strokeStyle=metal(ctx,-half,60,half*2,28,finish);
      ctx.beginPath();ctx.moveTo(-half,60);ctx.lineTo(half,60);ctx.lineTo(half,70);ctx.bezierCurveTo(half,90,-half,90,-half,70);ctx.closePath();ctx.stroke();
      ctx.lineWidth=1;ctx.strokeStyle=highlight;ctx.beginPath();ctx.moveTo(-half+2,72);ctx.bezierCurveTo(-half+2,84,half-2,84,half-2,72);ctx.stroke();
      ctx.save();ctx.beginPath();ctx.moveTo(-band*.5,20);ctx.lineTo(band*.5,20);ctx.lineTo(band*.44,67);ctx.quadraticCurveTo(0,77,-band*.44,67);ctx.closePath();ctx.clip();
      ctx.drawImage(fabric(color,{...p,frameLanyardText:''},512),0,0,128,105,-band*.5,20,band,55);
      const fold=ctx.createLinearGradient(0,48,0,74);fold.addColorStop(0,'#00000000');fold.addColorStop(.6,'#00000008');fold.addColorStop(.84,'#00000045');fold.addColorStop(1,'#ffffff18');ctx.fillStyle=fold;ctx.fillRect(-band,20,band*2,55);
      ctx.strokeStyle=tint(color,.22);ctx.lineWidth=.9;ctx.setLineDash([1.5,2]);
      ctx.strokeRect(-band*.32,33,band*.64,23);ctx.beginPath();ctx.moveTo(-band*.31,34);ctx.lineTo(band*.31,55);ctx.moveTo(band*.31,34);ctx.lineTo(-band*.31,55);ctx.stroke();ctx.restore();
      // The lower hook passes behind the reinforced slot in the badge.
      ctx.lineWidth=5;ctx.strokeStyle=edge;ctx.beginPath();ctx.moveTo(-11,125);ctx.bezierCurveTo(-10,148,11,149,13,130);ctx.stroke();
    }else{
      // A compact swivel snap hook with a separate sprung gate.
      ctx.lineWidth=1;
      rounded(ctx,-6,83,12,13,3,metal(ctx,-6,83,12,13,finish),edge);
      rounded(ctx,-9,93,18,6,3,metal(ctx,-9,93,18,6,finish),edge);
      ctx.save();ctx.shadowColor='#10203035';ctx.shadowBlur=2;ctx.shadowOffsetY=1;
      ctx.beginPath();ctx.moveTo(0,96);ctx.bezierCurveTo(-18,94,-21,106,-17,120);ctx.lineTo(-13,134);ctx.bezierCurveTo(-9,149,10,147,15,133);ctx.lineTo(18,122);ctx.quadraticCurveTo(19,118,14,117);ctx.lineTo(10,130);ctx.bezierCurveTo(7,139,-4,141,-7,131);ctx.lineTo(-11,117);ctx.bezierCurveTo(-14,106,-9,102,1,103);ctx.closePath();
      ctx.fillStyle=metal(ctx,-20,96,39,49,finish);ctx.fill();ctx.strokeStyle=edge;ctx.stroke();ctx.restore();
      ctx.lineWidth=3.5;ctx.strokeStyle=gate;ctx.beginPath();ctx.moveTo(0,101);ctx.lineTo(13,121);ctx.stroke();
      ctx.lineWidth=1;ctx.strokeStyle=highlight;ctx.beginPath();ctx.moveTo(-12,106);ctx.quadraticCurveTo(-16,113,-9,130);ctx.stroke();
      ctx.beginPath();ctx.arc(0,101,2.2,0,Math.PI*2);ctx.fillStyle=edge;ctx.fill();
    }
    ctx.restore();
  }
  function backText(ctx,text,x,y,w,h,size,weight){
    if(!text)return;
    let lines=[];
    // Fit long names and CJK text into the same safe area at every aspect ratio.
    for(;;size-=2){
      ctx.font=`${weight} ${size}px ${FONT}`;lines=[''];
      for(const token of String(text).split(/(\s+)/).filter(Boolean)){
        if(lines.at(-1)&&ctx.measureText(lines.at(-1)+token).width>w)lines.push('');
        for(const char of Array.from(token)){
          if(ctx.measureText(lines.at(-1)+char).width>w)lines.push('');
          if(lines.at(-1)||char.trim())lines[lines.length-1]+=char;
        }
      }
      if(lines.length*size*1.25<=h||size<=10)break;
    }
    ctx.save();ctx.beginPath();ctx.rect(x-w/2,y-h/2,w,h);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';
    const lineHeight=size*1.25;lines.forEach((line,i)=>ctx.fillText(line.trim(),x,y+(i-(lines.length-1)/2)*lineHeight,w));ctx.restore();
  }
  function compose(p,photo,drawPhoto,back=false) {
    const ratio=clamp(Number(p.badgeRatio)||.75,.45,2.2),bw=640,bh=bw/ratio;
    const strap=p.frameLanyard!=='none',hanging=strap&&p.badgeStrapView!=='loop',length=strap&&!hanging?bw*clamp(Number(p.frameLanyardLength)||1.55,.25,3.2):0;
    // Match the worker's raster path for the clipped weave and metal edges.
    const holder=p.badgeHolder!=='none',top=strap?length+(holder?162:132):68,W=780,H=Math.ceil(top+bh+75);
    const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(W,H):canvas(W,H),ctx=c.getContext('2d');
    const cx=W/2,color=colour(p.frameLanyardColor,'#3b58a8'),band=clamp(Number(p.badgeStrapWidth)||88,48,130);
    if(strap) {
      if(!hanging){
        ribbon(ctx,[[cx-183,161],[cx-183,60],[cx+183,58],[cx+183,161]],band,color,p,true);
        ribbon(ctx,[[cx-183,161],[cx-183,length*.46],[cx-72,length*.84],[cx,length+24]],band,color,p);
        ribbon(ctx,[[cx+183,161],[cx+183,length*.36],[cx+67,length*.84],[cx,length+24]],band,color,p);
      }
      hardware(ctx,cx,length,band,color,p);
    }
    const x=(W-bw)/2,y=top,round=p.badgeCorners==='square'?4:p.badgeCorners==='soft'?56:holder?14:26;
    if(holder) {
      const g=ctx.createLinearGradient(x-20,y-52,x+bw+20,y+bh+24);g.addColorStop(0,'#e9f4ff75');g.addColorStop(.4,'#a8c3d52a');g.addColorStop(1,'#edf8ff88');
      ctx.lineWidth=2;rounded(ctx,x-20,y-53,bw+40,bh+77,20,g,'#93a8b789');
      rounded(ctx,x-13,y-46,bw+26,bh+63,16,null,'#ffffffc0');
      rounded(ctx,cx-39,y-42,78,23,9,'#d9e7ec38','#ffffff95');
      rounded(ctx,cx-32,y-36,64,11,5,'#25374980','#ffffffb0');
      ctx.lineWidth=1;ctx.strokeStyle='#ffffff8a';ctx.beginPath();ctx.moveTo(x-6,y-10);ctx.lineTo(x+bw+6,y-10);ctx.stroke();
    }
    ctx.save();ctx.shadowColor='#14283b45';ctx.shadowBlur=12;ctx.shadowOffsetY=5;
    rounded(ctx,x,y,bw,bh,round,'#fffefb');ctx.restore();
    ctx.save();ctx.beginPath();ctx.roundRect(x,y,bw,bh,round);ctx.clip();
    if(back) {
      // Pre-mirror only the print area: viewed from behind, text reads normally
      // while the asymmetric metal hook still shares the front's silhouette.
      ctx.save();ctx.translate(W,0);ctx.scale(-1,1);
      const backColor=colour(p.badgeBackColor,'#f6f5ef');
      const paper=ctx.createLinearGradient(x,y,x+bw,y+bh);
      paper.addColorStop(0,tint(backColor,.035));paper.addColorStop(.55,tint(backColor,-.03));paper.addColorStop(1,backColor);
      ctx.fillStyle=paper;ctx.fillRect(x,y,bw,bh);
      if(p.badgeBackStyle==='band'){
        ctx.fillStyle=color;ctx.fillRect(x,y+bh*.09,bw,bh*.055);ctx.fillRect(x+48,y+bh*.84,bw-96,3);
      }
      if(p.badgeBackStyle==='grid'){
        ctx.fillStyle=colour(p.badgeBackTextColor,'#29384f');ctx.globalAlpha=.12;
        for(let gy=y+24;gy<y+bh;gy+=24)for(let gx=x+24;gx<x+bw;gx+=24){ctx.beginPath();ctx.arc(gx,gy,1.3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
      }
      ctx.fillStyle=colour(p.badgeBackTextColor,'#29384f');
      const title=String(p.badgeBackTitle||'').slice(0,100),note=String(p.badgeBackText||'').slice(0,240);
      backText(ctx,title,cx,y+bh*(note ? .42 : .5),bw-112,bh*.3,48,700);
      backText(ctx,note,cx,y+bh*(title ? .67 : .5),bw-112,bh*.23,26,400);
      ctx.restore();
    }
    else if(photo) drawPhoto(ctx,photo,p,{x,y,w:bw,h:bh});
    else {
      ctx.fillStyle='#f7f4ed';ctx.fillRect(x,y,bw,bh);ctx.fillStyle=color;ctx.fillRect(x,y,bw,bh*.2);
      ctx.fillStyle='#ffffff';ctx.font=`600 24px ${FONT}`;ctx.fillText('YOUR NEXT GREAT IDEA',x+43,y+bh*.11);
      ctx.fillStyle='#202b3c';ctx.font=`700 70px ${FONT}`;ctx.fillText('HELLO,',x+43,y+bh*.42);ctx.fillText('CREATOR.',x+43,y+bh*.52);
      ctx.font=`26px ${FONT}`;ctx.fillStyle='#7b8593';ctx.fillText('Your pass. Your memories.',x+43,y+bh*.64);
      ctx.fillStyle=color;ctx.fillRect(x+43,y+bh*.79,bw-86,2);ctx.font=`600 22px ${FONT}`;ctx.fillText('UPLOAD YOUR PASS PHOTO',x+43,y+bh*.88);
    }
    const shine=clamp(Number(p.badgeGlare)||0,0,.65);
    if(shine) {
      const g=ctx.createLinearGradient(x,y,x+bw,y+bh*.3);g.addColorStop(0,'#ffffff00');g.addColorStop(.27,`rgba(255,255,255,${shine})`);g.addColorStop(.42,'#ffffff00');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(x,y,bw,bh);
    }
    ctx.restore();ctx.lineWidth=1;rounded(ctx,x,y,bw,bh,round,null,'#ffffffbd');
    if(holder) {ctx.strokeStyle='#ffffff99';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-11,y+8);ctx.lineTo(x-11,y+bh-5);ctx.stroke();}
    if(strap&&!holder){ctx.lineWidth=1;rounded(ctx,cx-20,y+3,40,9,4,'#293846','#e5e9ec');}
    if(strap)hardware(ctx,cx,length,band,color,p,true);
    const edge=holder?{x:x-20,y:y-53,w:bw+40,h:bh+77,r:20,depth:7}:{x,y,w:bw,h:bh,r:round,depth:8};
    return{canvas:c,layout:{M:0,W:bw,H:bh,hanger:{x:cx,y:top-29},window:{x,y,w:bw,h:bh},cord:hanging?{x:cx,y:24,width:band,sourceW:W,sourceH:H,edge}:null}};
  }
  const DEFAULTS={frameDesign:'lanyard',frameLanyard:'solid',frameLanyardColor:'#3b58a8',frameLanyardText:'',frameLanyardTextColor:'#ffffff',frameLanyardLength:1.55,
    badgeRatio:.75,badgeStrapWidth:88,badgeStrapView:'hanging',badgeCordDamping:1.4,badgeFlip:false,badgeFlipSpeed:1,badgeMetal:'silver',badgeHolder:'none',badgeGlare:.14,framePreset:'',borderWidth:0,outlineSmooth:0,outlineOffset:0,feather:0,fillHoles:false,keepLargest:false,
    badgeFabric:'woven',badgePatternScale:1,badgeTextSize:1,badgeTextSpacing:1,badgeTextDirection:'down',badgeCorners:'rounded',
    badgeFace:'front',badgeBackStyle:'plain',badgeBackColor:'#f6f5ef',badgeBackTitle:'',badgeBackText:'',badgeBackTextColor:'#29384f',
    material:'vinyl',materialFinish:'natural',holoIntensity:0,glitter:0,metallic:0,grain:0,bevel:0,gloss:.08,specular:.06,fresnel:0,diffuse:.08,shadowOpacity:.15,shadowBlur:12,shadowSpread:0,
    baseRotation:0,idleSway:0,hoverTilt:0,stickerScale:.82,photoZoom:1,photoX:0,photoY:0,photoBorder:0,frameTape:'none',windowPattern:'none',iconStick:true};

  // Project a unit rectangle into an ordered convex quadrilateral (TL, TR, BR, BL).
  function projection(q) {
    const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=q;
    const dx=x0-x1+x2-x3,dy=y0-y1+y2-y3;
    const a=x1-x2,b=x3-x2,c=y1-y2,d=y3-y2,det=a*d-b*c;
    const g=Math.abs(det)>1e-10?(dx*d-b*dy)/det:0,h=Math.abs(det)>1e-10?(a*dy-dx*c)/det:0;
    return(u,v)=>{const w=g*u+h*v+1;return[(x1-x0+g*x1)*u/w+(x3-x0+h*x3)*v/w+x0/w,(y1-y0+g*y1)*u/w+(y3-y0+h*y3)*v/w+y0/w];};
  }
  function validCorners(q) {
    if(!Array.isArray(q)||q.length!==4||q.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))return false;
    return q.every((a,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>.002;});
  }
  function rectify(source,q,ratio=0,max=1400) {
    if(!validCorners(q))throw new Error('Place the four corners around your pass without crossing the edges.');
    const corners=q.map(([x,y])=>[x*(source.width-1),y*(source.height-1)]),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    ratio=clamp(Number(ratio)||(dist(corners[0],corners[1])+dist(corners[3],corners[2]))/(dist(corners[0],corners[3])+dist(corners[1],corners[2])),.45,2.2);
    const w=Math.round(ratio>=1?max:max*ratio),h=Math.round(ratio>=1?max/ratio:max),out=canvas(w,h),ctx=out.getContext('2d');
    const input=source.getContext('2d').getImageData(0,0,source.width,source.height).data,result=ctx.createImageData(w,h),map=projection(corners);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const [sx,sy]=map(x/(w-1),y/(h-1)),ix=clamp(Math.floor(sx),0,source.width-2),iy=clamp(Math.floor(sy),0,source.height-2),fx=clamp(sx-ix,0,1),fy=clamp(sy-iy,0,1),i=(iy*source.width+ix)*4,j=(y*w+x)*4;
      for(let k=0;k<4;k++)result.data[j+k]=(input[i+k]*(1-fx)+input[i+4+k]*fx)*(1-fy)+(input[i+source.width*4+k]*(1-fx)+input[i+source.width*4+4+k]*fx)*fy;
    }
    ctx.putImageData(result,0,0);return out;
  }
  return{compose,rectify,validCorners,projection,texturedRibbon,drawRibbon:ribbon,DEFAULTS};
})();
