import assert from 'node:assert/strict';
import { createRooms } from '../../../../../../../hyperclay/server-lib/live-data-rooms.js';
import { stampOf, serializeLive } from '../../../../../../../hyperclay/server-lib/live-data-ops.js';
import { Sim } from '../../room-double.js';
import { engine, find } from '../../blocks/editor-tab.js';
const initial=()=>({blocks:{p:{t:'paragraph',pos:'M',c:'Start.'},i:{t:'image',pos:'N',src:'a.png',caption:'one'},q:{t:'paragraph',pos:'V',c:''}},deleted:{}});
const html=(v,epoch,seq)=>`<script type="application/json" merge="page" clay="live"${epoch?` live-at="${stampOf(epoch,seq,serializeLive(v))}"`:''}>${serializeLive(v)}</script>`;
const sim=new Sim();let generation=0;
const rooms=createRooms({newEpoch:()=>`e${++generation}`,now:sim.now});
let real=rooms.open('doc',html(initial())),handlers;
const transport={
 start(h){handlers=h;return()=>{};},
 fetchState:async(_id,since)=>structuredClone(rooms.state(real,'a',since)),
 send:async(id,frame)=>({status:200,body:rooms.apply(real,id,frame)}),
};
const room={transport:()=>transport,open:()=>handlers.open({clientId:'a'})};
const a=engine.makeTab(sim,room,'a',initial());
const inspect=label=>console.log(JSON.stringify({label,epoch:real.epoch,seq:real.seq,room:real.stores.get('page').value.blocks.i.caption,shown:find(a.editor.state.doc,'i').node.attrs.caption,mine:a.binding.blocks.get('i').mine,ownSent:a.binding.blocks.get('i').ownSent,heals:a.heals,notices:a.allNotices()}));
const restart=async(file)=>{handlers.close();rooms.drop('doc');real=rooms.open('doc',file);handlers.open({clientId:'a'});await sim.run(sim.now()+400);};
a.start();await sim.run(500);
const f=find(a.editor.state.doc,'i');a.editor.dispatch(a.editor.state.tr.setNodeMarkup(f.pos,null,{...f.node.attrs,caption:'mine'}));
await sim.run(800);inspect('own POST answered, echo delayed');
// A second editor saved the room's authoritative e1:1 state before A got its echo.
const file1=html(real.stores.get('page').value,real.epoch,real.seq);
rooms.fileWritten('doc',file1);
await restart(file1);inspect('restart from saved own value');
const peer=initial().blocks.i;peer.caption='peer';
rooms.apply(real,'b',{name:'page',n:1,ops:[{op:'set',path:['blocks','i'],value:peer}]});
// Its stream event is missed; a reconnect delivers real state.moves at e2:1.
if(process.argv[2] === 'frame') { const entry=real.stores.get('page').log.at(-1); handlers.frame({...entry,epoch:real.epoch,name:'page'}); } else { handlers.close();handlers.open({clientId:'a'}); }
await sim.run(1600);inspect('peer via state in new epoch');
assert.equal(real.stores.get('page').value.blocks.i.caption,'peer');
const file2=html(real.stores.get('page').value,real.epoch,real.seq);
rooms.fileWritten('doc',file2);
await restart(file2);await sim.run(4000);inspect('restart from saved peer value');
assert.equal(real.stores.get('page').value.blocks.i.caption,'peer');
a.binding.dispose();a.editor.destroy();a.lane.stop();
