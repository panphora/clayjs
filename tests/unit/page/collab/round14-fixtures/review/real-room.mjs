import assert from 'node:assert/strict';
import {createRooms} from '../../../../../../../hyperclay/server-lib/live-data-rooms.js';
import {serializeLive,stampOf} from '../../../../../../../hyperclay/server-lib/live-data-ops.js';

export function makeRoom(sim,initial,{latency=60,answer=60,refuse=()=>null}={}) {
  let epoch=0;
  const rooms=createRooms({newEpoch:()=>`e${++epoch}`,now:sim.now}),clients=new Map(),reads=[],posts=[];
  const html=(value,at,by)=>`<script type="application/json" merge="page" clay="live"${at?` live-at="${stampOf(at.epoch,at.seq,serializeLive(value))}"`:''}${by?` live-by="${by.client}:${by.n}"`:''}>${serializeLive(value)}</script>`;
  let real=rooms.open('doc',html(initial));
  const state=(id,since)=>{
    const s=structuredClone(rooms.state(real,id,since));
    reads.push({at:sim.now(),id,since,epoch:s.epoch,seq:s.seq,moves:s.moves?.page===null?null:s.moves?.page?.length});
    return s;
  };
  const deliver=(id,type,data)=>{
    const c=clients.get(id);if(!c?.connected)return;
    const generation=c.generation,copy=structuredClone(data);
    sim.after(latency,()=>{if(c.connected&&c.generation===generation)c.handlers[type](copy);});
  };
  const room={
    get stores(){return real.stores;},get seq(){return real.seq;},get epoch(){return real.epoch;},reads,posts,
    get writer(){return real.writer;},set writer(id){real.writer=id;},
    transport(id){return {
      start(handlers){clients.set(id,{handlers,connected:false,generation:0});return ()=>clients.delete(id);},
      send(cid,frame){return new Promise(resolve=>sim.after(answer/2,()=>{
        posts.push({at:sim.now(),cid,frame:structuredClone(frame)});
        const refused=refuse(cid,frame,real);
        if(refused){sim.after(answer/2,()=>resolve(refused));return;}
        const old=real.writer,out=rooms.apply(real,cid,frame);
        assert.ok(!out.error&&!out.busy,JSON.stringify(out));
        if(!out.stale&&!out.duplicate&&out.writer!==old)for(const id of clients.keys())deliver(id,'writer',{epoch:out.epoch,writer:out.writer});
        if(!out.stale&&!out.duplicate)for(const id of clients.keys())deliver(id,'frame',{...out,from:cid,n:frame.n});
        sim.after(answer/2,()=>resolve({status:200,body:out}));
      }));},
      fetchState(cid,since){return new Promise(resolve=>sim.after(answer,()=>resolve(state(cid,since))));},
    };},
    open(id){const c=clients.get(id);c.connected=true;c.generation++;c.handlers.open({clientId:id});},
    close(id){const c=clients.get(id);c.connected=false;c.generation++;c.handlers.close();},
    restart(file){
      const reopen=[...clients].filter(([_,c])=>c.connected).map(([id])=>id);
      for(const id of reopen)room.close(id);
      rooms.drop('doc');real=rooms.open('doc',html(file.page??file));
      for(const id of reopen)sim.after(200,()=>room.open(id));
    },
    fileWritten(name,value,at,by){
      assert.equal(name,'page');
      const written=rooms.fileWritten('doc',html(value,at,by));
      if(written?.valueChanged)for(const id of clients.keys())deliver(id,'state',rooms.state(real,id));
      else if(written)for(const id of clients.keys())deliver(id,'writer',{epoch:real.epoch,writer:real.writer,landed:{page:real.stores.get('page').landed}});
      return written;
    },
  };
  return room;
}
