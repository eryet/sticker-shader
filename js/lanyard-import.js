/* Local photo intake and four-corner perspective correction. */
window.StickerLanyardImport = {
  create({decode,onCreate}) {
    const $=id=>document.getElementById(id),dialog=$('lanyardDialog'),stage=$('lanyardCropStage'),crop=$('lanyardCrop'),preview=$('lanyardPreview');
    const tr=(s,p)=>I18N.t(s,p),full=()=>[[0,0],[1,0],[1,1],[0,1]];
    let source=null,corners=full(),name='',target=null,busy=false,loading=false,revision=0,timer=0,returnFocus=null;
    const settings=()=>({...StickerLanyard.DEFAULTS,...target?.settings,frameLanyardColor:$('lanyardImportColor').value,frameLanyardText:$('lanyardImportText').value});
    function paint() {
      if(!dialog.open)return;
      const p=settings();let photo=null;
      if(source) {
        stage.style.width=`${Math.min(600,420*source.width/source.height)}px`;
        crop.width=Math.round(640);crop.height=Math.round(640*source.height/source.width);
        const ctx=crop.getContext('2d');ctx.drawImage(source,0,0,crop.width,crop.height);
        ctx.fillStyle='#10203788';ctx.beginPath();ctx.rect(0,0,crop.width,crop.height);
        corners.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x*crop.width,y*crop.height));ctx.closePath();ctx.fill('evenodd');
        ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();corners.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x*crop.width,y*crop.height));ctx.closePath();ctx.stroke();
        dialog.querySelectorAll('[data-corner]').forEach((b,i)=>{b.style.left=`${corners[i][0]*100}%`;b.style.top=`${corners[i][1]*100}%`;});
        const c=StickerLanyard.rectify(source,corners,Number($('lanyardImportRatio').value),420);
        photo={canvas:c,w:c.width,h:c.height,pad:0};p.badgeRatio=c.width/c.height;
      }
      const result=StickerLanyard.compose(p,photo,(ctx,pic,_,w)=>ctx.drawImage(pic.canvas,w.x,w.y,w.w,w.h)),composed=result.canvas;
      preview.width=390;preview.height=520;const ctx=preview.getContext('2d');
      const scale=Math.min(320/composed.width,(result.layout.cord?300:470)/composed.height),x=(390-composed.width*scale)/2,y=490-composed.height*scale;
      ctx.clearRect(0,0,390,520);
      if(result.layout.cord)StickerLanyard.drawRibbon(ctx,[[195,-25],[191,y*.35],[201,y*.72],[195,y+result.layout.cord.y*scale]],p.badgeStrapWidth*scale,p.frameLanyardColor,p);
      ctx.drawImage(composed,x,y,composed.width*scale,composed.height*scale);
      $('lanyardCreate').disabled=busy||loading||!!(target&&!source); $('lanyardCreate').textContent=tr(target?'Replace pass photo':source?'Create lanyard':'Try a sample lanyard');
    }
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(paint,45);};
    function sync() {
      $('lanyardCropArea').hidden=!source;$('lanyardEmpty').hidden=!!source;
      $('lanyardImportError').textContent='';paint();
    }
    async function load(file) {
      if(!file||busy)return;
      const token=++revision;loading=true;$('lanyardCreate').disabled=true;$('lanyardImportError').textContent=tr('Opening photo…');
      try {
        const image=await decode(file);
        if(token!==revision||!dialog.open)return;
        if(Math.min(image.width,image.height)<16)throw new Error(tr('Choose a photo at least 16 pixels wide and tall.'));
        source=image;corners=full();name=file.name||'Pass photo';loading=false;sync();
      } catch(error) {if(token===revision){loading=false;$('lanyardImportError').textContent=tr('Could not load image: {error}',{error:error.message});$('lanyardCreate').disabled=!!(target&&!source);}}
    }
    for(const id of ['lanyardPhotoInput','lanyardCameraInput']) $(id).addEventListener('change',e=>{load(e.target.files[0]);e.target.value='';});
    $('lanyardChoose').onclick=()=>$('lanyardPhotoInput').click();
    $('lanyardCamera').onclick=()=>$('lanyardCameraInput').click();
    $('lanyardResetCrop').onclick=()=>{corners=full();paint();};
    $('lanyardRotatePhoto').onclick=()=>{
      if(!source||busy)return;const c=document.createElement('canvas');c.width=source.height;c.height=source.width;
      const ctx=c.getContext('2d');ctx.translate(c.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(source,0,0);source=c;corners=full();paint();
    };
    dialog.querySelectorAll('[data-corner]').forEach((button,i)=>{
      let pointer=null;
      const move=(x,y)=>{const next=corners.map(p=>p.slice());next[i]=[Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))];if(StickerLanyard.validCorners(next)){corners=next;schedule();}};
      button.addEventListener('pointerdown',e=>{if(busy)return;e.preventDefault();button.focus();pointer=e.pointerId;button.setPointerCapture(pointer);});
      button.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;const r=stage.getBoundingClientRect();move((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{pointer=null;});
      button.addEventListener('keydown',e=>{
        const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta||busy)return;
        e.preventDefault();e.stopPropagation();const step=e.shiftKey?.01:.002;move(corners[i][0]+delta[0]*step,corners[i][1]+delta[1]*step);
      });
    });
    for(const id of ['lanyardImportColor','lanyardImportText','lanyardImportRatio'])$(id).addEventListener('input',schedule);
    $('lanyardClose').onclick=()=>dialog.close();
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('close',()=>{revision++;clearTimeout(timer);source=null;returnFocus?.focus({preventScroll:true});});
    dialog.addEventListener('dragover',e=>e.preventDefault());
    dialog.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();load(e.dataTransfer.files[0]);});
    $('lanyardCreate').onclick=async()=>{
      if(busy||loading||(target&&!source))return;busy=true;revision++;$('lanyardCreate').disabled=true;$('lanyardClose').disabled=true;$('lanyardImportError').textContent=tr('Making your lanyard…');
      try {
        const p=settings(),photo=source?StickerLanyard.rectify(source,corners,Number($('lanyardImportRatio').value)):null;
        if(photo)p.badgeRatio=photo.width/photo.height;
        await onCreate({photo,settings:p,name,target});dialog.close();
      } catch(error) {$('lanyardImportError').textContent=error.message;}
      finally {busy=false;$('lanyardClose').disabled=false;$('lanyardCreate').disabled=false;}
    };
    return {open(rec=null){
      if(busy||dialog.open)return;returnFocus=document.activeElement;source=null;corners=full();target=rec;name='';loading=false;
      $('lanyardImportColor').value=rec?.settings.frameLanyardColor||'#3b58a8';$('lanyardImportText').value=rec?.settings.frameLanyardText||'';$('lanyardImportRatio').value='0';
      dialog.showModal();sync();$('lanyardChoose').focus();
    }};
  }
};
