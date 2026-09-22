/* A movable hanging point carries one cropped ribbon and a tilting badge.
 * The same drawing path is used for the editor, PNG and animation. */
(() => {
  const P=StickerScene.prototype,R=StickerRenderer,C=StickerCord,D=Math.PI/180;
  const original=Object.fromEntries(['setAtlas','_pose','_updateOne','_down','_up','attach','remove','snapshot','animationFrames'].map(k=>[k,P[k]]));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const hanging=e=>!!(e?.atlas?.cord&&e.settings.frameDesign==='lanyard'&&e.settings.frameLanyard!=='none'&&e.settings.badgeStrapView!=='loop');
  const flipPeriod=s=>4/clamp(Number(s.badgeFlipSpeed)||1,.5,2);
  const restingTurn=e=>e.settings.badgeFace==='back'?Math.PI:0;
  function flipAngle(phase){
    // Hold each face briefly, then ease over and unwind the ribbon. Returning
    // along the same arc keeps the cropped end from accumulating whole turns.
    const ease=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
    return Math.PI*(ease((phase-.14)/.29)-ease((phase-.57)/.29));
  }
  function updateFlip(state,dt,s,paused,reduced){
    if(reduced){state.flipPhase=state.flipAngle=0;return;}
    if(paused)return;
    if(s.badgeFlip){
      state.flipPhase=((state.flipPhase||0)+Math.min(dt,.1)/flipPeriod(s))%1;
      state.flipAngle=flipAngle(state.flipPhase);
    }else{
      state.flipPhase=0;state.flipAngle=(state.flipAngle||0)*Math.exp(-dt*10);
      if(state.flipAngle<.0001)state.flipAngle=0;
    }
  }
  function onBadge(e){
    for(let p=e.parent;p;p=p.parent)if(hanging(p))return true;
    return false;
  }
  function geometry(e,scale=e.s){
    const a=e.atlas,c=a.cord,k=e.work.w/c.sourceW;
    return {width:e.work.w*scale,height:a.h*scale,arm:(a.h/2-(c.y*k-a.y0))*scale,band:c.width*k*scale};
  }
  function runtime(scene,e){
    if(!hanging(e)){e.lanyard=null;return null;}
    const g=geometry(e),key=[scene.stageW,scene.stageH,e.s,e.atlas.w,e.atlas.h,e.settings.frameLanyardLength,e.settings.baseRotation].join('|');
    if(e.lanyard?.key===key&&e.lanyard.layoutX===e.restX&&e.lanyard.layoutY===e.restY)return e.lanyard;
    // The crop belongs to the object. Moving the pass must not tether it to the
    // canvas edge. Rebuild on external layout changes (undo, resize, keyboard).
    const visible=g.width*clamp(Number(e.settings.frameLanyardLength)||1.55,.25,3.2)*.62;
    const cropTop=e.restY-g.arm-visible;
    const state=C.settle(C.create({x:e.restX,y:e.restY,...g,top:cropTop-Math.max(25,g.band*2),angle:(e.settings.baseRotation||0)*D}));
    const dx=e.restX-state.body.x,dy=e.restY-state.body.y;
    for(const p of [state.body,...state.anchors,...state.ropes.flat()]){p.x+=dx;p.y+=dy;}
    Object.assign(state,{key,layoutX:e.restX,layoutY:e.restY,cropTop:cropTop+dy});e.lanyard=state;e.spawn=0;
    return state;
  }
  function moveHanger(scene,e,state,point=scene.pointer){
    const drag=scene.drag,move=drag?.lanyardMove;
    if(!move||!drag.moved||scene.pinch||scene.isLocked(e))return;
    const x=move.x+point.x-move.pointer.x,y=move.y+point.y-move.pointer.y,dx=x-state.layoutX,dy=y-state.layoutY;
    // Move the hidden support, leaving the flexible chain and badge free to lag
    // behind. This drives the swing without changing the chosen drop position.
    for(const p of state.anchors){p.x+=dx;p.y+=dy;}
    state.cropTop+=dy;state.layoutX=e.restX=x;state.layoutY=e.restY=y;
  }
  function smooth(points){
    const out=[];
    for(let i=0;i<points.length-1;i++){
      const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
      for(let j=0;j<3;j++){const t=j/3,t2=t*t,t3=t2*t;out.push({x:.5*(2*b.x+(-a.x+c.x)*t+(2*a.x-5*b.x+4*c.x-d.x)*t2+(-a.x+3*b.x-3*c.x+d.x)*t3),y:.5*(2*b.y+(-a.y+c.y)*t+(2*a.y-5*b.y+4*c.y-d.y)*t2+(-a.y+3*b.y-3*c.y+d.y)*t3)});}
    }
    out.push(points.at(-1));return out;
  }
  function project(scene,x,y,z,W,H){
    const cam=scene.renderer.view.camDist;
    const offset=scene.renderer.view.viewportOffset||[0,0];
    return {x:W/2+x*cam/(cam-z)-offset[0],y:H/2-y*cam/(cam-z)+offset[1]};
  }
  function sourceProjection(scene,e,pose,W,H){
    const k=e.work.w/e.atlas.cord.sourceW,a=e.atlas,m=pose.rotation||R.rotationMatrix(pose.rotX||0,pose.rotY||0,pose.rotZ||0),scale=k*pose.width/a.w;
    return {m,scale,point:(x,y,depth=0)=>{
      const u=((x*k-a.x0)/a.w-.5)*pose.width,v=(.5-(y*k-a.y0)/a.h)*pose.height,z=depth*scale;
      return project(scene,pose.x+m[0]*u+m[3]*v+m[6]*z,pose.y+m[1]*u+m[4]*v+m[7]*z,(pose.z||0)+m[2]*u+m[5]*v+m[8]*z,W,H);
    }};
  }
  function pivotPose(pose,arm){
    // Tilt around the top attachment, keeping the ribbon joined to the hook.
    const m=pose.rotation||R.rotationMatrix(pose.rotX||0,pose.rotY||0,pose.rotZ||0),roll=pose.rotZ||0;
    return {...pose,x:pose.x+(-Math.sin(roll)-m[3])*arm,y:pose.y+(Math.cos(roll)-m[4])*arm,z:(pose.z||0)-m[5]*arm};
  }
  function badgeEdge(ctx,edge,projection){
    if(!edge)return;
    const {x,y,w,h,r,depth}=edge,points=[];
    for(const [cx,cy,start] of [[x+w-r,y+r,-Math.PI/2],[x+w-r,y+h-r,0],[x+r,y+h-r,Math.PI/2],[x+r,y+r,Math.PI]]){
      for(let i=0;i<=6;i++){const a=start+i*Math.PI/12;points.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});}
    }
    const m=projection.m;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      if((m[2]*dy+m[5]*dx)/len<.015)continue;
      const shade=Math.round(170+35*(dy-dx)/len),frontA=projection.point(a.x,a.y),frontB=projection.point(b.x,b.y),backA=projection.point(a.x,a.y,-depth),backB=projection.point(b.x,b.y,-depth);
      ctx.fillStyle=`rgb(${shade},${Math.min(255,shade+6)},${Math.min(255,shade+12)})`;
      ctx.beginPath();ctx.moveTo(frontA.x,frontA.y);ctx.lineTo(frontB.x,frontB.y);ctx.lineTo(backB.x,backB.y);ctx.lineTo(backA.x,backA.y);ctx.closePath();ctx.fill();
    }
  }
  P._pose=function(e,W,H){
    const pose=original._pose.call(this,e,W,H);
    if(onBadge(e)&&!(this.drag?.entry===e&&this.drag.moved))pose.frontOnly=true;
    return hanging(e)&&!e.parent&&!this.motionOwner?.(e)?pivotPose(pose,geometry(e).arm*(pose.scale||1)):pose;
  };
  P.drawLanyard=function(e,pose,W,H,state=null){
    if(!hanging(e))return;
    const c=e.atlas.cord,projection=sourceProjection(this,e,pose,W,H),target=projection.point(c.x,c.y),g=geometry(e,pose.width/e.atlas.w),offset=this.renderer.view.viewportOffset||[0,0];
    if(!state&&(W!==this.stageW||H!==this.stageH||offset[0]||offset[1]))state=C.create({x:target.x,y:target.y+g.arm,...g,top:-g.band*2});
    state=state||runtime(this,e);if(!state)return;
    const end=C.hook(state);
    const canvas=this.cordCanvas||(this.cordCanvas=document.createElement('canvas'));
    // Supersampling preserves the tiny fibres without generating full stage SDFs.
    const quality=Math.min(2,this.dpr||1,2048/Math.max(W,H)),cw=Math.ceil(W*quality),ch=Math.ceil(H*quality);
    if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;this.renderer.deleteImageTexture(this.cordTexture);this.cordTexture=null;}
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,cw,ch);ctx.save();ctx.scale(quality,quality);
    {
      const points=C.points(state,0).map((p,i,a)=>{
        const t=i/(a.length-1);return{x:p.x+(target.x-end.x)*t,y:p.y+(target.y-end.y)*t};
      });
      const left=projection.point(c.x-c.width/2,c.y),right=projection.point(c.x+c.width/2,c.y);
      const strip=smooth(points).map((p,i,a)=>{
        const t=i/(a.length-1),prev=a[Math.max(0,i-1)],next=a[Math.min(a.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy)||1;
        const yaw=pose.rotY||0,blend=Math.pow(t,5),twist=Math.cos(yaw*t*t);
        return {...p,crossX:dy/l*twist*(1-blend)+(right.x-left.x)/g.band*blend,crossY:-dx/l*twist*(1-blend)+(right.y-left.y)/g.band*blend,shade:Math.abs(Math.sin(yaw*t))*.15};
      });
      StickerLanyard.texturedRibbon(ctx,strip,g.band,e.settings.frameLanyardColor||'#3b58a8',e.settings);
    }
    // A short fade reads as a crop, even when the whole lanyard is moved down.
    if(Number.isFinite(state.cropTop)){
      const fade=ctx.createLinearGradient(0,state.cropTop,0,state.cropTop+Math.max(6,g.band*.5));
      fade.addColorStop(0,'#00000000');fade.addColorStop(1,'#000000');
      ctx.globalCompositeOperation='destination-in';ctx.fillStyle=fade;ctx.fillRect(0,0,W,H);
    }
    ctx.globalCompositeOperation='source-over';badgeEdge(ctx,c.edge,projection);
    ctx.restore();
    if(!this.cordTexture)this.cordTexture=this.renderer.createImageTexture(canvas);else this.renderer.updateImageTexture(this.cordTexture,canvas);
    this.renderer.drawFullLayer(this.cordTexture,null,{x:offset[0],y:offset[1],z:0,rotX:0,rotY:0,rotZ:0,width:W,height:H},{front:1e6,alpha:pose.opacity??1});
  };
  P.setAtlas=function(id,atlas){original.setAtlas.call(this,id,atlas);const e=this.get(id);if(e){e.lanyard=null;if(hanging(e))runtime(this,e);}};
  P._down=function(event){
    original._down.call(this,event);
    const drag=this.drag,e=drag?.entry;
    if(hanging(e)&&!e.parent&&!this.pinch&&!this.isLocked(e)&&!drag.lanyardMove){
      drag.lanyardMove={x:e.restX,y:e.restY,pointer:{...this.pointer}};
    }
  };
  P._updateOne=function(e,dt){
    if(!hanging(e)||e.parent||this.motionOwner?.(e)){
      original._updateOne.call(this,e,dt);
      if(e.parent?.lanyard&&this.drag?.entry!==e){const pose=this._pose(e,this.stageW,this.stageH),p=project(this,pose.x,pose.y,pose.z,this.stageW,this.stageH);e.x=e.restX=p.x;e.y=e.restY=p.y;}
      return;
    }
    const state=runtime(this,e),drag=this.drag?.entry===e&&!this.isLocked(e);
    if(drag)moveHanger(this,e,state);
    if(!this.isLocked(e)&&(!this.surfaceMotionPreference.matches||drag)){
      C.advance(state,dt,{target:drag?{x:this.pointer.x-this.drag.dx,y:this.pointer.y-this.drag.dy}:null,gripX:drag?this.drag.dx:0,gripY:drag?this.drag.dy:0,damping:e.settings.badgeCordDamping??1.4,depthMotion:!this.surfaceMotionPreference.matches});
    }
    const draggingBadge=drag||(this.drag?.entry&&this._assemblyMembers(e).includes(this.drag.entry));
    updateFlip(state,dt,e.settings,this.isLocked(e)||draggingBadge,this.surfaceMotionPreference.matches);
    const b=state.body;e.x=b.x;e.y=b.y;e.vx=b.vx;e.vy=b.vy;e.rotZ=-b.angle;e.rotX=b.pitch;e.rotY=b.yaw+(state.flipAngle||0)+restingTurn(e);e.wx=e.wy=e.wz=e.ax=e.ay=e.arot=e.lift=0;e.ascale=1;e.spawn=0;
    this._updateLenticular(e,dt);
  };
  P.attach=function(child,parent){
    const pose=parent?.lanyard?this._pose(parent,this.stageW,this.stageH):null;
    const hit=pose&&child?R.hitSurface(pose,this._view().camDist,child.x-this.stageW/2,this.stageH/2-child.y,0,0,false)[0]:null;
    original.attach.call(this,child,parent);
    if(hit&&child?.offset){
      const base=-(parent.settings.baseRotation||0)*D,x=(hit.u-.5)*pose.width,y=(.5-hit.v)*pose.height;
      child.offset={u:(Math.cos(base)*x-Math.sin(base)*y)/pose.width,v:-(Math.sin(base)*x+Math.cos(base)*y)/pose.height};
    }
  };
  P._up=function(event){
    const drag=this.drag,entry=drag?.entry;
    if(!hanging(entry)||entry.parent||this.motionOwner?.(entry))return original._up.call(this,event);
    if(this.pinch){
      original._up.call(this,event);
      if(this.drag&&!this.pinch){
        // Continuing with one finger starts from the new pinch position.
        this.drag.lanyardMove={x:entry.restX,y:entry.restY,pointer:{...this.pointer}};
      }
      return;
    }
    if(event.pointerId!==this.drag.id)return;
    const point=this._local(event),cancel=event.type==='pointercancel';
    if(Math.hypot(point.x-drag.start.x,point.y-drag.start.y)>6)drag.moved=true;
    if(cancel&&drag.lanyardMove){entry.restX=drag.lanyardMove.x;entry.restY=drag.lanyardMove.y;entry.lanyard=null;}
    else moveHanger(this,entry,runtime(this,entry),point);
    const moved=!cancel&&drag.moved&&!this.isLocked(entry);
    const owner=this.assemblyOwner(entry)||this.peelOwner(entry)||entry;
    if(!cancel&&!drag.moved&&(owner.settings.surfaceTrigger==='tap'||(event.pointerType==='touch'&&['hover','pointer'].includes(owner.settings.surfaceTrigger))))this.playSurface(owner,point);
    this.pointers.delete(event.pointerId);try{this.canvas.releasePointerCapture(event.pointerId);}catch{}
    this._setDropTarget(null);this.drag=null;this._cursor('grab');
    if(cancel||this.surfaceMotionPreference.matches){entry.lanyard=null;const b=runtime(this,entry).body;entry.x=b.x;entry.y=b.y;entry.rotZ=-b.angle;entry.rotX=0;entry.rotY=restingTurn(entry);}
    this.onDragEnd?.(entry,moved);
  };
  P.remove=function(id){const e=this.get(id);if(e)e.lanyard=null;return original.remove.call(this,id);};
  function exportSetup(e,size){
    // A half cord enters the top crop. Leave room for lateral swinging and icons.
    const scale=size/(e.atlas.h*1.95),g=geometry(e,scale),extra=(Number(e.settings.frameLanyardLength)||1.55)-1.55;
    const y=clamp(size*.65+extra*g.width*.23,g.arm+size*.08,size-g.height*.5-size*.04);
    const state=C.settle(C.create({x:size*.5,y,...g,top:-g.band*2}));
    return {state,scale,g};
  }
  P.renderLanyardFrame=function(e,state,size,scale,time,opts={}){
    return this.renderer.renderToCanvas({width:size,height:size,background:opts.background||null,draw:()=>{
      const view={stageW:size,stageH:size,camDist:size*2.2,time,light:[-size*.35,size*.45,size*1.1]};this.renderer.beginFrame(view,true);
      const poses=new Map(),nodes=this._assemblyMembers(e),b=state.body;
      for(const entry of nodes){
        if(!entry.tex)continue;
        let pose;
        if(entry===e)pose=pivotPose({x:b.x-size/2,y:size/2-b.y,z:0,rotX:b.pitch,rotY:b.yaw+(state.flipAngle||0)+restingTurn(e),rotZ:-b.angle,width:entry.atlas.w*scale,height:entry.atlas.h*scale,scale:1},geometry(e,scale).arm);
        else{
          const parent=poses.get(entry.parent);if(!parent)continue;
          const m=parent.rotation||R.rotationMatrix(parent.rotX||0,parent.rotY||0,parent.rotZ||0),base=-(entry.parent.settings.baseRotation||0)*D;
          const dx=(entry.offset?.u||0)*parent.width,dy=-(entry.offset?.v||0)*parent.height,x=Math.cos(base)*dx+Math.sin(base)*dy,y=-Math.sin(base)*dx+Math.cos(base)*dy;
          const angle=-(entry.settings.baseRotation||0)*D-base,c=Math.cos(angle),sn=Math.sin(angle),rotation=new Float32Array(9);
          for(let j=0;j<3;j++){rotation[j]=m[j]*c+m[j+3]*sn;rotation[j+3]=-m[j]*sn+m[j+3]*c;rotation[j+6]=m[j+6];}
          const k=scale*entry.s/e.s;pose={x:parent.x+m[0]*x+m[3]*y,y:parent.y+m[1]*x+m[4]*y,z:parent.z+m[2]*x+m[5]*y,rotation,width:entry.atlas.w*k,height:entry.atlas.h*k,frontOnly:true};
        }
        poses.set(entry,pose);
        if(entry===e)this.drawLanyard(entry,pose,size,size,state);
        this.renderer.drawSticker(entry===e&&opts.tex?opts.tex:this._texAt(entry,time),pose,entry.settings,{selected:false,shadow:opts.shadow?this._shadow(entry,pose,view,scale):null,...this._surfaceOptions(entry,opts.phase??-1,true)});
      }
    }});
  };
  P.snapshot=function(e,opts={}){
    if(!hanging(e)||this.motionOwner?.(e))return original.snapshot.call(this,e,opts);
    const size=Math.round(e.atlas.h*1.7*(opts.scale||1)),{state,scale}=exportSetup(e,size);
    if(opts.posed){state.body.pitch=e.rotX;state.body.yaw=e.rotY-restingTurn(e);state.body.angle=-e.rotZ;}
    return this.renderLanyardFrame(e,state,size,scale,0,opts);
  };
  P.animationFrames=function(e,opts={}){
    if(!hanging(e)||this.motionOwner?.(e))return original.animationFrames.call(this,e,opts);
    const size=opts.size||512,fps=opts.fps||30,flip=!!e.settings.badgeFlip,count=Math.max(2,Math.round(fps*(flip?flipPeriod(e.settings):4))),seconds=count/fps,scene=this;
    const frames={length:count,width:size,height:size,*[Symbol.iterator](){
      const {state,scale}=exportSetup(e,size);
      // Start with a small sideways release. Every export starts from the same
      // state and never changes the running editor's particles or velocities.
      if(!flip){state.body.vx=size*.48;state.body.pitch=.12;state.body.yaw=-.2;state.body.yawVelocity=1.1;}
      for(let i=0;i<count;i++){
        if(flip)state.flipAngle=flipAngle(i/count);
        else if(i)for(let dt=1/fps;dt>1e-8;){const step=Math.min(dt,1/60);C.advance(state,step,{damping:e.settings.badgeCordDamping??1.4});dt-=step;}
        const frame=scene.renderLanyardFrame(e,state,size,scale,i/fps,{...opts,phase:i/count});
        try{yield frame;}finally{if(opts.lazy)frame.width=frame.height=1;}
      }
    }};
    return{frames:opts.lazy?frames:Array.from(frames),fps,seconds,loop:flip};
  };
})();
